# Implementation Plan: Veo-Spieler-Statistiken

**Branch**: `013-veo-player-analytics` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-veo-player-analytics/spec.md`

## Summary

Extend the existing Veo sync (003-veo-analytics) to also pull per-player
match stats — distance, sprints, top/average speed, high-intensity runs,
minutes played, shots, goals, goal involvements — from the same private Veo
endpoint already used for team stats, just with `group_by: 'player'` instead
of `group_by: 'team_association'`. Veo identifies players only by jersey
number (no lineup maintained for this club), so each returned jersey number
is matched at sync time against the team's own `players.jersey_number`.
Unmatched jersey numbers are stored but never displayed (no guessed
assignment) — a trainer can manually assign or correct a jersey number's
player for a given match, and that correction survives future sync runs
(User Story 3, added 2026-09-23 after the initial plan). Results are shown
as a per-player season summary on the team dashboard and a per-match
breakdown (with trainer-only correction controls) on the existing
Veo-Analytics page, visible to all team members.

## Technical Context

**Language/Version**: TypeScript 5.6+, strict mode; Node.js 22 LTS — same stack, no new runtime.
**Primary Dependencies**: None new. Reuses `drizzle-orm`, `zod`, and the existing `app/server/utils/veo/*` modules (`auth.ts` for the access token, `client.ts` for the HTTP call shape) from 003-veo-analytics.
**Storage**: PostgreSQL (Supabase-managed); one new table, `veo_player_match_stats`, keyed by `(match_id, veo_jersey_number, stat_type)` with a nullable, trainer-correctable `player_id` (see [data-model.md](./data-model.md)). No change to the five 003-veo-analytics tables.
**Testing**: Vitest for the pure Veo payload → schema mapping function (`mapPlayerStats.ts`), fixture-based, mirroring `mapStats.ts`'s existing test; Playwright e2e seeds `veo_player_match_stats` directly and verifies the dashboard season summary and the analytics-page per-match breakdown — no live Veo call (same strategy as 003-veo-analytics research.md §8).
**Target Platform**: Existing web app; the existing `POST /api/veo/sync` route gains one more Veo call and one more upsert per match, plus one new trainer-facing route, `POST /api/veo/matches/[matchId]/player-assignment` (User Story 3) — no new deployment target.
**Project Type**: Web application — extends the existing single Nuxt project.
**Performance Goals**: No new performance targets. One additional Veo HTTP call per match per daily sync run (negligible volume, same order of magnitude as the existing team-stats call).
**Constraints**: RLS mandatory (Principle II) on the new table, at least one policy. Read-only for `authenticated` (member + `is_veo_enabled(team_id)`, same gate as `veo_match_stats`); written only by `service_role` via `useAdminDb()`. No new credential/secret — reuses 003's `veo_sync_credentials`/`veo_team_mappings` as-is (spec.md Assumptions, FR-010).
**Scale/Scope**: One team, ~20–60 matches/season, up to ~16 players per match × 9 curated stats — negligible data volume (comparable order of magnitude to 003's ~28 team-stat rows/match).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Gate | Status |
|---|---|---|
| **I. Simplicity First** (NON-NEGOTIABLE) | No new abstraction/service without present-day need; reuse existing patterns. | ✅ Pass. No new table beyond the one the data itself requires; the one new server route (`player-assignment.post.ts`) mirrors `link.post.ts`'s existing `requireTrainer()` + `useAdminDb()` shape exactly, rather than inventing column-level RLS; no per-half breakdown stored (unlike team stats) since no requirement asks for it (YAGNI); season summary computed on read by summing already-fetched match rows client-side, exactly like `computeSeasonSummary` already does for team stats — no new aggregation mechanism. |
| **II. Role-Based Access via Supabase RLS** (NON-NEGOTIABLE) | Every table + at least one policy; cross-boundary access denied by policy, not app logic. | ✅ Pass. `veo_player_match_stats` gets RLS enabled with an `is_veo_enabled(team_id)` read policy: assigned rows are visible to team members, while unassigned correction rows are trainer-only per FR-011. There is no write policy for `authenticated` — the trainer-correction write goes through an explicit `requireTrainer()` app-level check instead (research.md §11), the same established exception `veo_sync_credentials` already uses for the same column-scoping reason. See [contracts/rls-policies.md](./contracts/rls-policies.md). |
| **III. Konfigurierbare Punktekategorien** | N/A — feature does not touch point categories. | ✅ N/A |
| **IV. Mobile-First UX** | New UI usable on ≥360px portrait; ≥44px touch targets. | ✅ Pass. Season summary is a new section on the already mobile-first `dashboard.vue`; per-match player breakdown is a new block inside the already mobile-first `VeoMatchCard.vue` — both reuse existing list/card layout patterns, no new layout primitive. |
| **V. Type Safety End-to-End** | Schema change → regenerate + commit Supabase types. | ✅ Pass. One table added via Drizzle + `pnpm gen:types`, same as every prior schema change. |

**No violations. Complexity Tracking section intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/004-veo-player-analytics/
├── plan.md                  # This file
├── spec.md                  # Feature specification (with Clarifications)
├── research.md              # Phase 0 output — technical decisions
├── data-model.md            # Phase 1 output — schema, RLS summary
├── contracts/
│   └── rls-policies.md      # New policy for veo_player_match_stats
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (/speckit.tasks, not this command)
```

### Source Code (repository root, delta only — rest of the app is unchanged)

```text
app/
├── pages/t/[slug]/
│   ├── dashboard.vue                 # US1: + per-player season summary section
│   └── analytics.vue                 # US2+US3: passes player stats through to VeoMatchCard, isTrainer through for correction controls
├── components/veo/
│   ├── VeoMatchCard.vue               # + per-player breakdown block; trainer-only jersey-number assign/correct controls (US3)
│   └── VeoPlayerSeasonSummary.vue     # new: per-player season totals table
├── composables/
│   ├── useVeoAnalytics.ts             # keeps the member display query limited to player_id not null; adds a trainer-only path for unassigned jersey rows; computeSeasonSummary() gains a per-player equivalent
│   └── useVeoPlayerAssignment.ts      # new: calls POST /api/veo/matches/[matchId]/player-assignment
└── server/
    ├── api/veo/
    │   ├── sync.post.ts               # + per match: fetch player stats, reserve existing jersey assignments before mapping new rows, upsert Veo stats (player_id set on insert and preserved on conflict) — same transaction as the existing match+team-stats upsert
    │   └── matches/[matchId]/player-assignment.post.ts  # new, US3: trainer session + requireTrainer() check → sets player_id + matched_manually for one (match, jersey number)
    └── utils/veo/
        ├── client.ts                  # + fetchPlayerAnalysisStats(): POST .../analysis/stats/ with {type: 'cross_match', group_by: 'player', match_ids}
        └── mapPlayerStats.ts           # new, pure: Veo player-stats payload + team roster → veo_player_match_stats rows, player_id null when unmatched (unit-tested)

db/schema/index.ts                     # + veoPlayerMatchStats

supabase/migrations/
└── <ts>_veo_player_match_stats.sql    # drizzle-generated table + hand-written RLS select policy

tests/fixtures/veo/
└── analysis-stats-player-response.json  # captured/representative player-stats payload shape

tests/unit/
└── veo-map-player-stats.spec.ts       # mapPlayerStats.ts: full payload, unmatched jersey number (player_id null, not dropped), missing stat type

tests/e2e/
├── veo-analytics-flow.spec.ts         # + seeds veo_player_match_stats, asserts dashboard season summary + per-match player breakdown (only player_id not null rows)
├── rls-negative-single-team.spec.ts   # + player-assignment denied for a non-trainer (P4)
├── rls-negative-cross-team.spec.ts    # + player-assignment denied across teams (P5)
└── api-negative.spec.ts               # + player-assignment 401 unauthenticated (P6)
```

**Structure Decision**: Extends the existing single Nuxt project and the
existing 003-veo-analytics vertical slice — no new project, no new page. The
one new table is read exactly like `veo_match_stats` already is (plain
RLS-gated Supabase browser client, with the member display filtered to
`player_id is not null`), and its Veo values are written by
`POST /api/veo/sync` via `useAdminDb()` exactly like `veo_match_stats` is.
The one genuinely new piece is the trainer-correction
write path, `POST /api/veo/matches/[matchId]/player-assignment` — a single
new route reusing the exact `requireTrainer()` + `useAdminDb()` shape
`POST /api/veo/link` already established, not a new authorization pattern.
The jersey-number matching itself stays isolated in one pure, unit-tested
function (`mapPlayerStats.ts`) mirroring `mapStats.ts`'s existing shape.

## Complexity Tracking

*None. All gates pass.*
