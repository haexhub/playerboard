# RLS Policies: Veo-Spieler-Statistiken

Reuses the existing `public.is_member(team_id)` and
`public.is_veo_enabled(team_id)` helpers unchanged from
[003-veo-analytics/contracts/rls-policies.md](../../003-veo-analytics/contracts/rls-policies.md).
No new helper function. One new table, one new policy.

## `veo_player_match_stats`

Assigned stats are readable by any member of the team (trainer or player —
FR-007 makes this an explicit, deliberate choice). Raw rows without a
`player_id` are correction data and are readable by trainers only (FR-011):

| Policy | Operation, Role | Using |
|---|---|---|
| `veo_player_match_stats_read_member` | select, `authenticated` | `public.is_member((select team_id from veo_matches where id = match_id)) and public.is_veo_enabled((select team_id from veo_matches where id = match_id)) and (player_id is not null or public.is_trainer((select team_id from veo_matches where id = match_id)))` |

No `insert`/`update`/`delete` policy for `authenticated` — only
`service_role` (via `useAdminDb()`, from `POST /api/veo/sync`) writes, same
boundary as `veo_matches`/`veo_match_stats`/`veo_sync_status`.

Equivalent SQL:

```sql
create policy veo_player_match_stats_read_member on public.veo_player_match_stats
  for select to authenticated
  using (
    public.is_member(
      (select team_id from public.veo_matches where id = match_id)
    )
    and public.is_veo_enabled(
      (select team_id from public.veo_matches where id = match_id)
    )
    and (
      player_id is not null
      or public.is_trainer(
        (select team_id from public.veo_matches where id = match_id)
      )
    )
  );
```

## Why no per-player restriction

FR-007 explicitly requires every team member to see every *assigned* player's
stats, not just their own — the same all-or-nothing-per-team gate as
`veo_match_stats`, not a per-row ownership check like `point_entries`. Raw
unassigned rows are the exception required by FR-011: they remain visible to
trainers for correction but never become player-facing data.

## `POST /api/veo/sync` writes

No new authentication surface. The route's existing bearer-secret check
(`runtimeConfig.veoSyncSecret`, see
[003-veo-analytics/research.md §2](../../003-veo-analytics/research.md#2-authenticating-the-cron-caller))
covers this table's writes too — same route, same transaction as the
existing `veo_matches`/`veo_match_stats` upsert. The sync sets `player_id`
only on insert and preserves it on conflict; it also reserves existing
match-level assignments before inserting new jersey-number groups
(research.md §10). This is application logic inside the
`useAdminDb()`-authorized route, not a distinct RLS concern.

## `POST /api/veo/matches/[matchId]/player-assignment` (User Story 3, added 2026-09-23)

Lets a trainer set or correct which player a jersey number is attributed to
for one match. Requires a real Supabase session
(`serverSupabaseUser(event)`) and authorizes with the same explicit
`requireTrainer(useAdminDb(), team_id, userId)` check `POST /api/veo/link`
already uses (FR-014) — not an RLS policy, because the write must only ever
touch `player_id`/`matched_manually`, never `value`/`category`/`stat_type`,
and Postgres RLS policies cannot restrict which columns an `update`
statement is allowed to touch (research.md §11). `veo_player_match_stats`
therefore gets **no** `insert`/`update`/`delete` RLS policy for
`authenticated` — the route writes via `useAdminDb()`, which bypasses RLS
entirely, same trust boundary as `POST /api/veo/sync` and
`POST /api/veo/link`.

Request body: `{ team_id, match_id, veo_jersey_number, player_id }`. The
route validates that `match_id` belongs to `team_id` and that `player_id`
(when not `null`, for the "clear a wrong assignment" case) belongs to the
same team. It then, in one transaction: (1) clears (`player_id = null`,
`matched_manually = true`) any other jersey number's rows in the same match
currently carrying that `player_id` (FR-016, research.md §14), and (2)
updates every `veo_player_match_stats` row sharing
`(match_id, veo_jersey_number)` to the new `player_id` /
`matched_manually = true`.

## Negative-test matrix

| # | Actor | Attempt | Expected | Covered by |
|---|---|---|---|---|
| P1 | Member of a team with no `veo_team_mappings` row (or `is_veo_enabled` false) | `select from veo_player_match_stats` for that team's matches | Empty | `veo-analytics-flow.spec.ts` |
| P2 | Any authenticated, non-service-role caller | `insert`/`update`/`delete` on `veo_player_match_stats` directly via PostgREST | Denied | `rls-negative-single-team.spec.ts` |
| P3 | Player (non-trainer) of the mapped team | `select` assigned and unassigned rows in `veo_player_match_stats` | Assigned rows allowed for all team members; unassigned rows empty for players and visible to trainers (FR-007, FR-011) | `rls-negative-single-team.spec.ts`, `veo-analytics-flow.spec.ts` |
| P4 | Player (non-trainer) of the mapped team | `POST /api/veo/matches/[matchId]/player-assignment` for that team | 403 (FR-014) | `rls-negative-single-team.spec.ts` |
| P5 | Trainer of team A | `POST /api/veo/matches/[matchId]/player-assignment` for a match belonging to team B | Denied | `rls-negative-cross-team.spec.ts` |
| P6 | Unauthenticated caller | `POST /api/veo/matches/[matchId]/player-assignment` | 401 | `api-negative.spec.ts` |
