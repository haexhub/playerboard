# Implementation Plan: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

**Branch**: `014-public-veo-ranking` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-public-veo-ranking/spec.md`

## Summary

Turn the existing single-purpose public ranking page
(`/public/[slug]/ranking`, 001-points-and-photos) into a two-tab public page:
the existing "Trainingsbewertungen" tab (unchanged, still `get_public_ranking`)
plus a new "Veo-Stats" tab showing each player's current-season, curated Veo
metrics (distance, sprints, top/average speed, high-intensity runs, minutes
played, shots, goals, goal involvements) keyed by jersey number only — never
a name, internal ID, or per-match breakdown. The Veo tab is gated by two
independent, both-required conditions: the existing internal Veo enablement
(`veo_team_mappings.enabled`, 003-veo-analytics) and a new, trainer-controlled,
default-off public opt-in (`veo_team_mappings.public_stats_enabled`,
005-only) — flipping Veo on for a team's internal dashboard never
automatically publishes it. A new `security definer` function,
`get_public_veo_stats`, owned by the same `public_ranking_reader` role
`get_public_ranking` already uses, computes the season-bounded
(`team_settings.season_start .. now`) aggregate server-side. This feature has a hard
prerequisite: 004-veo-player-analytics' foundational schema
(`veo_player_match_stats`) is not implemented yet (see research.md §1) —
this plan's Veo-Stats tab has nothing to query until that lands.

## Technical Context

**Language/Version**: TypeScript 5.6+, strict mode; Node.js 22 LTS — same stack, no new runtime.
**Primary Dependencies**: None new. Reuses `zod` (new composable schema, mirroring `usePublicRanking.ts`) and the existing Supabase client/RPC pattern. No Tabs primitive exists in the shared `@haex-space/ui` package (external repo) — the tab switch is two plain `ShadcnButton`s, not a new dependency (research.md §6).
**Storage**: PostgreSQL (Supabase-managed). One new column (`veo_team_mappings.public_stats_enabled boolean not null default false`) and one new `security definer` function (`get_public_veo_stats`), owned by the existing `public_ranking_reader` role with additional narrow column grants (data-model.md). No new table, no new Postgres role. Depends on 004's `veo_player_match_stats` table existing (research.md §1).
**Testing**: Vitest for the new `usePublicVeoStats.ts` schema parsing (mirroring the existing pattern, if any exists for `usePublicRanking.ts`); Playwright e2e extending `public-anon.spec.ts` (both tabs, both gate states) and `rls-negative-cross-team.spec.ts`/`rls-negative-single-team.spec.ts` (toggle write denial for non-trainers and cross-team).
**Target Platform**: Existing web app; no new route. `app/pages/public/[slug]/ranking.vue` gains the tab switch and a second data fetch; `app/pages/t/[slug]/team/veo.vue` gains the toggle section.
**Project Type**: Web application — extends the existing single Nuxt project.
**Performance Goals**: No new performance targets. One additional RPC call on every public page load (in parallel with the existing ranking call), not just when the Veo-Stats tab is opened — required so the tab button itself can be hidden per FR-005 before any switch happens (corrected during implementation from an earlier lazy-load assumption). Negligible added load either way.
**Constraints**: RLS mandatory (Principle II) — covered entirely by already-existing policies for the write path (research.md §4) and the existing `security definer`/narrow-grant pattern for the read path (research.md §2); no new policy needed. Public opt-in must default to `false` (spec FR-003, privacy-driven).
**Scale/Scope**: One page's UI change, one column, one function. Same order of magnitude as 001's original public-ranking addition.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Gate | Status |
|---|---|---|
| **I. Simplicity First** (NON-NEGOTIABLE) | No new abstraction/service without present-day need; reuse existing patterns. | ✅ Pass. Reuses `public_ranking_reader` instead of a second role (research.md §2); reuses existing `veo_team_mappings` trainer RLS policies for the toggle write instead of a new API route (research.md §4); no new Tabs dependency, a two-button local switch instead (research.md §6); no per-match public breakdown, only the season sum the spec asked for. |
| **II. Role-Based Access via Supabase RLS** (NON-NEGOTIABLE) | Every table + at least one policy; cross-boundary access denied by policy, not app logic. | ✅ Pass. The new column lives on an already fully RLS-covered table (no gap: no new write surface needs a new policy). The new public function follows the exact reviewed `security definer` + narrow-grant + `bypassrls`-role pattern already in production for `get_public_ranking` — see [contracts/rls-policies.md](./contracts/rls-policies.md) for the full grant list and negative-test matrix. |
| **III. Konfigurierbare Punktekategorien** | N/A — feature does not touch point categories. | ✅ N/A |
| **IV. Mobile-First UX** | New UI usable on ≥360px portrait; ≥44px touch targets. | ✅ Pass. The tab switch is two `ShadcnButton`s (existing mobile-first sizing); the toggle on `team/veo.vue` reuses the existing settings-page layout patterns. |
| **V. Type Safety End-to-End** | Schema change → regenerate + commit Supabase types. | ✅ Pass. One column added via Drizzle + `pnpm gen:types`; new RPC response validated with a `zod` schema in `usePublicVeoStats.ts`, same as `usePublicRanking.ts`. |

**No violations. Complexity Tracking section intentionally empty.**

One noted **cross-feature sequencing dependency** (not a constitution
violation, a scheduling fact): this feature's Veo-Stats tab cannot show real
data until 004-veo-player-analytics' foundational schema phase is
implemented (research.md §1). The toggle, gating, and Trainingsbewertungen
tab all work independently of that dependency.

## Project Structure

### Documentation (this feature)

```text
specs/005-public-veo-ranking/
├── plan.md                      # This file
├── spec.md                      # Feature specification (with Clarifications)
├── research.md                  # Phase 0 output — technical decisions
├── data-model.md                # Phase 1 output — schema delta, function contract
├── contracts/
│   ├── public-veo-stats.md      # get_public_veo_stats RPC contract
│   └── rls-policies.md          # RLS delta (mostly: nothing new needed, and why)
├── checklists/
│   └── requirements.md
├── quickstart.md
└── tasks.md                     # Phase 2 output (/speckit.tasks, not this command)
```

### Source Code (repository root, delta only — rest of the app is unchanged)

```text
app/
├── pages/
│   ├── public/[slug]/
│   │   └── ranking.vue                # + tab switch (Trainingsbewertungen / Veo-Stats), fetches Veo data eagerly alongside the ranking so the tab button can be gated on `enabled`
│   └── t/[slug]/team/
│       └── veo.vue                    # + renders VeoPublicStatsToggle
├── components/
│   ├── stats/
│   │   └── PublicVeoStatsTable.vue    # new: mirrors PublicRankingTable.vue, jersey_number + curated stats, no names
│   └── veo/
│       └── VeoPublicStatsToggle.vue   # new: trainer-only switch, reads/writes veo_team_mappings.public_stats_enabled directly via useSupabaseClient()
└── composables/
    ├── usePublicVeoStats.ts           # new: mirrors usePublicRanking.ts — zod schema + get_public_veo_stats RPC call
    └── useVeoLink.ts                  # + public_stats_enabled in getCurrentMapping()'s select list; + setPublicStatsEnabled(team_id, enabled)

