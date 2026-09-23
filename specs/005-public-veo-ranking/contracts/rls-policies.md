# RLS Policies: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

No new RLS policy is required by this feature. It adds one column to an
already-covered table and one `security definer` function that bypasses RLS
by design (same pattern as `get_public_ranking`, see
[001's contract](../../001-points-and-photos/contracts/rls-policies.md) and
research.md §2 of this feature).

## `veo_team_mappings.public_stats_enabled`

Already covered by the existing trainer-scoped policies
(`20260922200000_veo_trainer_self_service.sql`):

| Policy | Operation, Role | Using / With Check |
|---|---|---|
| `veo_team_mappings_read_trainer` | select, `authenticated` | `public.is_trainer(team_id)` |
| `veo_team_mappings_write_trainer` | insert, `authenticated` | with check: `public.is_trainer(team_id)` |
| `veo_team_mappings_update_trainer` | update, `authenticated` | using/with check: `public.is_trainer(team_id)` |

No column-level restriction exists on this table for `authenticated` — a
trainer's own row is fully readable/writable by them already, this column
included. A player (non-trainer) of the same team has no `select`/`update`
policy match at all (same as every other column here) — their attempt to
change `public_stats_enabled` is denied at the RLS layer, not merely hidden
in the UI (FR-004).

## `get_public_veo_stats(text)`

`security definer`, owned by `public_ranking_reader` (an existing
`nologin bypassrls` role — RLS on the underlying tables does not apply to
it at all; its access is bound by the narrow column `grant`s listed in
[data-model.md](../data-model.md) instead, exactly like `get_public_ranking`
already works). `revoke all ... from public, service_role` +
`grant execute ... to anon, authenticated` — same grant shape as
`get_public_ranking`.

## Negative-test matrix (additions to the existing suite)

| # | Actor | Attempt | Expected | Covered by |
|---|---|---|---|---|
| W1 | Player (non-trainer) of the mapped team | `update veo_team_mappings set public_stats_enabled = true` for their own team | Denied | `rls-negative-single-team.spec.ts` |
| W2 | Trainer of team A | `update veo_team_mappings set public_stats_enabled = true` for team B's `team_id` | Denied (existing `is_trainer(team_id)` check already covers this — no new row, just confirms the existing policy also gates this column) | `rls-negative-cross-team.spec.ts` |
| W3 | Anonymous caller | `select` directly against `veo_team_mappings`, `veo_player_match_stats`, or `veo_matches` (bypassing the RPC) | Denied/empty — `anon` has no policy on any of these tables, only `execute` on the two `get_public_*` functions | `rls-negative-cross-team.spec.ts` |
| W4 | Anonymous caller | `get_public_veo_stats(p_slug)` for a team with `enabled = true, public_stats_enabled = false` | `{ enabled: false, rows: [] }` — no stats, no error | `public-anon.spec.ts` |
| W5 | Anonymous caller | `get_public_veo_stats(p_slug)` for a team with both gates `true` | Rows matching the seeded `veo_player_match_stats`, current `jersey_number` only, no `player_id`/name anywhere in the response | `public-anon.spec.ts` |
