# Implementation Plan: Trainingspunkte & Trainingsfotos (v1, Multi-Tenant)

**Branch**: `001-points-and-photos` | **Date**: 2026-09-10 (Round 2) | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-points-and-photos/spec.md`

## Summary

Multi-tenant internal web app: any user can sign up (magic-link,
passwordless), found a team, and manage its point categories, players,
trainings, photos, and evaluations. Trainers invite additional users
into their team as either coach or player; players have per-team read
access to rankings, their own progress, and photos. A team-scoped
anonymous public ranking (jersey numbers only) is available under a
per-team URL. Backend is Supabase; frontend is Nuxt 3 with shadcn-vue,
mobile-first. All access control is enforced in the database via RLS
that joins the requester's memberships against the row's `team_id`.

## Technical Context

**Language/Version**: TypeScript 5.6+, strict mode; Node.js 22 LTS.
**Primary Dependencies**: Nuxt 3.13+, `@nuxtjs/supabase`, shadcn-vue,
Tailwind CSS 3.4+, `@supabase/supabase-js` v2 (browser + SSR reads,
enforces RLS via PostgREST-JWT), `drizzle-orm` + `postgres` (server-side
query builder), `drizzle-kit` (schema-as-code migrations),
`@vueuse/core`, `zod` (input validation), `@unovis/vue` + `@unovis/ts`
(charts via shadcn-vue Chart component), `slug` (deterministic slug
generation).
**Storage**: PostgreSQL 15 (Supabase-managed) with RLS on every table;
Supabase Storage bucket `training-photos` keyed by
`<team_id>/<training_id>/<uuid>.<ext>`.
**Testing**: Vitest (unit + component); Playwright (E2E) including a
cross-team RLS negative-test matrix (SC-003, SC-008, SC-009).
**Target Platform**: Web app; mobile Safari + Chrome primary, desktop
secondary; PWA-ready ("Add to Home Screen").
**Project Type**: Web application (single Nuxt project + co-located
`supabase/` schema folder).
**Performance Goals**: SC-001 (2 min per training entry), SC-002
(5 s player dashboard), SC-010 (3 min signup-to-team-founded).
Cold page load ≤3 s on emulated 4G.
**Constraints**: RLS mandatory on every table before ship; no
password-based login; no cross-team data leak (SC-009); no `any` in
TypeScript except with inline justification.
**Scale/Scope**: v1 is multi-tenant but still small: expect ≤50 teams,
≤50 members per team, ≤200 trainings/team/year, ≤20 photos/training,
≤5 GB total storage in first year across all tenants combined.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Gate | Status |
|---|---|---|
| **I. Simplicity First** (NON-NEGOTIABLE) | No abstractions beyond the current requirement; single Nuxt project; Supabase used directly; no state manager unless a real cross-view need appears. | ✅ Pass. Multi-tenant model justified by explicit user requirement; no extra service layer; direct `useSupabaseClient` composables in the browser; server routes use Drizzle for type-safe queries against the same DB; team context lives in URL + a lightweight `useTeamContext` composable, not in a global store. |
| **II. Role-Based Access via Supabase RLS** (NON-NEGOTIABLE) | Every table has RLS + at least one policy; Storage bucket policies match; anonymous public ranking served only via a dedicated view/function. Cross-team access is denied by policy, not by app-layer filter. | ✅ Pass. Every team-scoped table joins `memberships` in its policies via `public.is_member(team_id)` and `public.is_trainer(team_id)` helpers. Storage bucket path is team-prefixed and policy asserts membership plus saved-training visibility. Anonymous ranking uses a narrowly projected `SECURITY DEFINER` function owned by a constrained read-only role. Detailed contract in [contracts/rls-policies.md](./contracts/rls-policies.md). Browser reads/writes go through the Supabase JS client so PostgREST forwards the caller's JWT; server-side Drizzle work uses `useUserDb` which opens a transaction and sets `role = authenticated` + `request.jwt.claims` so RLS still applies. Admin/RPC paths use `useAdminDb` explicitly. |
| **III. Konfigurierbare Punktekategorien** | Categories live as data, editable per team without deploy. | ✅ Pass. `point_categories` is a table scoped by `team_id`; trainer-only CRUD UI. |
| **IV. Mobile-First UX** | Mobile-first Tailwind, ≥44px touch targets, primary flow works on portrait mobile. | ✅ Pass. Design starts at 360×640; grid + team selector + magic-link flow verified on mobile emulation in Polish phase. |
| **V. Type Safety End-to-End** | Nuxt TS strict; Supabase types generated and committed; no `any` without justification. | ✅ Pass. `pnpm gen:types` after every schema-affecting migration; committed under `app/types/database.ts`. |

Additional constraints:

- **Tech Stack** (Nuxt + shadcn-vue + Supabase, German UI / English code): matched.
- **SPA vs SSR**: SSR (Nuxt universal). Magic-link callback is handled cleanly by `@nuxtjs/supabase` in SSR mode.
- **Migrations**: table DDL (columns, PKs, FKs, unique + performance indexes, check constraints) is authored in `db/schema/*.ts` and generated via `pnpm db:generate` (drizzle-kit) into `supabase/migrations/` with a `supabase`-style timestamp prefix so they interleave with the hand-written SQL migrations for RLS/triggers/functions/storage. Every schema-affecting change commits the generated SQL + updated drizzle meta snapshot + regenerated `app/types/database.ts`.

**No violations. Complexity Tracking section intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/001-points-and-photos/
├── plan.md                  # This file (regenerated after Round-2 clarify)
├── spec.md                  # Feature specification (Round-2 baseline)
├── research.md              # Phase 0 output — technology and pattern decisions
├── data-model.md            # Phase 1 output — entities, columns, indexes, RLS helpers
├── quickstart.md            # Phase 1 output — dev bootstrap steps
├── contracts/
│   ├── rls-policies.md          # Per-table + Storage RLS policies + negative-test matrix
│   ├── public-ranking.md        # Public per-team ranking contract
│   ├── auth-flows.md            # Magic-link, onboarding, team-invite flows
│   └── ui-flows.md              # Screen-level UI contracts per US
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (regenerated by /speckit-tasks after this plan)
```

### Source Code (repository root)

```text
app/
├── components/
│   ├── ui/                       # shadcn-vue primitives (button, input, dialog, alert…)
│   ├── auth/                     # LoginMagicLink, OnboardingWizard, TeamCreateForm, InvitationAcceptCard
│   ├── team/                     # TeamSwitcher, MembershipTable, InviteForm, InviteList
│   ├── trainings/                # TrainingPointGrid (incl. consent icon), TrainingPhotoUpload, TrainingPhotoGallery
│   ├── players/                  # PlayerList, PlayerForm, ConsentToggle
│   ├── categories/               # CategoryList, CategoryForm
│   └── stats/                    # RankingTable, PlayerProgressChart, TimeframePicker
├── composables/
│   ├── useTeamContext.ts         # current team from URL; list of memberships
│   ├── useAuth.ts                # sign-in via magic-link, sign-out, invitation-token consumption
│   ├── useTeams.ts               # create team, list my teams
│   ├── useMemberships.ts         # per-team member CRUD (trainer-only)
│   ├── useInvitations.ts         # issue, list, revoke, accept
│   ├── usePlayers.ts
│   ├── useCategories.ts
│   ├── useTrainings.ts
│   ├── useTrainingPhotos.ts
│   ├── useRanking.ts
│   ├── usePlayerScores.ts
│   ├── usePublicRanking.ts       # anon-safe fetch, takes team slug
│   └── useTimeframe.ts
├── layouts/
│   ├── default.vue               # authenticated shell, requires membership; includes TeamSwitcher
│   ├── onboarding.vue            # authenticated but no membership yet — shown for /start
│   └── public.vue                # anonymous shell for /public/**
├── middleware/
│   ├── auth.global.ts            # allow /login, /public/**, /invite/:token; else require session
│   ├── team-context.ts           # for /t/:slug/**, verify membership else redirect to /start
│   └── trainer-only.ts           # deny non-trainer memberships on trainer routes
├── pages/
│   ├── index.vue                 # role-aware landing: session → /t/:lastSlug; else /login
│   ├── login.vue                 # magic-link request form
│   ├── callback.vue              # magic-link + invite-token landing (Supabase auth callback)
│   ├── start.vue                 # signed-in but no membership: "Team gründen" | "Einladung annehmen"
│   ├── invite/[token].vue        # invitation preview + accept
│   ├── t/
│   │   └── [slug]/
│   │       ├── index.vue                 # role-aware landing inside team
│   │       ├── dashboard.vue             # player dashboard
│   │       ├── ranking.vue               # authenticated team ranking
│   │       ├── trainings/
│   │       │   ├── index.vue
│   │       │   ├── new.vue               # trainer only
│   │       │   └── [id].vue
│   │       ├── players/
│   │       │   ├── index.vue             # trainer only
│   │       │   └── [id].vue
│   │       ├── categories/
│   │       │   └── index.vue             # trainer only
│   │       └── team/
│   │           ├── members.vue           # trainer only (Memberships + Invitations)
│   │           └── settings.vue          # trainer only (name, slug, season_start)
│   └── public/
│       └── [slug]/
│           └── ranking.vue                # anonymous public ranking per team
├── plugins/
│   └── supabase.client.ts        # only if bespoke wiring needed
├── server/
│   ├── utils/
│   │   └── db.ts                 # `useAdminDb` (superuser, RLS-bypass for admin ops) + `useUserDb(event, work)` (transaction that sets `role=authenticated` and `request.jwt.claims` so RLS still applies)
│   └── api/
│       ├── invitations/
│       │   ├── issue.post.ts     # trainer-only; Drizzle insert + Supabase Auth admin for the email
│       │   └── accept.post.ts    # calls `public.accept_invitation` RPC via Drizzle
│       └── teams/
│           └── create.post.ts    # unique-slug loop via Drizzle, then `public.create_team_with_trainer` RPC
└── types/
    └── database.ts               # generated by `pnpm gen:types` (Supabase client typings; browser-side only)

db/
└── schema/
    └── index.ts                  # Drizzle schema — source of truth for table DDL, indexes, checks

supabase/
├── config.toml
├── migrations/                   # SQL is the applied source of truth — mix of drizzle-kit-generated (tables) and hand-written (RLS/triggers/functions/storage) files, applied in filename order
│   └── meta/                     # drizzle-kit journal + snapshots (committed)
└── seed.sql                      # local dev only: sample teams and users for e2e

drizzle.config.ts                 # drizzle-kit config: schema → `supabase/migrations/`

tests/
├── e2e/
│   ├── onboarding.spec.ts             # US0: signup → team-create + accept-invitation
│   ├── trainer-flow.spec.ts           # US1
│   ├── player-flow.spec.ts            # US2
│   ├── categories-flow.spec.ts        # US3
│   ├── players-flow.spec.ts           # US4
│   ├── public-anon.spec.ts            # US5
│   ├── photos-flow.spec.ts            # US6
│   ├── rls-negative-single-team.spec.ts   # SC-003
│   └── rls-negative-cross-team.spec.ts    # SC-009
└── unit/
    ├── ranking.spec.ts
    ├── slug.spec.ts
    └── validators.spec.ts

nuxt.config.ts
tailwind.config.ts
components.json
package.json
pnpm-lock.yaml
tsconfig.json
```

**Structure Decision**: Single Nuxt project with a co-located
`supabase/` schema folder — Supabase remains the backend (Postgres +
Auth + Storage). Team-scoped routes live under `/t/[slug]/…`; onboarding
routes live outside the team context so pre-membership users can access
them.

Two data-access surfaces exist and do NOT overlap:

1. **Browser + composables** use `@nuxtjs/supabase` → PostgREST. Every
   request forwards the caller's JWT so RLS enforces access at the DB
   layer. No custom API route is written when the built-in client can
   express the query.
2. **Server routes** (`app/server/api/**`) use Drizzle against Postgres
   directly. `useUserDb` opens a transaction, sets `role = authenticated`
   and `request.jwt.claims`, and runs the caller's work inside it — RLS
   applies exactly as it would for a PostgREST request. `useAdminDb` is
   the escape hatch for admin ops (bypasses RLS; used only for the two
   `SECURITY DEFINER` RPCs and for `auth.admin.inviteUserByEmail`).

Table DDL is authored in `db/schema/*.ts` and generated to
`supabase/migrations/` via `pnpm db:generate`. RLS policies, triggers,
functions, and storage bucket wiring stay in hand-written SQL migrations
so that Postgres-specific security primitives remain first-class. Both
kinds of migration are applied in filename-timestamp order via
`supabase db reset`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

*None. All gates pass under the new multi-tenant scope.*
