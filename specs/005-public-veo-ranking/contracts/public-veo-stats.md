# Contract: Public Anonymous Veo Season Stats

**Feature**: 005-public-veo-ranking
**Spec reference**: FR-003..FR-011, US1, US2, SC-001..SC-006
**Route**: same public page as the existing ranking (`GET /public/<slug>/ranking`,
Veo-Stats tab) — no new page route
**RPC**: `supabase.rpc('get_public_veo_stats', { p_slug: string })`

Serves the current-season Veo player stats for the given team slug to
unauthenticated visitors, gated by both the internal Veo enablement
(`veo_team_mappings.enabled`) and the new public-opt-in
(`veo_team_mappings.public_stats_enabled`, default `false`). No PII (names,
internal player/team/user IDs, per-match breakdown) leaves the database —
see [data-model.md](../data-model.md) for the full projection.

## Output shape

```ts
type PublicVeoStatsRow = {
  jersey_number: number | null // null => rendered as "—", same convention as the points ranking
  stats: Record<string, number> // key = curated stat_type; absent key = not reported for this player (never fabricated as 0)
}

type PublicVeoStats = {
  enabled: boolean // false => Veo tab renders its empty/absent state; true => rows (possibly []) are meaningful
  season_start: string // ISO date, echoed
  rows: PublicVeoStatsRow[]
  not_found?: boolean // unknown slug
}
```

Notes:

- `enabled: false` covers three distinct spec conditions the client does not
  need to distinguish: team not Veo-enabled at all, Veo-enabled but public
  stats not opted in, or unknown slug with an otherwise-valid shape (unknown
  slug instead sets `not_found: true` and `enabled: false`). The page's only
  job is: if `!enabled`, don't render the Veo tab (FR-005).
- `rows: []` with `enabled: true` is the legitimate "no data yet" /
  "no matches since season_start" empty state (FR-008) — rendered as an
  empty-state message, not an error.
- `stats` keys are the nine curated `stat_type` values from
  [004-veo-player-analytics](../../004-veo-player-analytics/spec.md)
  FR-001/FR-008 (distance, sprints, max/avg speed, high-intensity runs,
  minutes played, shots, goals, goal involvements) — same curated set, no
  raw Veo fields.
- Rows are ordered by `jersey_number asc nulls last` (no "rank" concept
  across heterogeneous metrics like distance vs. goals — unlike the points
  ranking, there is no single ranking score here).

## Postgres implementation sketch

```sql
create or replace function public.get_public_veo_stats(
  p_slug text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_season_start date;
  v_enabled boolean;
  v_rows jsonb;
begin
  select t.id, ts.season_start into v_team_id, v_season_start
    from public.teams t
    join public.team_settings ts on ts.team_id = t.id
   where t.slug = p_slug;

  if v_team_id is null then
    return jsonb_build_object(
      'enabled', false, 'season_start', null, 'rows', '[]'::jsonb,
      'not_found', true
    );
  end if;

  select coalesce(vtm.enabled, false) and coalesce(vtm.public_stats_enabled, false)
    into v_enabled
    from public.veo_team_mappings vtm
    where vtm.team_id = v_team_id;

  if not coalesce(v_enabled, false) then
    return jsonb_build_object(
      'enabled', false, 'season_start', v_season_start, 'rows', '[]'::jsonb
    );
  end if;

  -- Aggregate veo_player_match_stats (player_id is not null) joined to
  -- veo_matches (played_at >= season_start, team-scoped) and players
  -- (active, current jersey_number) — see data-model.md for the exact
  -- grouping/pivot. Only jersey_number and the stats object are projected;
  -- player_id itself never appears in v_rows.

  return jsonb_build_object(
    'enabled', true,
    'season_start', v_season_start,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

alter function public.get_public_veo_stats(text) owner to public_ranking_reader;
revoke all on function public.get_public_veo_stats(text) from public, service_role;
grant execute on function public.get_public_veo_stats(text) to anon, authenticated;
```

Reuses `public_ranking_reader` (see research.md §2) rather than a second
role — the migration only needs to add the extra column grants listed in
[data-model.md](../data-model.md) before `create function`.

## Not exposed via this contract

- `player_id`, player names, `linked_user_id`, team `id`.
- Per-match Veo breakdown, `veo_jersey_number` (historical, per-match — see
  research.md §5), `matched_manually`.
- Any stat for a match before `season_start`.
- Any data at all while either gate (`enabled` or `public_stats_enabled`) is
  off.
- Other teams' data (function takes exactly one slug).

## Verified by

- New Playwright coverage alongside the existing `public-anon.spec.ts` /
  `rls-negative-cross-team.spec.ts` (US5-equivalent acceptance scenarios for
  this feature, plus the opt-in toggle's negative case — non-trainer cannot
  flip `public_stats_enabled`).

## Rate limiting

Not enforced in v1, same deferred decision as `get_public_ranking`
([001's contract](../../001-points-and-photos/contracts/public-ranking.md)).
