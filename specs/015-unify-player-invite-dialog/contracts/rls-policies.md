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

Both are row-scoped, not column-scoped, so no policy change is needed for `players`; the migration
also adds the request table's RLS policies and the linked-email write-boundary trigger described in
data-model.md.

## `POST /api/invitations/issue` (trainer-only, `service_role`) — behavior change only

Same authorization and request shape as today (unchanged):

**Request body**: `{ team_id: uuid, email: string, role: 'trainer' | 'player', player_id?: uuid }`

**Authorization** (unchanged): caller MUST have a `memberships` row for `team_id` with
`role = 'trainer'` (`requireTrainer`), else `403`.

**Behavior change** (research.md §3): when `player_id` is present, the handler now locks the
player row and checks for an existing open invitation (`accepted_at is null`) for that `player_id`
*before* inserting. The row lock serializes concurrent resend requests for the same player:

- Inside that lock, normalize the request email and compare it with the current
  `players.email`. A missing stored email or mismatch returns `409` and sends no mail; the handler
  must never trust a stale email copied from a previously loaded roster row.

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

## `POST /api/players/[player_id]/email` (trainer-only, request phase) — new

Mirrors `app/server/api/profile/moderate.post.ts`'s authorization shape: verify the caller in
Drizzle first, then use the privileged server database only to create a pending request. This
route MUST NOT call `auth.admin.updateUserById` and MUST NOT change the Auth email.

**Request body**: `{ team_id: uuid, email: string }`

The route applies the same validation as `/api/invitations/issue`: trim, lowercase, and require a
valid non-empty email before any write.

**Authorization** (all MUST hold, else the stated error):
1. Caller has a `memberships` row for `team_id` with `role = 'trainer'` (`requireTrainer`) → `403`.
2. `player_id` belongs to `team_id` → `400`.
3. The player's `linked_user_id` is not null → `400`.

**Behavior**:
- Acquire the linked-user advisory lock before loading the current Auth/player email and checking
  per-team uniqueness. This lock spans request creation and prevents two trainer requests for the
  same linked account from interleaving.
- If another player in `team_id` already owns the normalized email, return `409`.
- Create a short-lived, one-time `player_email_change_requests` row and return
  `{ status: 'confirmation_required', request_id }`. The previous Auth and player emails remain
  unchanged.
- The request is visible only to the linked account owner. The trainer receives a pending status,
  never an Auth token or a direct Auth mutation capability.

## `POST /api/players/[player_id]/email/confirm` (linked account owner) — new

The linked account owner invokes this route after completing Supabase's secure email-change flow
with the normal authenticated client (`auth.updateUser({ email })`). Secure email change MUST be
configured so the current and new addresses are confirmed before the Auth email changes; an admin
update with `email_confirm: true` is explicitly forbidden here.

**Request body**: `{ request_id: uuid }`

**Authorization**: the authenticated caller MUST be the request's `linked_user_id`; trainers are
not sufficient unless they are also that account owner → `403`.

**Behavior**:
- Acquire the same linked-user advisory lock and load the unexpired, unconfirmed request.
- Verify the caller's current Auth email equals the normalized `requested_email`. If confirmation
  is incomplete, return `409` and leave `players.email` unchanged.
- Update `players.email` and mark the request `confirmed_at` in one database transaction. The
  privileged route is the only allowed write path past the linked-email trigger.
- Return `{ ok: true }`. Expired or already-used requests return `409` without changing anything.

### Negative-test matrix addition

Alongside the existing `rls-negative-*` Playwright suites:

| # | Actor | Attempt | Expected |
|---|---|---|---|
| N1 | Player-role member | `POST /api/players/[id]/email` for any player | 403 (not a trainer) |
| N2 | Trainer of Team A | `POST /api/players/[id]/email` targeting a Team B player | 400 (player doesn't belong to `team_id`) |
| N3 | Trainer of the player's own team | `POST /api/players/[id]/email` for a not-yet-linked player | 400 (`linked_user_id` is null) |
| N4 | Trainer of the player's own team | `POST /api/players/[id]/email` to an address already used by another Auth user | 409 after owner confirmation; no Auth/player change before then |
| N5 | Player-role member | `update players set email = ... where id <> <own linked player>` directly via PostgREST | Denied (RLS, `players_write_trainer`) |
| N6 | Trainer of the player's own team | `POST /api/players/[id]/email` with an empty or malformed email | 400; Auth and `players.email` unchanged |
| N7 | Trainer of the player's own team | Direct PostgREST update of `players.email` for a linked player | Denied by the linked-email write-boundary trigger |
| N8 | Trainer A and trainer B | Concurrent linked-email requests for the same linked user | Serialized by advisory lock; no Auth/player divergence |
