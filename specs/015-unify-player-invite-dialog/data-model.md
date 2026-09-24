# Phase 1 Data Model: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

One column is added to the existing `players` table (specs/001-points-and-photos), plus a small,
short-lived `player_email_change_requests` table for owner-confirmed linked-account changes. No
change to `invitations` beyond behavior (research.md §3) — its schema is untouched. The migration
must backfill known legacy addresses before creating the new unique index (see below).

## `players` (delta)

| Column | Type | Notes |
|---|---|---|
| `email` | `text`, nullable | New. The durable "email on file" for the player, independent of any `invitations` row. Set/edited by a trainer via the unified `PlayerForm`; never written by the invitation-acceptance flow. |

```ts
// db/schema/index.ts — inside the existing `players` pgTable definition
email: text('email'),
```

```ts
// same table's index list — new entry alongside players_active_jersey_per_team_uniq
uniqueIndex('players_email_per_team_uniq')
  .on(t.teamId, sql`lower(${t.email})`)
  .where(sql`${t.email} is not null`),
```

Mirrors `players_active_jersey_per_team_uniq` exactly (same team-scoping, same "only when set"
partial condition). No `active` condition on this index — unlike jersey numbers, an email should
stay unique per team regardless of whether the player is currently active, since re-activating a
deactivated player must not silently collide with a since-created player using the same address.

### Field semantics by `linked_user_id` state

| State | Meaning | Who writes `players.email` |
|---|---|---|
| `linked_user_id is null`, `email is null` | Never invited, no address on file. | — |
| `linked_user_id is null`, `email is not null` | Address on file, not yet accepted (or never invited). "Direkt einladen" checkbox is enabled. | Trainer, via `usePlayers().update()`/`.create()` (plain column write, RLS-gated). |
| `linked_user_id is not null` | Player has an accepted account. "Direkt einladen" is hidden/disabled — nothing left to invite. A valid, non-empty email is required because it is also the Auth login email. | A trainer creates an owner-confirmed change request; only the linked account owner can complete the Auth email change. The confirmation callback then updates `players.email`. Never written directly through `usePlayers().update()` once linked. |

This split is enforced client-side (`PlayerForm.vue` branches on `props.player?.linked_user_id`)
and at the write boundary. A database trigger rejects an `email` change on a linked player when
the request runs as the normal `authenticated` role, so a direct `usePlayers().update({ email })`
cannot desynchronize the Auth login email. The owner-confirmation callback uses the privileged
server path after Auth has completed the secure change.

## `player_email_change_requests`

Short-lived server-owned requests bridge the trainer's request and the account owner's
confirmation:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, primary key | Request identifier. |
| `player_id` | `uuid`, not null | References `players(id)` with cascade delete. |
| `linked_user_id` | `uuid`, not null | Snapshot of the linked Auth user; must match the player. |
| `requested_email` | `text`, not null | Normalized lower-case target address. |
| `token_hash` | `text`, unique, not null | One-time confirmation token hash; the raw token is never stored. |
| `expires_at` | `timestamptz`, not null | Short expiry, e.g. 30 minutes. |
| `confirmed_at` | `timestamptz`, nullable | Set once after Auth reports the new email as confirmed. |
| `created_at` | `timestamptz`, not null | Audit timestamp. |

RLS is enabled. The service route owns writes; an owner-scoped read policy may expose only the
owner's own pending request if the confirmation UI needs it. No trainer or player may write this
table directly.

The migration also adds a `players_linked_email_guard` trigger: when `linked_user_id` is not null,
an `email` change made by the normal `authenticated` role is rejected. The privileged confirmation
route performs the final synchronized write after verifying the owner confirmation.

## Migration/backfill

The generated migration must be hand-reviewed and ordered as follows:

1. Add nullable `players.email`.
2. Backfill each player from the current `auth.users.email` when `linked_user_id` is set; otherwise
   use the newest invitation for that `player_id`, preferring an open invitation over an accepted
   one. Normalize candidates with `lower(trim(...))`.
3. Only write a candidate when no other player in the same team has the same normalized address.
   Leave ambiguous legacy duplicates `NULL` and emit a clear migration log/notice for follow-up.
4. Create `players_email_per_team_uniq` after the backfill.

This preserves known addresses for existing data without making deployment dependent on arbitrary
resolution of historical duplicates. Newly created rows use the normal application paths below;
`InviteForm.vue` must pass its invitation email when it pre-creates a player row.

## `invitations` (behavior delta only, no schema change)

`POST /api/invitations/issue`'s existing per-`player_id` open-invitation lookup
(`invitations_player_open_uniq`) changes from "fail on conflict" to "update in place":

- **Before**: `INSERT` always attempted; a live open invitation for the same `player_id` throws
  `23505` → `409`.
- **After**: `SELECT id FROM invitations WHERE player_id = $1 AND accepted_at IS NULL LIMIT 1`
  inside the same transaction; if found, `UPDATE ... SET email = $2, token = $3, expires_at =
  default` on that row instead of inserting; if not found, `INSERT` as today. The
  stale-expired-invitation cleanup (`DELETE ... WHERE accepted_at IS NULL AND expires_at <= now()`)
  stays as a safety net for the non-`player_id` invite path (`InviteForm.vue` on
  `team/members.vue`), unchanged.

No new row shape, no new columns — `invitations.player_id`, `.email`, `.token`, `.expires_at` are
all pre-existing.

## RLS

`players.email` is read/written through the same `players_read_member` (select) /
`players_write_trainer` (all) policies already covering every other column on `players`; the
linked-email trigger closes the column-level invariant that row-scoped RLS cannot express. The new
request table has RLS enabled with an owner-scoped read policy and no client write policy. See
[contracts/rls-policies.md](./contracts/rls-policies.md) for the invitation route and the
owner-confirmed email-change routes that need `service_role` on the server.