db/schema/index.ts                     # veoTeamMappings: + publicStatsEnabled column

supabase/migrations/
└── <ts>_veo_team_mappings_public_stats.sql  # drizzle-generated column + hand-written get_public_veo_stats function (data-model.md, contracts/public-veo-stats.md)

tests/e2e/
├── public-anon.spec.ts                # + Veo-Stats tab: both-gates-off (no tab), gates-on-no-data (empty state), gates-on-with-data (correct season sums, no PII)
├── rls-negative-single-team.spec.ts   # + player cannot toggle public_stats_enabled
└── rls-negative-cross-team.spec.ts    # + trainer of team A cannot toggle team B's public_stats_enabled; anon cannot select veo_player_match_stats/veo_matches/veo_team_mappings directly
```

**Structure Decision**: Extends the existing single Nuxt project, the
existing 001 public-ranking vertical slice, and the existing 003
`veo_team_mappings` settings surface — no new page route, no new project. The
public page keeps exactly one URL (`/public/[slug]/ranking`) per team,
gaining a client-side tab switch rather than a second route (research.md
§6). The toggle write path deliberately has *no* new server route — it goes
directly through Supabase RLS exactly like `VeoLinkForm.vue`'s existing
reads already do (research.md §4). The one genuinely new piece of backend
logic is `get_public_veo_stats`, and it is a twin of the already-reviewed,
already-in-production `get_public_ranking` function — same role, same
grant-scoping technique, same `not_found`/gate-shape convention — not a new
pattern.

## Complexity Tracking

*None. All gates pass.*
