# Contract: RLS Delta & Invite/Email Routes — Einheitlicher Spieler-Dialog

Delta against [specs/001-points-and-photos/contracts/rls-policies.md](../../001-points-and-photos/contracts/rls-policies.md).

## `players`

No policy change. `players.email` (new column, data-model.md) is covered by the existing:

```sql
-- unchanged, from supabase/migrations/20260910122400_rls_players.sql
create policy players_read_member on public.players
  for select to authenticated
  using (public.is_member(team_id));

create policy players_write_trainer on public.players
  for all to authenticated
  using (public.is_trainer(team_id))
  with check (public.is_trainer(team_id));
```

Both are row-scoped, not column-scoped, so no migration is needed on the policy side — only the
Drizzle-generated column + index migration from data-model.md.

## `POST /api/invitations/issue` (trainer-only, `service_role`) — behavior change only

Same authorization and request shape as today (unchanged):

**Request body**: `{ team_id: uuid, email: string, role: 'trainer' | 'player', player_id?: uuid }`

**Authorization** (unchanged): caller MUST have a `memberships` row for `team_id` with
`role = 'trainer'` (`requireTrainer`), else `403`.

**Behavior change** (research.md §3): when `player_id` is present, the handler now locks the
player row and checks for an existing open invitation (`accepted_at is null`) for that `player_id`
*before* inserting. The row lock serializes concurrent resend requests for the same player:

- **Found** → `UPDATE invitations SET email = $email, token = <fresh token>, expires_at = default
  WHERE id = $found.id`, then send the magic-link email to `$email` as today. Returns
  `{ id: found.id }`.
- **Not found** → unchanged: stale-expired-by-email cleanup, then `INSERT`, then send mail. Returns
  `{ id: inserted.id }`.
- Mail-send failure: on the insert path, the just-inserted row is deleted as today. On the update
  path, the previous `email`, `token`, `expires_at` (and other changed fields) are restored before
  returning the mail error; the existing invitation must remain usable after a failed resend.

No change to the `409` for "this person is already a member of the team," nor to the `player_id`
↔ `team_id` ownership check.

## `POST /api/players/[player_id]/email` (trainer-only, `service_role`) — new

Mirrors `app/server/api/profile/moderate.post.ts`'s shape: verify the caller in Drizzle first,
then act with `serverSupabaseServiceRole`.

**Request body**: `{ team_id: uuid, email: string }`

The route applies the same validation as `/api/invitations/issue`: trim, lowercase, and require a
valid non-empty email before any write.

**Authorization** (both MUST hold, else the stated error):
1. Caller has a `memberships` row for `team_id` with `role = 'trainer'` (`requireTrainer`) → `403`.
2. `player_id` belongs to `team_id` → `400` (same check `issue.post.ts` already does for its own
   `player_id`).
3. The player's `linked_user_id` is not null → `400` ("player is not linked to an account"). This
   route is only ever called by the client for already-linked players (data-model.md); a
   not-yet-linked player's email is written directly through `usePlayers().update()` instead.

**Behavior**:
- Calls `serverSupabaseServiceRole<Database>(event).auth.admin.updateUserById(linked_user_id, {
  email, email_confirm: true })`.
- Before changing Auth, check that no other player in `team_id` already owns the normalized email;
  return `409` for a collision.
- After Auth succeeds, run `UPDATE players SET email = $email WHERE id = $player_id`, return
  `{ ok: true }` only after both changes succeed.
- If the Auth update fails (e.g. `email` already belongs to another Auth user), do **not** touch
  `players.email`; propagate the Supabase error message with `409` if it indicates a conflict,
  else `500`.
- If the database update fails despite the preflight (for example, a concurrent unique conflict),
  restore the Auth user's previous email before returning the error. The player row and Auth record
  must either both contain the new address or both retain the old address; log and return `500` if
  compensation itself fails.
- The trainer sees the error and the form keeps showing the previously saved email. Unique
  violations use the existing `pgError`/`pgErrorCode` handling in
  `app/server/utils/pg-error.ts` / `app/utils/errors.ts`.

### Negative-test matrix addition

Alongside the existing `rls-negative-*` Playwright suites:

| # | Actor | Attempt | Expected |
|---|---|---|---|
| N1 | Player-role member | `POST /api/players/[id]/email` for any player | 403 (not a trainer) |
| N2 | Trainer of Team A | `POST /api/players/[id]/email` targeting a Team B player | 400 (player doesn't belong to `team_id`) |
| N3 | Trainer of the player's own team | `POST /api/players/[id]/email` for a not-yet-linked player | 400 (`linked_user_id` is null) |
| N4 | Trainer of the player's own team | `POST /api/players/[id]/email` to an address already used by another Auth user | 409 |
| N5 | Player-role member | `update players set email = ... where id <> <own linked player>` directly via PostgREST | Denied (RLS, `players_write_trainer`) |
| N6 | Trainer of the player's own team | `POST /api/players/[id]/email` with an empty or malformed email | 400; Auth and `players.email` unchanged |
