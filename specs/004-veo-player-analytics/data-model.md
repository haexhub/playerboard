# Phase 1 Data Model: Veo-Spieler-Statistiken

One new table, following the same conventions as 003-veo-analytics'
`veo_match_stats` (composite PK for idempotent upserts, no `team_id` column —
team scoping resolves via `match_id` → `veo_matches.team_id`, exactly like
`veo_match_stats` already does). Sync inserts and refreshes Veo-controlled
stat values via `POST /api/veo/sync` and `useAdminDb()`; the trainer-only
assignment route is the only path allowed to change an existing assignment.

## `veo_player_match_stats`

One row per match × Veo-reported jersey number × curated stat type
(research.md §3). Identity is Veo's own jersey number, not a Playerboard
player — `player_id` is a resolved/overridable attribute, set automatically
at sync time or manually by a trainer (User Story 3, research.md §10).

| Column | Type | Notes |
|---|---|---|
| `match_id` | `uuid` FK → `veo_matches.id`, `on delete cascade` | part of PK |
| `veo_jersey_number` | `integer`, not null | the jersey number Veo reported for this match; part of PK. Stored regardless of whether it currently resolves to a roster player (FR-011) |
| `stat_type` | `text` | one of the nine curated Veo `type` keys (research.md §3); part of PK |
| `player_id` | `uuid` FK → `players.id`, `on delete set null`, nullable | the Playerboard player this jersey number is attributed to for this match — set by the initial sync insert when the active roster resolves the number, or by a trainer assignment; `null` if unmatched or explicitly cleared. It is preserved unchanged on later upserts for the same jersey-number group. Never displayed while `null` (FR-002/SC-004) |
| `matched_manually` | `boolean`, not null, `default false` | a jersey-number-level assignment flag, repeated on every stat row for that `(match_id, veo_jersey_number)` group; `true` once a trainer has set/changed or cleared `player_id` via `POST /api/veo/matches/[matchId]/player-assignment` (research.md §11). It is preserved on conflict; the sync only sets `player_id` on a new group (FR-013) |
| `category` | `text`, not null | Veo's category grouping for this stat, stored as-is (mirrors `veo_match_stats.category`) |
| `value` | `double precision`, not null | curated stats mix integer counts (goals, sprints) and decimals (speeds, distance) — one column covers both, matching Veo's own untyped numeric value |
| `created_at` | `timestamptz`, `defaultNow()` | |
| `updated_at` | `timestamptz`, `defaultNow()` | bumped on every sync upsert and every manual correction |

**Primary key**: `(match_id, veo_jersey_number, stat_type)` — enforces
FR-009 (no duplicate/contradictory rows on repeated or overlapping sync) at
the schema level; upsert via
`ON CONFLICT (match_id, veo_jersey_number, stat_type) DO UPDATE`, with
`player_id` set only on insert and preserved on conflict (research.md §10) —
`on delete set null` on `player_id`'s FK (not `cascade`) so deleting a
`players` row un-assigns the stat instead of deleting historical Veo data.

**Index**: `veo_player_match_stats_player_idx` on `player_id` — supports the
season-summary read pattern (research.md §6), which fetches all of a
player's rows across matches.

**No `period_values` column** — unlike `veo_match_stats`, no per-half
breakdown is required for player stats (research.md §7).

**Invariant: at most one jersey number per player per match (FR-016)** — not
expressed as a database constraint (the PK's per-stat-type multiplicity
makes a simple `unique(match_id, player_id)` index incorrect; see
research.md §14 for why a schema split was rejected). The logical
assignment is at jersey-number level even though it is repeated across the
stat rows. The sync reserves existing assignments before mapping a new
jersey-number group and does not assign a player already claimed by another
jersey number. The trainer route serializes its clear-and-set operation,
first clearing (`player_id = null`, `matched_manually = true`) that same
player's rows under any other jersey number in the match.

**Validation / non-fabrication rules**:
- A Veo-reported jersey number with no matching **active** player in the
  team's roster is still persisted, with `player_id = null` (FR-011) — never
  displayed until a trainer assigns it (FR-002, SC-004).
- Only the nine curated `stat_type`s are stored (FR-008); any other `type`
  Veo returns for a jersey number is dropped during mapping.
- A curated stat type Veo does not report for a given jersey number in a
  given match is simply absent — never fabricated as zero (spec.md Edge
  Cases, same rule as `veo_match_stats`).

**RLS**: `select` for `authenticated`, gated by team membership and
`public.is_veo_enabled(team_id)` resolved via `match_id` — same shape as
`veo_match_stats_read_member` (see
[contracts/rls-policies.md](./contracts/rls-policies.md)). No
`insert`/`update`/`delete` policy for `authenticated` — `service_role` (via
`useAdminDb()`) writes from the sync route, and a trainer's manual
correction goes through `POST /api/veo/matches/[matchId]/player-assignment`
(also `useAdminDb()`, authorized by an explicit `requireTrainer()` check,
not RLS — research.md §11, same reasoning as `veo_sync_credentials`'s
write path in 003-veo-analytics).

## Relationships

```
veo_matches (existing) 1──* veo_player_match_stats *──0..1 players (existing)
```

`veo_player_match_stats.player_id` is the only new foreign-key relationship
this feature introduces, and it is optional (a row can exist unassigned).
`veo_matches`, `veo_team_mappings`, `veo_sync_credentials`, and
`veo_sync_status` are all unchanged from 003-veo-analytics.
