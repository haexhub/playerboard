# Implementation Plan: Veo-Kamera-Analytics

**Branch**: `003-veo-analytics` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-veo-analytics/spec.md`

## Summary

Automatically pull match results and team statistics for an explicitly
enabled team from the club's Veo camera account and display them in
Playerboard — per match (own vs. opponent, per half) and aggregated as a
season overview — without any manual data entry. Veo exposes no usable
public API (its documented partner API is invite-only); this uses the
private, undocumented API that already powers Veo's own web app,
authenticated via a one-time interactive login whose session is then
silently renewed by a new daily server-side sync route. Credentials never
touch `.env`/the repo; the trainer's password never touches storage at all.
Which team is enabled is itself an explicit, authenticated decision
(`veo_team_mappings`) — no team gets Veo data by default.

**Update 2026-09-22** (see spec.md's Clarifications, research.md §9/§10):
the original v1 plan below gated both the team-mapping table and the
credential table behind manual SQL, pending a separate "Platform-Administration"
feature. That gate has been replaced by trainer self-service instead:
`veo_team_mappings` has `is_trainer(team_id)` RLS policies, while the
credential write is authorized by the server route with `requireTrainer()` and
`useAdminDb()`. The two-step login+link flow (`POST /api/veo/login`,
`POST /api/veo/link`) also adds one new runtime dependency
(Playwright/Chromium, for the interactive login step only — see
[research.md §9](./research.md#9-interactive-login-headless-browser)). The
rest of this plan (sync route, schema shape, testing strategy) is
unchanged.

## Technical Context

**Language/Version**: TypeScript 5.6+, strict mode; Node.js 22 LTS — same stack, no new runtime.
**Primary Dependencies**: Nuxt 3, `@nuxtjs/supabase`, `drizzle-orm` + `drizzle-kit`, `zod` — all already in use for the sync route itself; the OIDC/PKCE renewal flow and REST calls use native `fetch`/`crypto`, no headless-browser dependency there (see [research.md §3](./research.md#3-veo-authentication-strategy)). **Since 2026-09-22**: one new dependency, `playwright` (+ Chromium binary on the VPS), used only by the trainer-initiated interactive login step (see [research.md §9](./research.md#9-interactive-login-headless-browser)) — the daily sync route's own dependency footprint is unchanged.
**Storage**: PostgreSQL (Supabase-managed); five new tables — `veo_team_mappings`, `veo_matches`, `veo_match_stats`, `veo_sync_status`, `veo_sync_credentials` (see [data-model.md](./data-model.md)).
**Testing**: Vitest for the pure Veo-payload → schema mapping function (fixture-based, no live Veo call); Playwright e2e for the display pages and sync-status banner, seeded directly via DB (see [research.md §8](./research.md#8-testing-strategy-for-the-external-integration)).
**Target Platform**: Existing web app, plus one new server-triggered route invoked by an OS-level cron entry on the production VPS (no new deployment target).
**Project Type**: Web application — extends the existing single Nuxt project.
**Performance Goals**: Daily batch sync completes well within its interval; no live-fetch latency on page view since data is pre-stored. No new performance targets beyond the existing app's.
**Constraints**: RLS mandatory (Principle II) on all five new tables, with at least one policy per table. `veo_matches`/`veo_match_stats`/`veo_sync_status` stay read-only for members, written only by `useAdminDb()`. `veo_team_mappings` is `is_trainer(team_id)`-gated for `insert`/`update`/`select`; `veo_sync_credentials` remains deny-all to `authenticated` clients and is written only through the authorized server transaction (`useAdminDb()` plus `requireTrainer()`) — see [contracts/rls-policies.md](./contracts/rls-policies.md). No Veo credentials in `.env`/repo; the trainer's password specifically is never persisted anywhere (see [research.md §4](./research.md#4-credential-storage), [§9](./research.md#9-interactive-login-headless-browser)). The data source is an undocumented, unsupported private API — sync MUST fail closed (never fabricate data, FR-007) and MUST surface staleness within a day (FR-009/SC-003).
**Scale/Scope**: One team, ~20–60 matches/season, ~28 stat rows/match — negligible data volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Gate | Status |
|---|---|---|
| **I. Simplicity First** (NON-NEGOTIABLE) | No new abstraction/service without present-day need; reuse existing patterns. | ✅ Pass. No new dependency, no new deployment target (rejected Supabase Edge Functions and an in-process scheduler in favor of plain OS cron + a Nitro route — [research.md §1](./research.md#1-where-does-the-periodic-sync-run)); team mapping moved from fixed config to a table only because an explicit clarified requirement (admin-controlled enablement) needs it — the admin *UI* for it is explicitly deferred to a later feature rather than built here ([research.md §5](./research.md#5-team-mapping-veo-team--playerboard-team)); season totals are computed on read, not a precomputed table ([research.md §6](./research.md#6-season-aggregation-user-story-2)); the privileged-route shape (`useAdminDb()`, service_role-only writes) is reused as-is from `app/server/api/invitations/issue.post.ts` / `app/server/api/profile/moderate.post.ts`. |
| **II. Role-Based Access via Supabase RLS** (NON-NEGOTIABLE) | Every table + at least one policy; cross-boundary access denied by policy, not app logic. | ✅ Pass. All five tables have RLS and a policy. `veo_matches`/`veo_match_stats`/`veo_sync_status` get membership- and enabled-mapping-gated read policies with no authenticated write policy (only `service_role` writes); `veo_team_mappings` gets trainer-scoped policies, while `veo_sync_credentials` remains explicitly deny-all for `authenticated` and is written only by the authorized server transaction. See [contracts/rls-policies.md](./contracts/rls-policies.md). |
| **III. Konfigurierbare Punktekategorien** | N/A — feature does not touch point categories. | ✅ N/A |
| **IV. Mobile-First UX** | New page usable on ≥360px portrait; ≥44px touch targets. | ✅ Pass. New `/t/[slug]/analytics` page reuses existing layout/typography and touch-target utility classes already used across `/t/[slug]/**`; match cards stack vertically on narrow screens like existing list views (e.g. `players/index.vue`). |
| **V. Type Safety End-to-End** | Schema change → regenerate + commit Supabase types. | ✅ Pass. Five tables added via Drizzle + `pnpm gen:types`, same as every prior schema change in this project. |

**No violations. Complexity Tracking section intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/003-veo-analytics/
├── plan.md                  # This file
├── spec.md                  # Feature specification (with Clarifications)
├── research.md              # Phase 0 output — technical decisions
├── data-model.md            # Phase 1 output — schema, RLS summary
├── quickstart.md            # Phase 1 output — env vars, local-dev delta, cron setup
├── contracts/
│   └── rls-policies.md      # New policies for this feature's 5 tables
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (/speckit-tasks, not this command)
```

### Source Code (repository root, delta only — rest of the app is unchanged)

```text
app/
├── pages/t/[slug]/
│   ├── analytics.vue                 # US1+US2: match list + season summary; team-context middleware only, no trainer-only restriction
│   └── team/
│       └── veo.vue                   # Phase 7: trainer-only, self-service Veo linking (login → club/team picker → confirm)
├── components/veo/
│   ├── VeoMatchCard.vue              # one match: score, stat categories own vs. opponent, per-half breakdown
│   ├── VeoSeasonSummary.vue          # aggregated W/D/L + category sums across synced matches
│   ├── VeoSyncStatusBanner.vue       # US3: last successful sync / failure indicator
│   └── VeoLinkForm.vue               # Phase 7: two-step credentials + club/team picker form
├── composables/
│   ├── useVeoAnalytics.ts            # reads veo_matches/veo_match_stats/veo_sync_status for the current team via the plain (RLS-gated) Supabase browser client
│   └── useVeoLink.ts                 # Phase 7: calls /api/veo/login then /api/veo/link, holds the two-step UI state
└── server/
    ├── api/veo/
    │   ├── sync.post.ts              # shared-secret auth → for each enabled row in veo_team_mappings: refresh Veo session → fetch matches+stats → upsert → update veo_sync_status
    │   ├── login.post.ts             # Phase 7: trainer session + requireTrainer() check → headless login → club/team list + encrypted/signed short-lived token
    │   └── link.post.ts              # Phase 7: verifies the encrypted/signed token, revalidates the Veo club/team, then upserts both tables via useAdminDb() + requireTrainer()
    └── utils/veo/
        ├── auth.ts                   # PKCE + auth.veo.co silent-renewal (prompt=none); reads/writes veo_sync_credentials via useAdminDb
        ├── client.ts                 # typed fetch wrappers for GET .../matches/, POST .../analysis/stats/, and (Phase 7) GET .../clubs/, GET .../clubs/{slug}/teams/
        ├── login.ts                  # Phase 7: headless-Chromium interactive login → auth.veo.co session cookie (research.md §9)
        └── mapStats.ts                # pure function: Veo analysis/stats payload → veo_match_stats rows (unit-tested)

db/schema/index.ts                     # + veoTeamMappings, veoMatches, veoMatchStats, veoSyncStatus, veoSyncCredentials

supabase/migrations/
├── <ts>_veo_tables.sql                    # drizzle-generated: create the 5 tables
├── <ts>_veo_tables_rls.sql                # hand-written: RLS enable + read policies (service_role writes only) — original v1 shape
└── <ts>_veo_trainer_self_service.sql      # Phase 7, hand-written: replaces the deny-all policy on veo_team_mappings with is_trainer(team_id)-gated ones; veo_sync_credentials remains deny-all

nuxt.config.ts                         # + runtimeConfig.veoSyncSecret, runtimeConfig.veoLinkTokenSecret (Phase 7) — no team/club config here, that lives in veo_team_mappings

tests/fixtures/veo/
└── analysis-stats-response.json       # real captured payload shape, used by the unit test below

tests/unit/
└── veo-map-stats.spec.ts              # mapStats.ts: full payload, missing-category, malformed-input cases

tests/e2e/
├── veo-analytics-flow.spec.ts         # seeds veo_matches/veo_match_stats/veo_sync_status directly, verifies analytics page + sync-status banner (no live Veo call)
├── rls-negative-single-team.spec.ts   # Phase 7: + trainer cross-team isolation, non-trainer denial on veo_team_mappings/veo_sync_credentials
└── api-negative.spec.ts               # Phase 7: + POST /api/veo/login and /link without a session / as a non-trainer
```

**Structure Decision**: Extends the existing single Nuxt project — no new
project, no new service, no new deployment target. Read access
(`useVeoAnalytics.ts`, the new page/components) goes straight through the
plain Supabase browser client, gated by RLS, exactly like every other
team-scoped read in this app. The one privileged path — the sync itself —
gets its own narrow server route, mirroring the existing
`app/server/api/invitations/` / `app/server/api/profile/moderate.post.ts`
shape, with the caller-authentication adapted for a machine (shared secret)
instead of a logged-in trainer, since nothing triggers this route
interactively.

## Complexity Tracking

*None. All gates pass.*
