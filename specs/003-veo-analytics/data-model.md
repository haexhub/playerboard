# Phase 1 Data Model: Veo-Kamera-Analytics

Five new tables, following this repo's existing Drizzle conventions (uuid or
natural-key PK per shape, `team_id` FK + index on team-scoped tables,
`timestamp with time zone` columns). The sync route uses `useAdminDb()` for
read access to all five. Since 2026-09-22 (see spec.md's Clarifications), a
trainer can self-serve linking their team to Veo via
`POST /api/veo/login` + `POST /api/veo/link`, instead of a deployment
operator seeding rows by hand. `veo_team_mappings` gets `is_trainer`-gated
RLS policies for this (`select`/`insert`/`update`, genuinely used by direct
PostgREST callers and enforced as such). `veo_sync_credentials` stays fully
`useAdminDb()`-only — its RLS can't cover an upsert without a `select`
policy, which this table must never have (see
[contracts/rls-policies.md](./contracts/rls-policies.md)) — so
`POST /api/veo/link` writes it via an explicit trainer-role check instead.
None of the five carry `created_by`/`last_updated_by` audit columns: the
analytics/status tables have no app-level author, and `veo_team_mappings`
records "who" implicitly through `team_id` + RLS rather than a column.

## `veo_team_mappings`

One row per Playerboard team explicitly enabled for Veo sync (User Story 4 /
FR-011). Since 2026-09-22, the trainer of the team creates/updates this row
themselves via `POST /api/veo/link`, after picking their real Veo club/team
from the list `POST /api/veo/login` returns — no manual SQL, no
platform-admin step. Absence of a row for a team means that team has no Veo
access at all — this remains the enforcement point for "no team sees Veo
data without an explicit, authenticated action." See
[research.md §5](./research.md#5-team-mapping-veo-team--playerboard-team)
for why this is a table (not `runtimeConfig`) and for how the self-service
flow superseded the original manual-SQL sequencing.

| Column | Type | Notes |
|---|---|---|
| `team_id` | `uuid` PK, FK → `teams.id`, `on delete cascade` | the Playerboard team being granted access |
| `veo_club_slug` | `text`, not null | e.g. `tsv-ifa-chemnitz` — chosen from the picker, never typed |
| `veo_team_slug` | `text`, not null | e.g. `c-junioren-cec9ec43` — chosen from the picker, never typed |
| `enabled` | `boolean`, not null, `default true` | the sync route skips disabled rows entirely; always `true` on write from the linking flow (there is no in-app disable action yet — re-linking overwrites the row instead) |
| `created_at` | `timestamptz`, `defaultNow()` | |
| `updated_at` | `timestamptz`, `defaultNow()` | |

**RLS**: `select`, `insert`, `update` for `authenticated` gated by
`public.is_trainer(team_id)` — a trainer can read/write only their own
team's row, never another team's. No `delete` policy (re-linking upserts
instead of deleting). The three analytics-table read policies still also
require an enabled mapping through the `public.is_veo_enabled`
security-definer helper.

## `veo_matches`

One row per Veo match synced for the team.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | |
| `team_id` | `uuid` FK → `teams.id`, `on delete cascade`, indexed | fixed to the single configured team for v1 |
| `veo_match_id` | `text`, **unique** | Veo's own match identifier (e.g. `e7730b08-...`) — the idempotency key |
| `played_at` | `timestamptz`, not null | match kickoff time, from Veo |
| `opponent_name` | `text`, not null | |
| `own_score` | `integer`, not null | only persisted after Veo reports a completed result |
| `opponent_score` | `integer`, not null | |
| `home_or_away` | `text`, `check in ('home','away')` | |
| `created_at` | `timestamptz`, `defaultNow()` | first synced |
| `last_synced_at` | `timestamptz`, `defaultNow()` | updated on every upsert |

**Validation**: both `own_score` and `opponent_score` are required. The sync
route defers the insert until Veo reports completed analytics and both scores
are present; an incomplete match is skipped and retried on the next run per
FR-007.

## `veo_match_stats`

One row per match × team-association × stat type — the per-category values
shown in User Story 1 (attacking/set-pieces/discipline/defending/
goalkeeping categories: goals, shots, corners, free kicks, fouls, tackles,
dribbles, interceptions, saves, ...).

| Column | Type | Notes |
|---|---|---|
| `match_id` | `uuid` FK → `veo_matches.id`, `on delete cascade` | part of PK |
| `team_association` | `text`, `check in ('own','opponent')` | part of PK |
| `stat_type` | `text` | Veo's own type key, e.g. `football_goal_total`, `football_corner_total`; part of PK |
| `category` | `text`, not null | Veo's category grouping, e.g. `attacking`, `set_pieces`, `discipline`, `defending`, `goalkeeping` |
| `value` | `integer`, not null | total for the match |
| `period_values` | `jsonb`, not null | `[{ "period": 1, "value": 0 }, { "period": 2, "value": 2 }]` — half-by-half breakdown, stored as-is from Veo |
| `created_at` | `timestamptz`, `defaultNow()` | |

**Primary key**: `(match_id, team_association, stat_type)` — enforces
FR-008 (no duplicates on repeated sync) at the schema level; upsert via
`ON CONFLICT (match_id, team_association, stat_type) DO UPDATE`.

**Validation**: only `stat_type`s Veo actually returned for that match are
stored — no row is fabricated for a missing category (per the Edge Cases
section of the spec).

## `veo_sync_status`

One row per team (natural key, no surrogate id — same shape as
`memberships`/`team_settings`). Powers User Story 3 / SC-003.

| Column | Type | Notes |
|---|---|---|
| `team_id` | `uuid` PK, FK → `teams.id`, `on delete cascade` | |
| `last_attempt_at` | `timestamptz`, nullable | set at the start of every sync run |
| `last_success_at` | `timestamptz`, nullable | set only when a run completes without error |
| `consecutive_failures` | `integer`, not null, `default 0` | reset to 0 on success, incremented on failure |
| `last_error` | `text`, nullable | short message from the most recent failed run, for the admin-visible hint |
| `updated_at` | `timestamptz`, `defaultNow()` | |

**State transitions**: `last_attempt_at` is always updated first (before any
Veo call), so a run that crashes mid-way still shows as "attempted"; on
success, `last_success_at := now()`, `consecutive_failures := 0`,
`last_error := null`; on any handled failure,
`consecutive_failures := consecutive_failures + 1`,
`last_error := <message>`. `last_success_at` is left untouched on failure —
User Story 3's "last successful sync" must never regress.

## `veo_sync_credentials`

One row per team, holding the captured Veo session artifact needed for
silent auth renewal (see [research.md](./research.md) §3–4, §9). Written by
`POST /api/veo/link` right after `POST /api/veo/login` performs the actual
Veo login (see [research.md §9](./research.md#9-interactive-login-headless-browser)) —
the trainer's password is never part of this row or any other.

| Column | Type | Notes |
|---|---|---|
| `team_id` | `uuid` PK, FK → `teams.id`, `on delete cascade` | |
| `session_cookie` | `text`, not null | the `auth.veo.co` session artifact captured during login (one-time interactive, now trainer-initiated instead of manually copied from DevTools) |
| `captured_at` | `timestamptz`, not null | when the session artifact was (re)captured |
| `updated_at` | `timestamptz`, `defaultNow()` | |

**RLS**: no policy at all for `authenticated`/`anon`, for any operation —
unchanged from before this feature. `POST /api/veo/link` writes this table
via `useAdminDb()` with an explicit `requireTrainer()` check (not RLS): a
`select` policy would be needed for `INSERT ... ON CONFLICT DO UPDATE` to
resolve under RLS at all (confirmed by direct testing — without one, both
`ON CONFLICT DO UPDATE` and a plain `UPDATE` silently fail to find the row),
and this table must never have one. See
[contracts/rls-policies.md](./contracts/rls-policies.md) for the full
reasoning.

## Relationships

```
teams (existing) 1──1 veo_team_mappings
teams (existing) 1──* veo_matches 1──* veo_match_stats
teams (existing) 1──1 veo_sync_status
teams (existing) 1──1 veo_sync_credentials
```

No relationship to `players` — this feature is team-level only (Player-level
stats are explicitly out of scope, FR-012). `veo_team_mappings` and
`veo_sync_credentials` are authorized against `memberships` indirectly, via
the existing `public.is_trainer(team_id)` helper (same one `team_settings`
already uses) — no new role table.
