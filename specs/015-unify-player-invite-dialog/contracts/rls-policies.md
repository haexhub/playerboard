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

**Behavior change** (research.md §3): when `player_id` is present, the handler now checks for an
existing open invitation (`accepted_at is null`) for that `player_id` *before* inserting:

- **Found** → `UPDATE invitations SET email = $email, token = <fresh token>, expires_at = default
  WHERE id = $found.id`, then send the magic-link email to `$email` as today. Returns
  `{ id: found.id }`.
- **Not found** → unchanged: stale-expired-by-email cleanup, then `INSERT`, then send mail. Returns
  `{ id: inserted.id }`.
- Mail-send failure: unchanged rollback behavior — on update path, nothing needs deleting (the
  invitation already existed); on insert path, the just-inserted row is deleted as today.

No change to the `409` for "this person is already a member of the team," nor to the `player_id`
↔ `team_id` ownership check.

## `POST /api/players/[player_id]/email` (trainer-only, `service_role`) — new

Mirrors `app/server/api/profile/moderate.post.ts`'s shape: verify the caller in Drizzle first,
then act with `serverSupabaseServiceRole`.

**Request body**: `{ team_id: uuid, email: string }`

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
- On success: `UPDATE players SET email = $email WHERE id = $player_id`, return `{ ok: true }`.
- On failure (e.g. `email` already belongs to another Auth user): do **not** touch
  `players.email`; propagate the Supabase error message with `409` if it indicates a conflict,
  else `500`. The trainer sees the error and the form keeps showing the previously saved email.
- Per-team email uniqueness (data-model.md) is enforced by the database constraint on the
  `players.email` write in the success path — a collision there surfaces as `409` from the
  `UPDATE`, same as any other unique-violation handling elsewhere in this codebase
  (`pgError`/`pgErrorCode` in `app/server/utils/pg-error.ts` / `app/utils/errors.ts`).

### Negative-test matrix addition

Alongside the existing `rls-negative-*` Playwright suites:

| # | Actor | Attempt | Expected |
|---|---|---|---|
| N1 | Player-role member | `POST /api/players/[id]/email` for any player | 403 (not a trainer) |
| N2 | Trainer of Team A | `POST /api/players/[id]/email` targeting a Team B player | 400 (player doesn't belong to `team_id`) |
| N3 | Trainer of the player's own team | `POST /api/players/[id]/email` for a not-yet-linked player | 400 (`linked_user_id` is null) |
| N4 | Trainer of the player's own team | `POST /api/players/[id]/email` to an address already used by another Auth user | 409 |
| N5 | Player-role member | `update players set email = ... where id <> <own linked player>` directly via PostgREST | Denied (RLS, `players_write_trainer`) |
