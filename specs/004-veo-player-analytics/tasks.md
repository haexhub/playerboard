# Tasks: Veo-Spieler-Statistiken

**Input**: Design documents from `/specs/004-veo-player-analytics/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rls-policies.md](./contracts/rls-policies.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Follows the same shape as `specs/003-veo-analytics`
(this project's constitution, Principle V, plus the existing
`tests/unit/`/`tests/e2e/*-flow.spec.ts` convention).

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching
spec.md's priorities) so each can be implemented, tested, and shipped
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unfinished dependency)
- **[Story]**: Maps the task to US1/US2/US3 from spec.md
- File paths are exact, per [plan.md](./plan.md)'s Project Structure

---

## Phase 1: Setup

No new setup tasks — this feature adds no environment variable, dependency,
or cron change; it reuses 003-veo-analytics' configuration unchanged (see
[quickstart.md](./quickstart.md)).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema every user story depends on. No user story can be
implemented or tested before this phase is done.

- [ ] T001 Add the `veoPlayerMatchStats` table definition to `db/schema/index.ts` exactly per [data-model.md](./data-model.md): PK `(matchId, veoJerseyNumber, statType)`, nullable `playerId` FK (`on delete set null`), `matchedManually` boolean default `false`, `category`, `value` (double precision), `createdAt`/`updatedAt`, plus the `veo_player_match_stats_player_idx` index
- [ ] T002 Run `pnpm db:generate` to produce the Drizzle migration for the new table under `supabase/migrations/` (depends on T001)
- [ ] T003 Hand-write the RLS migration `supabase/migrations/<ts>_veo_player_match_stats_rls.sql`: enable RLS, add the `veo_player_match_stats_read_member` select policy per [contracts/rls-policies.md](./contracts/rls-policies.md) — no insert/update/delete policy for `authenticated` (depends on T002)
- [ ] T004 Run `pnpm gen:types` and commit the regenerated `app/types/database.ts` together with both migrations from T002/T003 (Principle V)

**Checkpoint**: Schema ready. All user stories below can now start.

---

## Phase 3: User Story 1 - Saison-Übersicht pro Spieler ansehen (Priority: P1) 🎯 MVP

**Goal**: The team dashboard shows, per roster player, season-summed curated
stats (distance, sprints, minutes played, goals, etc.), pulled automatically
from Veo.

**Independent Test**: Seed `veo_player_match_stats` rows (with `player_id`
set) across several matches for known players, open the dashboard, and
verify the per-player sums equal a manual total of the seeded rows; a row
with `player_id = null` must never contribute to any player's total or
appear on its own.

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [ ] T005 [P] [US1] Save a representative `POST .../analysis/stats/` (`type: cross_match, group_by: player`) response as fixture `tests/fixtures/veo/analysis-stats-player-response.json`, per the shape documented in [research.md §2](./research.md#2-player-stats-response-shape)
- [ ] T006 [P] [US1] Unit tests in `tests/unit/veo-map-player-stats.spec.ts` for `mapPlayerStats.ts`: full fixture payload with a matching active roster → rows with `player_id` set for every curated stat; a jersey number with no active-roster match → rows still returned with `player_id: null` (not dropped, per FR-011); a `type` outside the nine curated stats → dropped (FR-008)
- [ ] T007 [P] [US1] E2E test in `tests/e2e/veo-analytics-flow.spec.ts`: seed `veo_player_match_stats` rows (`player_id` set) across 2+ matches for 2+ known roster players, open `/t/[slug]/dashboard`, assert the per-player season summary equals the manually computed sums; also seed one `player_id: null` row and assert it never appears anywhere on the page

### Implementation for User Story 1

- [ ] T008 [P] [US1] Add `fetchPlayerAnalysisStats(accessToken, { veoMatchIds })` to `app/server/utils/veo/client.ts` — `POST .../analysis/stats/` with `{ type: 'cross_match', group_by: 'player', match_ids }`, no `team_id` (research.md §1)
- [ ] T009 [P] [US1] Implement `app/server/utils/veo/mapPlayerStats.ts` — pure function: Veo player-stats payload + active roster (`{ id, jerseyNumber }[]`) → `veo_player_match_stats` row objects; matches by `jersey_number`, keeps only the nine curated `stat_type`s (research.md §3), sets `player_id: null` (not dropped) when no active roster player matches (makes T006 pass)
- [ ] T010 [US1] Extend `app/server/api/veo/sync.post.ts`: fetch each team's active roster once before its match loop (research.md §5); per match, call T008 *before* opening the transaction (so a fetch failure skips the whole match — match + team stats included, FR-015/research.md §13, same as an incomplete Veo analysis), lock the match row, reserve existing jersey-number assignments before mapping new rows, and ensure a new jersey-number group does not auto-assign a player already claimed by another jersey number. Upsert into `veo_player_match_stats` with `ON CONFLICT (match_id, veo_jersey_number, stat_type) DO UPDATE`: set `player_id` on insert and preserve it unchanged on conflict, regardless of `matched_manually`; refresh only Veo-controlled values on conflict (research.md §10). Keep this inside the same per-match transaction as the existing match/team-stats upsert (depends on T001-T004, T008, T009)
- [ ] T011 [P] [US1] Extend `app/composables/useVeoAnalytics.ts`: keep `listMatches()`'s member-facing nested select limited to assigned rows (`veo_player_match_stats(veo_jersey_number, player_id, matched_manually, stat_type, category, value, players(id, name, jersey_number))` with `player_id is not null`); add a separate trainer-only path for unassigned rows and their jersey numbers; add `computePlayerSeasonSummary(matches)`, summing `value` by `player_id`/`stat_type` across assigned rows only (research.md §6, same pattern as `computeSeasonSummary`)
- [ ] T012 [P] [US1] Implement `app/components/veo/VeoPlayerSeasonSummary.vue` — one row per roster player with season-summed curated stats
- [ ] T013 [US1] Render `VeoPlayerSeasonSummary` on `app/pages/t/[slug]/dashboard.vue` (depends on T011, T012; makes T007 pass)

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Spieler-Statistiken eines einzelnen Spiels ansehen (Priority: P2)

**Goal**: The existing Veo-Analytics page shows, per match, the curated
stats of every matched player alongside the existing team stats.

**Independent Test**: Seed one match's `veo_player_match_stats` with two
assigned (`player_id` set) and one unassigned (`player_id: null`) jersey
number, open `/t/[slug]/analytics`, and confirm the match card lists exactly
the two assigned players with their curated stats — the unassigned jersey
number never appears as a row.

### Tests for User Story 2 ⚠️ write first, confirm they fail before implementing

- [ ] T014 [P] [US2] Add a per-match player breakdown scenario to `tests/e2e/veo-analytics-flow.spec.ts`: seed one match as described above, assert the match card shows exactly the two assigned players' curated stats and no row for the unassigned jersey number

### Implementation for User Story 2

- [ ] T015 [US2] Extend `app/components/veo/VeoMatchCard.vue` to render a per-player breakdown block using that match's `veo_player_match_stats` entries (already present per-match from T011's query; `player_id`-not-null only) (depends on T011; makes T014 pass)

**Checkpoint**: US1 and US2 both independently functional.

---

## Phase 5: User Story 3 - Trikotnummer-Zuordnung für ein Spiel korrigieren (Priority: P3)

**Goal**: A trainer can set or correct which roster player a jersey number
is attributed to for a specific match; the correction survives future
automatic syncs (FR-012/FR-013, SC-005).

**Independent Test**: Seed one match with an unmatched jersey number
(`player_id: null`) and one wrongly-matched jersey number; as a trainer, set
the first and correct the second via the new route — both now show under
the chosen player in the dashboard summary and the match card. Re-run the
sync upsert logic for that match with fresh `category`/`value` for the same
jersey numbers and confirm both `player_id`s are unchanged (SC-005). As a
player (non-trainer) of the same team, the route returns 403.

### Tests for User Story 3 ⚠️ write first, confirm they fail before implementing

- [ ] T016 [P] [US3] Add negative tests: `tests/e2e/rls-negative-single-team.spec.ts` — a player (non-trainer) gets 403 from `POST /api/veo/matches/[matchId]/player-assignment` (P4); `tests/e2e/rls-negative-cross-team.spec.ts` — a trainer of team A is denied for a match belonging to team B (P5); `tests/e2e/api-negative.spec.ts` — an unauthenticated caller gets 401 (P6)
- [ ] T017 [P] [US3] Add correction scenarios to `tests/e2e/veo-analytics-flow.spec.ts`: as a trainer, assign an unmatched jersey number and correct a wrongly-matched one via the UI/API; assert both appear correctly in the dashboard season summary and the match breakdown; assign a player who is already assigned to a *different* jersey number in the same match and assert the old jersey number's rows are cleared (`player_id: null`) while the new one takes effect (FR-016); then re-run the sync's upsert for that match with changed `value`/`category` for the same jersey numbers and assert `player_id` is unchanged afterward (SC-005)

### Implementation for User Story 3

- [ ] T018 [US3] Implement `app/server/api/veo/matches/[matchId]/player-assignment.post.ts`: require a session (`serverSupabaseUser(event)`), validate body `{ team_id, veo_jersey_number, player_id }` (`player_id` nullable, for clearing a wrong assignment), `requireTrainer(useAdminDb(), team_id, userId)`, verify the match belongs to `team_id` and `player_id` (if not null) belongs to the same team, then in one `useAdminDb()` transaction first lock the shared `veo_matches` row with `FOR UPDATE` (the same lock used by sync), clear (`player_id = null`, `matched_manually = true`) that `player_id`'s rows under any other jersey number in the same match (FR-016, research.md §14), and update every `veo_player_match_stats` row sharing `(match_id, veo_jersey_number)` — set `player_id` and `matched_manually = true` (depends on Foundational; makes T016 pass)
- [ ] T019 [P] [US3] Implement `app/composables/useVeoPlayerAssignment.ts` — calls T018
- [ ] T020 [US3] Extend `app/components/veo/VeoMatchCard.vue`, trainer-only (`v-if="isTrainer"`): list that match's unassigned jersey numbers (`player_id: null` rows) with a "Spieler zuordnen" picker over the team's active roster, and an "Zuordnung ändern" action on already-assigned rows; wired to T019 (depends on T015, T019; makes T017's UI portion pass)
- [ ] T021 [US3] Pass `isTrainer` and the team's active roster through from `app/pages/t/[slug]/analytics.vue` to `VeoMatchCard` (depends on T020)

**Checkpoint**: All three user stories independently functional.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run `pnpm lint` and `pnpm typecheck`; fix any violations across all files touched by this feature
- [ ] T023 Run `pnpm db:migrate` and `pnpm gen:types` locally to confirm the new migration applies cleanly end-to-end (quickstart.md)
- [ ] T024 Capture one real `POST .../analysis/stats/` (`type: cross_match, group_by: player`) response from the live Veo account and diff it against T005's fixture / [research.md §2](./research.md#2-player-stats-response-shape)'s inferred shape; update the fixture, `mapPlayerStats.ts`'s Zod schema, and this doc if the real nesting differs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — no tasks
- **Foundational (Phase 2)**: depends on nothing — blocks every user story
- **User Story 1 (Phase 3)**: depends on Foundational only
- **User Story 2 (Phase 4)**: depends on Foundational; reuses `useVeoAnalytics.ts`'s query from US1 (T011) but adds no new table/route
- **User Story 3 (Phase 5)**: depends on Foundational for its route/table access, and on US2's `VeoMatchCard.vue` breakdown (T015) as the UI it attaches its correction controls to
- **Polish (Final Phase)**: after whichever user stories are in scope for the release

### Within Each User Story

- Tests are written first and MUST fail before their corresponding implementation task
- `mapPlayerStats`/`client` (pure/isolated) before `sync.post.ts` (orchestrates them)
- Composable before the components/page that consume it

### Parallel Opportunities

- T005, T006, T007 (US1 tests) in parallel once Phase 2 is done
- T008, T009 (US1 impl) in parallel; T010 needs both
- T011, T012 (US1 impl) in parallel; T013 needs both
- T016, T017 (US3 tests) in parallel
- T018, T019 (US3 impl) in parallel; T020 needs both

---

## Parallel Example: User Story 1

```bash
# Tests, once Phase 2 is done:
Task: "Fixture in tests/fixtures/veo/analysis-stats-player-response.json"
Task: "Unit tests in tests/unit/veo-map-player-stats.spec.ts"
Task: "E2E test in tests/e2e/veo-analytics-flow.spec.ts"

# Implementation, independent files:
Task: "Implement app/server/utils/veo/client.ts (fetchPlayerAnalysisStats)"
Task: "Implement app/server/utils/veo/mapPlayerStats.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 2: Foundational (T001-T004) — **blocks everything below**
2. Phase 3: User Story 1 (T005-T013)
3. **STOP and VALIDATE**: run a real sync against the live Veo account, confirm the dashboard shows real per-player season sums
4. This alone is a deployable MVP — US2/US3 add to it without changing it

### Incremental Delivery

1. Foundational → schema ready
2. User Story 1 → validate independently → deployable MVP
3. User Story 2 → validate independently → per-match breakdown ships
4. User Story 3 → validate independently → trainers can self-correct jersey mismatches
5. Polish (T022-T024) at the end

---

## Notes

- [P] tasks touch different files with no unfinished dependency between them
- Every implementation task traces to a file path named in [plan.md](./plan.md)'s Project Structure
- Commit after each task or logical group, per this repo's normal workflow
- T024 is a deliberate follow-up to research.md §2's explicitly-flagged
  inference risk — the fixture used for T005/T006 is representative, not yet
  confirmed byte-for-byte against a live payload
