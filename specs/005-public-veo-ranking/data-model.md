# Phase 1 Data Model: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

One schema change (a new column on an existing table) plus one new
`security definer` function. Reuses `veo_player_match_stats` exactly as
specified in [004's data-model.md](../004-veo-player-analytics/data-model.md)
— see research.md §1 for the sequencing dependency this implies.

## Schema change: `veo_team_mappings.public_stats_enabled`

| Column | Type | Notes |
|---|---|---|
| `public_stats_enabled` | `boolean`, not null, `default false` | Trainer-controlled, per-team. Independent of `enabled` (the existing internal Veo-sync gate). Both `enabled = true` and `public_stats_enabled = true` are required for `get_public_veo_stats` to return non-empty data (research.md §4). |

No new RLS policy: `veo_team_mappings_read_trainer`/`_write_trainer`/
`_update_trainer` (`20260922200000_veo_trainer_self_service.sql`) already
cover `select`/`insert`/`update` for `is_trainer(team_id)` on the whole row,
this column included.

## New function: `public.get_public_veo_stats(p_slug text)`

Returns a per-jersey-number season aggregate, or an empty/gated shape when
either gate in FR-005 is off. `security definer`, owned by the existing
`public_ranking_reader` role (research.md §2) — no new Postgres role.

**Additional column grants needed for `public_ranking_reader`** (beyond what
`20260915170000_public_ranking.sql` already grants):

| Table | Columns | Why |
|---|---|---|
| `teams` | `season_start` (in addition to the already-granted `id, name, slug`) | Season boundary (research.md §3) |
| `veo_team_mappings` | `team_id, enabled, public_stats_enabled` | Gate check (FR-005) |
| `veo_matches` | `id, team_id, played_at` | Season-bounded match scoping |
| `veo_player_match_stats` | `match_id, player_id, stat_type, value` | The stats themselves; `player_id is not null` only (FR-009); no `veo_jersey_number` grant needed — not displayed publicly (research.md §5) |

`players(id, team_id, jersey_number, active)` is already granted from
`20260915170000_public_ranking.sql` and is reused as-is for the current
roster jersey-number lookup.

### Logic

1. Resolve `team_id` from `p_slug`; `not_found: true` shape (same as
   `get_public_ranking`) if no team matches.
2. Gate: if not (`veo_team_mappings.enabled` and `public_stats_enabled` for
   this `team_id`), return the same shape with `enabled: false` and empty
   `rows` — this is not an error state (FR-005/FR-008), the page simply
   doesn't render the Veo tab.
3. Otherwise: join `veo_player_match_stats` (`player_id is not null`) →
   `veo_matches` (`played_at >= teams.season_start`, `team_id` scoped) →
   `players` (`active`, for the current `jersey_number`); `sum(value)` grouped
   by `(player_id, stat_type)`; pivot to one row per `player_id` with a
   `stats` object keyed by `stat_type`; project only `jersey_number` and
   `stats` — never `player_id` — in the returned rows (FR-007).
4. A `stat_type` with zero contributing rows for a player is simply absent
   from that player's `stats` object (FR-010) — never fabricated as `0`,
   mirrored from `get_public_ranking`'s existing `scores` pattern (which
   *does* default to `0` for points, a deliberate difference: point
   categories are complete-by-definition once active, curated Veo stats are
   not, per 003/004's non-fabrication rule).

### Output shape

```ts
type PublicVeoStatsRow = {
  jersey_number: number | null // null => "—", same convention as PublicRankingRow
  stats: Record<string, number> // key = one of the 9 curated stat_type values; absent = not reported
}

type PublicVeoStats = {
  enabled: boolean // false => FR-005 gate closed; page renders no Veo tab
  season_start: string // ISO date, echoed for display ("seit DD.MM.")
  rows: PublicVeoStatsRow[]
  not_found?: boolean // team slug didn't resolve
}
```

## Relationships

```
teams 1──* veo_team_mappings (existing, +public_stats_enabled)
veo_matches (existing) 1──* veo_player_match_stats (004, unimplemented) *──0..1 players (existing)
```

No new tables. No new foreign keys. The only genuinely new persisted state
is the one boolean column.
