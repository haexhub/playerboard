# Phase 1 Data Model: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

One column added to the existing `players` table (specs/001-points-and-photos). No new tables. No
change to `invitations` beyond behavior (research.md §3) — its schema is untouched.

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
| `linked_user_id is not null` | Player has an accepted account. "Direkt einladen" is hidden/disabled — nothing left to invite. | Trainer, via the new `POST /api/players/[player_id]/email` route only (keeps the Auth login email and this column in sync — see contracts/rls-policies.md). Never written directly through `usePlayers().update()` once linked. |

This split is enforced client-side (`PlayerForm.vue` branches on `props.player?.linked_user_id`)
and server-side by the new route only ever being called for the linked case; a direct
`usePlayers().update({ email })` call for a linked player would still succeed under RLS (the
policy is column-agnostic) but would desynchronize `players.email` from the real login email, so
the client simply never does that once `linked_user_id` is set.

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

No new policy. `players.email` is read/written through the same `players_read_member` (select) /
`players_write_trainer` (all) policies already covering every other column on `players` — both are
`for all`/`for select` on the whole row, not column-scoped. See
[contracts/rls-policies.md](./contracts/rls-policies.md) for the two route contracts that need
`service_role` instead (the idempotent `issue.post.ts` and the new email-correction route).
