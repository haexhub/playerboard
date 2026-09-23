# Tasks: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

**Input**: Design documents from `/specs/005-public-veo-ranking/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/public-veo-stats.md](./contracts/public-veo-stats.md), [contracts/rls-policies.md](./contracts/rls-policies.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Follows the same shape as `specs/004-veo-player-analytics`
and `specs/003-veo-analytics` (this project's `tests/unit/`/
`tests/e2e/*-flow.spec.ts` and `rls-negative-*.spec.ts` convention) — new
scenarios are added to the existing shared test files rather than new ones,
matching how prior features extended them.

**⚠️ External blocking prerequisite** (not a task in this file, see
research.md §1): 004-veo-player-analytics' foundational schema
(`veo_player_match_stats` table + RLS select policy, its own T001–T004) is
not implemented yet. Phase 2 below (this feature's own schema) can be built
and merged independently of that, but **T011's data-seeding scenario and any
real (non-empty) manual verification of US2 require that table to exist
first.** If it's still missing when this phase starts, implement through
T010 (all of US1, fully testable), then implement T013–T016 against the
schema from `004/data-model.md` (already fully specified) and keep the "no
data yet" empty-state path as the only path verifiable until 004 lands.

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
or deployment/cron change; it reuses the existing Nuxt/Supabase toolchain
unchanged (see [quickstart.md](./quickstart.md)).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and RPC every user story depends on. No user story can
be implemented or tested before this phase is done.

**Scope note**: the external blocking prerequisite above materialized during
implementation (`veo_player_match_stats` genuinely didn't exist). Per
operator decision, 004-veo-player-analytics' own foundational schema (its
table, `veo_player_match_stats_read_member` RLS policy per
[004/data-model.md](../004-veo-player-analytics/data-model.md), and the
regenerated types) was implemented as part of this phase — not a 005 task
originally, added here for traceability: `db/schema/index.ts`
(`veoPlayerMatchStats`), `supabase/migrations/20260923143353_*.sql`
(drizzle-generated table) and `20260923143500_veo_player_match_stats_rls.sql`
(hand-written RLS), folded into T001–T004 below.

- [X] T001 Add `publicStatsEnabled: boolean('public_stats_enabled').notNull().default(false)` to the `veoTeamMappings` table definition in `db/schema/index.ts`, per [data-model.md](./data-model.md) — plus, per the scope note above, `veoPlayerMatchStats` (004's table)
- [X] T002 Run `pnpm db:generate` to produce the Drizzle migration for the new column (and the new `veo_player_match_stats` table) under `supabase/migrations/` (depends on T001)
- [X] T003 Hand-write `supabase/migrations/20260923150000_public_veo_stats.sql`: grant the additional narrow columns to `public_ranking_reader` (`team_settings.team_id, season_start` — not `teams`, corrected during implementation; `veo_team_mappings.team_id, enabled, public_stats_enabled`; `veo_matches.id, team_id, played_at`; `veo_player_match_stats.match_id, player_id, stat_type, value`) and create `public.get_public_veo_stats(p_slug text)` per [contracts/public-veo-stats.md](./contracts/public-veo-stats.md) and [data-model.md](./data-model.md); `owner to public_ranking_reader`; `revoke all ... from public, service_role`; `grant execute ... to anon, authenticated`. Plus `supabase/migrations/20260923143500_veo_player_match_stats_rls.sql` (004's RLS policy, scope note above) (depends on T002)
- [X] T004 Run `pnpm gen:types` and commit the regenerated `app/types/database.ts` together with all migrations from T002/T003 (Principle V)

**Checkpoint**: Schema and RPC ready. US1 and US2 can now both start (US1's own test only needs the RPC's `enabled` gate field, not real Veo data).

---

## Phase 3: User Story 1 - Öffentliche Sichtbarkeit der Veo-Stats aktivieren (Priority: P1)

**Goal**: A trainer can flip a per-team, default-off switch that controls
whether the Veo-Stats tab is ever publicly reachable, independent of the
existing internal Veo enablement. Non-trainers and other teams' trainers
cannot change it.

**Independent Test**: Toggle `public_stats_enabled` for a Veo-enabled team
via the new UI and confirm `get_public_veo_stats`'s `enabled` field flips
accordingly; confirm a player account and a trainer of a different team both
get denied when attempting the same write.

### Tests for User Story 1 ⚠️ write first, confirm they fail before implementing

- [X] T005 [P] [US1] Add a trainer toggle round-trip scenario to `tests/e2e/veo-analytics-flow.spec.ts`: as a trainer, enable then disable `public_stats_enabled` via the new UI; assert `get_public_veo_stats(slug)`'s `enabled` field flips `true`/`false` accordingly (independent of any seeded match data)
- [X] T006 [P] [US1] Add scenario W1 to `tests/e2e/rls-negative-single-team.spec.ts`: a player (non-trainer) account attempting to update `veo_team_mappings.public_stats_enabled` for their own team is denied
- [X] T007 [P] [US1] Add scenario W2 to `tests/e2e/rls-negative-cross-team.spec.ts`: a trainer of team A attempting to update team B's `public_stats_enabled` is denied

### Implementation for User Story 1

- [X] T008 [P] [US1] Extend `app/composables/useVeoLink.ts`: add `public_stats_enabled` to `getCurrentMapping()`'s select list; add `setPublicStatsEnabled(team_id: string, enabled: boolean)` performing a direct `client.from('veo_team_mappings').update(...)` call (research.md §4 — no server route, existing RLS covers the write)
- [X] T009 [P] [US1] Implement `app/components/veo/VeoPublicStatsToggle.vue` — trainer-only switch showing the current `public_stats_enabled` state, calling `setPublicStatsEnabled` on change, with loading/error states (mirrors `VeoLinkForm.vue`'s status display pattern)
- [X] T010 [US1] Render `VeoPublicStatsToggle` on `app/pages/t/[slug]/team/veo.vue`, alongside the existing `VeoLinkForm` (depends on T008, T009; makes T005–T007 pass)

**Checkpoint**: User Story 1 fully functional and independently testable — verifiable at the RPC/DB level even before any real Veo player-stats data or the public-page UI (US2) exists.

---

## Phase 4: User Story 2 - Öffentliche Veo-Saison-Statistiken ansehen (Priority: P1)

**Goal**: The public team page gets a "Veo-Stats" tab that, once both gates
from US1/003 are on, shows each jersey number's current-season curated Veo
totals — no names, no per-match detail.

**Independent Test**: With both gates on and `veo_player_match_stats` seeded
across matches inside and outside the current season, the Veo-Stats tab
shows exactly the in-season sums per jersey number, with unassigned jersey
numbers and pre-season matches excluded, and no player-identifying field
anywhere in the page or its network responses.

### Tests for User Story 2 ⚠️ write first, confirm they fail before implementing

- [X] T011 [P] [US2] Add Veo-Stats tab scenarios to `tests/e2e/public-anon.spec.ts`: (a) both gates off → no Veo-Stats tab button rendered; (b) gates on, no matching data → tab shows the empty state, no fabricated zeros; (c) gates on with `veo_player_match_stats` seeded across 2+ in-season matches and 1 pre-`season_start` match for 2+ jersey numbers (plus one unassigned `player_id: null` row) → tab shows exactly the correct in-season sums per jersey number, the unassigned row never appears, the pre-season match never contributes, and no `player_id`/name/team-`id` appears anywhere in the rendered page or the RPC response (SC-002, SC-004, SC-005)
- [X] T012 [P] [US2] Add scenario W3 to `tests/e2e/rls-negative-cross-team.spec.ts`: an anonymous (unauthenticated) caller cannot `select` directly from `veo_team_mappings`, `veo_matches`, or `veo_player_match_stats` — only `execute` on `get_public_ranking`/`get_public_veo_stats` is reachable

### Implementation for User Story 2

- [X] T013 [P] [US2] Implement `app/composables/usePublicVeoStats.ts` — `zod` schemas for `PublicVeoStatsRow`/`PublicVeoStats` (data-model.md) and `getPublicVeoStats(slug: string)` calling the `get_public_veo_stats` RPC, mirroring `usePublicRanking.ts`'s shape
- [X] T014 [P] [US2] Implement `app/components/stats/PublicVeoStatsTable.vue` — one row per `jersey_number`, one column per curated stat type, a missing stat rendered as "–" (never `0`), `season_start` shown in a header line, an empty-state message when `rows` is empty (mirrors `PublicRankingTable.vue`)
- [X] T015 [US2] Extend `app/pages/public/[slug]/ranking.vue`: add the two-button tab switch (`ref<'points' | 'veo'>('points')`, research.md §6), fetch `usePublicVeoStats` eagerly on mount (alongside the ranking fetch, not lazily on switch — corrected during implementation so the tab button can be gated on `enabled` per FR-005), render the Veo-Stats tab button only once the fetched `enabled` is `true`, render `PublicVeoStatsTable` for that tab's content (depends on T013, T014; makes T011 pass)

**Checkpoint**: US1 and US2 both independently functional — the full public Veo-Stats capability works end to end (pending the external 004 data-seeding prerequisite noted above for a non-empty manual check).

---

## Phase 5: User Story 3 - Öffentliche Trainingsbewertungen weiterhin ansehen (Priority: P2)

**Goal**: The tab restructuring from US2 does not regress the existing,
already-production public points ranking.

**Independent Test**: The Trainingsbewertungen tab is active by default on
page load and renders identically (same rows, ranks, sums, timeframe picker
behavior) to the pre-tab-introduction baseline.

- [X] T016 [US3] Add a tab-regression scenario to `tests/e2e/public-anon.spec.ts`: Trainingsbewertungen is the default active tab on load and its content/timeframe-picker behavior is unchanged; switching to Veo-Stats and back preserves the Trainingsbewertungen tab's state (depends on T015 — the tab switch it verifies is built by US2)

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 Run [quickstart.md](./quickstart.md) end-to-end manually before merge: enable the toggle as a trainer, view both tabs anonymously in a private window — covered by the automated `veo-analytics-flow.spec.ts` (toggle) and `public-anon.spec.ts` (both tabs, anonymous) runs, both passing against a local Supabase + dev server; no separate manual click-through added on top

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: blocks US1 and US2 (both need the schema/RPC); does not block US3's task directly, but US3 depends on US2's `ranking.vue` change regardless.
- **US1 (Phase 3)**: after Foundational. Independent of US2/US3.
- **US2 (Phase 4)**: after Foundational. Independent of US1 (US1's toggle only needs to exist for a *real* end-to-end manual check — T011's automated scenarios seed/flip the DB state directly, not through US1's UI).
- **US3 (Phase 5)**: after US2's T015 (same file, `ranking.vue`) — not after US1.
- **Polish (Phase 6)**: after all desired stories are complete.

### Parallel Opportunities

- T005, T006, T007 (US1 tests, three different files) in parallel.
- T008, T009 (US1 implementation, different files) in parallel; T010 depends on both.
- T011, T012 (US2 tests, different files) in parallel.
- T013, T014 (US2 implementation, different files) in parallel; T015 depends on both.
- US1's full phase (T005–T010) and US2's tests+composable+component (T011–T014) can run in parallel across two people once Foundational is done — only T015 (which both US2's own tests and US3 depend on) is a serialization point.

---

## Implementation Strategy

### MVP First

1. Phase 1 (no-op) → Phase 2: Foundational (schema + RPC)
2. Phase 3: US1 — ship the toggle alone first if desired (safe: defaults off, nothing publicly visible changes)
3. Phase 4: US2 — the actual public-facing capability
4. **STOP and VALIDATE**: run T017's quickstart manually
5. Phase 5: US3's regression test closes the loop

### Incremental Delivery

1. Foundational ready → nothing user-visible yet (column defaults `false`, function exists but unreachable without a trainer opting in).
2. US1 ships → trainers can opt in, still nothing public shows until they do.
3. US2 ships → the Veo-Stats tab actually renders for opted-in teams.
4. US3's test confirms the existing points ranking never regressed.
