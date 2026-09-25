---

description: "Task list for Trainingspunkte & Trainingsfotos v1 (multi-tenant, round 2)"
---

# Tasks: Trainingspunkte & Trainingsfotos (Multi-Tenant)

**Input**: Design documents from `/specs/001-points-and-photos/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included where the plan and constitution require them —
per-user-story E2E, two RLS negative-test suites (single-team SC-003 +
cross-team SC-009), plus unit tests for ranking / slug / validators.

**Organization**: Tasks are grouped by user story so each story can be
implemented, tested, and delivered independently.

**Progress (as of 2026-09-11)**: Setup (Phase 1) + Foundational (Phase 2)
+ US0 (Phase 3) done — 60/110 tasks, US0 E2E green in chromium and
mobile-chrome. Server data layer switched to Drizzle (schema-as-code +
`useUserDb`/`useAdminDb` with RLS-aware transactions) after US0 landed;
browser still on `@nuxtjs/supabase`. Next up: **US1 (Phase 4, T061–T072)
— trainer records point entries + at least one photo per training** (MVP
anchor).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US0..US6 for user-story phases; setup / foundational / polish carry no story label
- Include exact file paths in each description

## Path Conventions

Single Nuxt project. Frontend under `app/`; migrations under `supabase/`; tests under `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap Nuxt + Supabase + tooling.

- [X] T001 Initialize pnpm workspace at repo root with `pnpm init`, set `packageManager: pnpm@9.x` and `engines.node: ">=22 <23"` in `package.json`
- [X] T002 Scaffold Nuxt 3 structure (`nuxt.config.ts`, `tsconfig.json`, `app/`, `.gitignore`) with `pnpm dlx nuxi@latest init`
- [X] T003 [P] Add app dependencies to `package.json`: `nuxt`, `@nuxtjs/supabase`, `@nuxtjs/tailwindcss`, `@vueuse/core`, `zod`, `@unovis/vue`, `@unovis/ts`, `@supabase/supabase-js`, `slug`
- [X] T004 [P] Add dev dependencies to `package.json`: `typescript`, `vitest`, `@nuxt/test-utils`, `@playwright/test`, `eslint`, `prettier`, `supabase`
- [X] T005 Configure `nuxt.config.ts`: enable `@nuxtjs/supabase` and `@nuxtjs/tailwindcss` modules; set `typescript.strict = true` and `typescript.typeCheck = true`; set `ssr: true`; configure `supabase.redirectOptions` to exclude `/login`, `/callback`, `/public/**`, `/invite/**`
- [X] T006 [P] Initialize Tailwind mobile-first in `tailwind.config.ts` and `app/assets/css/main.css`; wire into `nuxt.config.ts`
- [X] T007 [P] Install shadcn-vue via `pnpm dlx shadcn-vue@latest init` (New York style, TypeScript, `app/components/ui`); commit `components.json`
- [X] T008 [P] Configure ESLint + Prettier in `.eslintrc.cjs` + `.prettierrc`; add `lint` and `format` scripts to `package.json`
- [X] T009 Initialize local Supabase via `supabase init`; commit `supabase/config.toml`; enable Inbucket for local email capture
- [X] T010 [P] Add `.env.example` at repo root with `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`, `NUXT_SUPABASE_SERVICE_ROLE_KEY`
- [X] T011 [P] Add pnpm scripts to `package.json`: `dev`, `build`, `preview`, `typecheck`, `test:unit`, `test:e2e`, `gen:types`, `db:reset`
- [X] T012 [P] Configure `playwright.config.ts` with `webServer` running `pnpm dev` on `http://localhost:3000`
- [X] T013 [P] Configure `vitest.config.ts` with `@nuxt/test-utils/config` and `jsdom` environment
- [X] T014 Add `.gitignore` entries: `.env`, `.output/`, `.nuxt/`, `node_modules/`, `dist/`, `playwright-report/`, `.supabase/`

**Checkpoint**: `pnpm dev` boots empty Nuxt; `supabase start` boots Postgres+Auth+Inbucket.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RLS helpers, RLS policies on every table, Storage, auth wiring, layouts, middlewares. Blocks all user stories.

### Database schema

- [X] T015 Migration `supabase/migrations/20260910120000_init_teams.sql` — create tables `teams`, `memberships` (composite PK, `role` check), `invitations` (unique `token`, partial unique on `(team_id, email) where accepted_at is null`) per [data-model.md](./data-model.md)
- [X] T016 Migration `supabase/migrations/20260910120500_helpers.sql` — `public.is_member(uuid)`, `public.is_trainer(uuid)`, RLS-protected `public.user_profiles` table and profile sync trigger
- [X] T017 Migration `supabase/migrations/20260910121000_team_scoped_tables.sql` — create `players`, `point_categories`, `trainings`, `training_photos`, `point_entries`, `team_settings` with `team_id` FKs, partial unique indexes (`players_active_jersey_per_team_uniq`, `players_linked_user_per_team_uniq`), other indexes per [data-model.md](./data-model.md)
- [X] T018 Migration `supabase/migrations/20260910121500_triggers.sql` — audit `set_last_updated_at()` on all mutable tables; `prevent_last_trainer_change()` on `memberships`; `enforce_point_entry_range()`; `enforce_point_entry_team_consistency()`; `enforce_training_has_photo()`; `enforce_photo_path_team()`; `enforce_player_linked_user_membership()`; `bootstrap_team_settings()` on `after insert on teams`
- [X] T019 Migration `supabase/migrations/20260910122000_rls_enable.sql` — `alter table … enable row level security` for every base table

### RLS policies

- [X] T020 [P] Migration `supabase/migrations/20260910122100_rls_teams.sql` with policies `teams_read_membership`, `teams_update_trainer` per [contracts/rls-policies.md](./contracts/rls-policies.md)
- [X] T021 [P] Migration `supabase/migrations/20260910122200_rls_memberships.sql` with `memberships_read_self_or_teamtrainer`, `memberships_write_trainer`
- [X] T022 [P] Migration `supabase/migrations/20260910122300_rls_invitations.sql` with `invitations_read_team_trainer`, `invitations_read_own_email`, `invitations_write_trainer`, `invitations_accept_own_email`
- [X] T023 [P] Migration `supabase/migrations/20260910122400_rls_players.sql` with `players_read_member`, `players_write_trainer`
- [X] T024 [P] Migration `supabase/migrations/20260910122500_rls_categories.sql` with `pc_read_member`, `pc_write_trainer`
- [X] T025 [P] Migration `supabase/migrations/20260910122600_rls_trainings.sql` with `tr_read_member_saved`, `tr_write_trainer`
- [X] T026 [P] Migration `supabase/migrations/20260910122700_rls_training_photos.sql` with join-through-trainings policies
- [X] T027 [P] Migration `supabase/migrations/20260910122800_rls_point_entries.sql` with `pe_read_member`, `pe_write_trainer` (join-through-trainings)
- [X] T028 [P] Migration `supabase/migrations/20260910122900_rls_team_settings.sql` with `ts_read_member`, `ts_write_trainer`

### Storage bucket

- [X] T029 Migration `supabase/migrations/20260910123000_storage_photos.sql` — insert private bucket `training-photos` with a 10 MB limit and the five supported image MIME types; policies `tphoto_read_member`, `tphoto_write_trainer` validate both team and training IDs from the path

### Ranking + public functions

- [X] T030 Migration `supabase/migrations/20260910123500_functions.sql` — `get_team_ranking(uuid, date, date)`, `get_player_scores_by_category(uuid, uuid, date, date)`, and a placeholder `get_public_ranking(text, date, date)` (real body written in US5 migration); revoke default execution from `PUBLIC`, `anon`, and `service_role` for the authenticated-only functions, grant those only to `authenticated`, and grant the public function only to `authenticated` and `anon`
- [X] T031 Regenerate types via `pnpm gen:types` and commit `app/types/database.ts`

### Auth / layouts / middlewares scaffolding

- [X] T032 Configure Supabase Auth for local dev in `supabase/config.toml`: disable email/password login, enable OTP magic-link, set email templates for invite + magic-link
- [X] T033 [P] Middleware `app/middleware/auth.global.ts` — allow `/login`, `/callback`, `/public/**`, `/invite/**`; else require session; else redirect `/login?redirect=<path>`
- [X] T034 [P] Middleware `app/middleware/team-context.ts` — for routes matching `/t/[slug]/**`: verify caller has membership in the team resolved from `slug`; else redirect `/start`
- [X] T035 [P] Middleware `app/middleware/trainer-only.ts` — for trainer-only sub-routes: assert `role === 'trainer'` in the current team context; else redirect `/t/<slug>/dashboard`
- [X] T036 [P] Layout `app/layouts/default.vue` — top nav with `TeamSwitcher`, user menu, sign-out; only for team-context routes
- [X] T037 [P] Layout `app/layouts/onboarding.vue` — bare shell for `/start`
- [X] T038 [P] Layout `app/layouts/public.vue` — bare shell for `/public/**`
- [X] T039 [P] Composable `app/composables/useAuth.ts` — `signInWithMagicLink(email, redirect?)`, `signOut()`, `useSession()`, reactive `email`
- [X] T040 [P] Composable `app/composables/useTeamContext.ts` — reactive `currentSlug` from route, `memberships[]` from DB, `currentTeam`, `isTrainer`
- [X] T041 [P] Page `app/pages/index.vue` — role-aware landing: session + memberships → `/t/<lastSlug>`; session + no memberships → `/start`; else `/login`

**Checkpoint**: Migrations apply cleanly, RLS is on every table, Storage is set up, empty shell renders in each layout, middlewares redirect correctly.

---

## Phase 3: User Story 0 — Signup, Team-Gründung, Einladungs-Annahme (Priority: P1)

**Goal**: A new user signs up via magic-link, either founds a team (becoming its trainer) or accepts an invitation from an existing trainer; both flows land in `/t/<slug>/…` with appropriate role.

**Independent Test**: Two fresh browsers. User A signs up, founds "Test-Team", invites User B as player. User B receives the email in Inbucket, clicks the link, accepts, lands in `/t/test-team/dashboard`. Attempting `/t/other-team/*` redirects to `/start`.

### Tests for User Story 0

- [X] T042 [P] [US0] Playwright test `tests/e2e/onboarding.spec.ts` — full US0 acceptance scenarios 1–5 (magic-link signup, team creation, invite issuance, invitation acceptance, last-trainer guard)
- [X] T043 [P] [US0] Unit test `tests/unit/slug.spec.ts` — golden-master for the `slug()` helper: unicode → ASCII, collisions → suffix `-2`, `-3`, stability of alpha-numeric edge cases

### Implementation for User Story 0

- [X] T044 [P] [US0] Server route `app/server/api/teams/create.post.ts` — validate the authenticated session, pass the verified session user ID explicitly to one transactional RPC/database function restricted to `service_role`, and use that ID for both `teams.created_by` and `memberships.user_id`; separate REST inserts are prohibited; body `{name: string, slug?: string}`; returns `{slug}`
- [X] T045 [P] [US0] Server route `app/server/api/invitations/issue.post.ts` — trainer-only (verify via authenticated Supabase client + `is_trainer(team_id)`); body `{team_id, email, role}`; generate 32-char URL-safe token; insert `invitations`; call `supabase.auth.admin.inviteUserByEmail` with `redirectTo`=`<origin>/invite/<token>`
- [X] T046 [P] [US0] Server route `app/server/api/invitations/accept.post.ts` — body `{token}`; validate not expired, not accepted, and exact session-email match; reject mismatches server-side; call one transactional RPC/database function that atomically inserts membership (on conflict do nothing) and sets `accepted_at`; no `force` flag or cross-email confirmation
- [X] T047 [P] [US0] Composable `app/composables/useTeams.ts` — `createTeam({name, slug})` (POST /api/teams/create), `myTeams()` (list memberships joined with teams)
- [X] T048 [P] [US0] Composable `app/composables/useInvitations.ts` — `issue({team_id, email, role})`, `listOpenByTeam(team_id)`, `listMineByEmail()`, `revoke(id)`, `accept(token)`
- [X] T049 [P] [US0] Component `app/components/auth/LoginMagicLink.vue` — single email input; submit → `useAuth.signInWithMagicLink`; shows "Prüfe deine E-Mails" success state
- [X] T050 [P] [US0] Component `app/components/auth/TeamCreateForm.vue` — zod-validated (name required, optional slug); submit → `useTeams.createTeam`; on success navigate `/t/<slug>`
- [X] T051 [P] [US0] Component `app/components/auth/InvitationAcceptCard.vue` — shows team name + offered role + expiry; "Annehmen" button → `useInvitations.accept`; handles rejected email mismatches with a sign-in-as-invited-email prompt
- [X] T052 [P] [US0] Component `app/components/team/InviteForm.vue` — zod-validated (email + role); submit → `useInvitations.issue`
- [X] T053 [P] [US0] Component `app/components/team/InviteList.vue` — reads open invitations for the current team; "Widerrufen" per row
- [X] T054 [P] [US0] Component `app/components/team/MembershipTable.vue` — reads memberships for the current team; role dropdown per row (trainer-only); "Entfernen" per row; error toasts surface the last-trainer trigger error
- [X] T055 [P] [US0] Component `app/components/team/TeamSwitcher.vue` — dropdown of `useTeamContext.memberships`; selecting one navigates `/t/<slug>/`
- [X] T056 [US0] Page `app/pages/login.vue` — renders `LoginMagicLink`
- [X] T057 [US0] Page `app/pages/callback.vue` — reads Supabase auth callback; after session, calls `useTeams.myTeams()` and redirects (to `/start`, `/t/<slug>`, or the `redirect` query param)
- [X] T058 [US0] Page `app/pages/start.vue` — layout `onboarding`; renders `TeamCreateForm` + list of open invitations for `auth.email` (via `useInvitations.listMineByEmail`)
- [X] T059 [US0] Page `app/pages/invite/[token].vue` — either preview `InvitationAcceptCard` or (if unauthenticated) prompt for email + `signInWithMagicLink` with `redirect` back to same page
- [X] T060 [US0] Page `app/pages/t/[slug]/team/members.vue` — trainer-only; renders `MembershipTable` + `InviteList` + `InviteForm`

**Checkpoint**: US0 works end-to-end — signup, team-founding, invitation issuance, invitation acceptance, membership management. All other stories can now build on the assumption of a valid team context.

---

## Phase 4: User Story 1 — Trainer erfasst Punkte + Foto (Priority: P1) 🎯 MVP anchor

**Goal**: Inside a team, a trainer creates a training, enters point values for active players across active categories, uploads ≥1 photo, and saves. The training is visible in the team's training list.

**Independent Test**: With `/t/<slug>/…` open as a trainer of a seeded team (US0 seed), create a training, fill grid, upload photo, save, see the training in `/t/<slug>/trainings`.

### Tests for User Story 1

- [X] T061 [P] [US1] Playwright test `tests/e2e/trainer-flow.spec.ts` — full US1 acceptance scenarios inside a team context

### Implementation for User Story 1

- [X] T062 [P] [US1] Composable `app/composables/usePlayers.ts` — `listActive(team_id)` returning active players ordered by `jersey_number nulls last, name`
- [X] T063 [P] [US1] Composable `app/composables/useCategories.ts` — `listActive(team_id)` returning active categories ordered by `sort_order`
- [X] T064 [P] [US1] Composable `app/composables/useTrainings.ts` — `createDraft(team_id, date, title?, note?)`, `updateEntry({training_id, player_id, category_id, value})`, `save(training_id)`, `list(team_id)`, `get(id)`
- [X] T065 [US1] Composable `app/composables/useTrainingPhotos.ts` — `upload(training_id, team_id, file)` (validates MIME + size, uploads to `training-photos/<team_id>/<training_id>/<uuid>.<ext>`), `list(training_id)` returning signed URLs (600 s TTL)
- [X] T066 [P] [US1] Component `app/components/trainings/TrainingPointGrid.vue` — sticky-header table, rows=players, cols=categories, `input type="number"` with per-category `min/max`, auto-save on blur; ≥44px min-height per row
  - **Superseded 2026-09-25**: the sticky header was removed. It never actually tracked the page scroll (a CSS overflow/position:sticky containing-block issue — the table's own horizontally-scrolling wrapper, not the page, was always the nearest scroll container), and confining it to a bounded, separately-scrolling box produced a second, unwanted scrollbar nested inside the page. The table now scrolls with the page only; the left player-name column stays `sticky left-0` within the table's horizontal scroll, unaffected by this.
- [X] T067 [P] [US1] Component `app/components/trainings/TrainingPhotoUpload.vue` — multi-file picker; per-file progress + error
- [X] T068 [P] [US1] Component `app/components/trainings/ConsentWarningBanner.vue` — red shadcn `Alert` listing active players without `photo_consent`
- [X] T069 [US1] Page `app/pages/t/[slug]/trainings/new.vue` — trainer-only; creates a draft on mount, renders grid + uploader + banner; photos are optional; on save transitions to `saved` and navigates to `[id].vue`
- [X] T070 [US1] Page `app/pages/t/[slug]/trainings/[id].vue` — trainer sees editor; player sees read-only summary; shows `last_updated_by/at`
- [X] T071 [US1] Page `app/pages/t/[slug]/trainings/index.vue` — chronological list; trainer sees drafts + saved; player sees only saved
- [X] T072 [P] [US1] Unit test `tests/unit/validators.spec.ts` — zod schemas for point-value range, photo (MIME + size), date (no future)

**Checkpoint**: MVP loop closed inside a team context.

---

## Phase 5: User Story 2 — Spieler sieht Rangliste + Zeitverlauf (Priority: P1)

**Goal**: A player sees their team's ranking and their own per-category progression chart with team average + median lines.

**Independent Test**: Signed-in player of the seeded team sees rank in `/t/<slug>/dashboard`; `/t/<slug>/players/<me>` renders per-category charts.

### Tests for User Story 2

- [X] T073 [P] [US2] Playwright test `tests/e2e/player-flow.spec.ts` — dashboard rank + own progress chart in current team
- [X] T074 [P] [US2] Unit test `tests/unit/ranking.spec.ts` — golden-master seed asserts `get_team_ranking(team_id, from, to)` outputs the expected tie pattern (1, 2, 2, 4) and lexicographic order across categories

### Implementation for User Story 2

- [X] T075 [P] [US2] Composable `app/composables/useRanking.ts` — wraps `rpc('get_team_ranking', {p_team, p_from, p_to})`
- [X] T076 [P] [US2] Composable `app/composables/usePlayerScores.ts` — wraps `get_player_scores_by_category`; derives team avg / median per category over the same timeframe (skipping null point_entries)
- [X] T077 [P] [US2] Composable `app/composables/useTimeframe.ts` — presets `last-4-weeks | season | custom`, persisted in `localStorage` per team slug
- [X] T078 [P] [US2] Component `app/components/stats/TimeframePicker.vue` — shadcn `Select` + custom date range inputs
- [X] T079 [P] [US2] Component `app/components/stats/RankingTable.vue` — shadcn `Table` bound to `useRanking` output
- [X] T080 [US2] Component `app/components/stats/PlayerProgressChart.vue` — one Unovis line chart per active category; player series + team avg + team median dashed lines
- [X] T081 [US2] Page `app/pages/t/[slug]/dashboard.vue` — role-aware player dashboard: rank, top-3, timeframe picker
- [X] T082 [US2] Page `app/pages/t/[slug]/players/[id].vue` — player detail with `PlayerProgressChart` and basic info (name, jersey, position when set)
- [X] T083 [US2] Page `app/pages/t/[slug]/ranking.vue` — full team ranking view

**Checkpoint**: US2 complete inside a team context.

---

## Phase 6: User Story 3 — Trainer verwaltet Kategorien (Priority: P2)

**Goal**: Trainer manages team-scoped categories; new category appears as an additional grid column in the next training.

**Independent Test**: Trainer on `/t/<slug>/categories` creates "Fairness" (0..5, sort_order 2); `/t/<slug>/trainings/new` shows it as second column.

### Tests for User Story 3

- [X] T084 [P] [US3] Playwright test `tests/e2e/categories-flow.spec.ts` — create, rename, reorder, deactivate; check propagation to `/trainings/new`

### Implementation for User Story 3

- [X] T085 [US3] Extend `app/composables/useCategories.ts` with `create(team_id, …)`, `update(id, …)`, `deactivate(id)`, `reorder(team_id, [{id, sort_order}])`
- [X] T086 [P] [US3] Component `app/components/categories/CategoryForm.vue` — zod-validated (name, value_min ≤ value_max, sort_order, active)
- [X] T087 [P] [US3] Component `app/components/categories/CategoryList.vue` — up/down buttons (touch-friendly), "Deaktivieren" action, delete action hidden when `point_entries` exist (checked via count query)
- [X] T088 [US3] Page `app/pages/t/[slug]/categories/index.vue` — trainer-only; renders `CategoryList` + "Neue Kategorie" dialog with `CategoryForm`

**Checkpoint**: US3 complete.

---

## Phase 7: User Story 4 — Trainer verwaltet Spielerstamm (Priority: P2)

**Goal**: Trainer manages players (name, jersey, position, `photo_consent`, `active`) and links them to invited accounts.

**Independent Test**: Trainer on `/t/<slug>/players` adds a player, toggles consent, invites the player as a `player`-role membership; the invited user, upon acceptance, sees the same team's `/t/<slug>/dashboard`.

### Tests for User Story 4

- [X] T089 [P] [US4] Playwright test `tests/e2e/players-flow.spec.ts` — CRUD, consent toggle, active-jersey-uniqueness violation surfaced, `linked_user_id` set via invite

### Implementation for User Story 4

- [X] T090 [US4] Extend `app/composables/usePlayers.ts` with `list(team_id)`, `create(team_id, …)`, `update(id, …)`, `setActive(id, value)`, `setConsent(id, value)`, `linkUser(id, user_id)` (sets `linked_user_id`)
- [X] T091 [P] [US4] Component `app/components/players/PlayerForm.vue` — zod-validated (name required, jersey optional int, position optional, consent, active)
- [X] T092 [P] [US4] Component `app/components/players/PlayerList.vue` — table with edit / deactivate / invite actions; consent toggle inline; invite CTA opens the same `InviteForm` with pre-filled role=`player`
- [X] T093 [US4] Page `app/pages/t/[slug]/players/index.vue` — trainer-only; renders `PlayerList` + "Neuer Spieler" dialog with `PlayerForm`

**Checkpoint**: US4 complete. Players end-to-end managed.

---

## Phase 8: User Story 5 — Anonyme Public-Rangliste pro Team (Priority: P3)

**Goal**: Anonymous visitors read a team's ranking by jersey number.

**Independent Test**: In a private window, `/public/<slug>/ranking` shows the ranking; `select * from point_entries` as anon is denied; team `id` never appears in the response.

### Migrations

- [X] T094 [US5] Migration `supabase/migrations/20260915170000_public_ranking.sql` — replace placeholder body of `public.get_public_ranking(text, date, date)` with real `SECURITY DEFINER` implementation using a dedicated `public_ranking_reader` role that has minimum `select` grants per [contracts/public-ranking.md](./contracts/public-ranking.md); `grant execute` to `anon, authenticated` (filename bumped from the task's original `20260912100000` to stay after the US3/US4 migrations already on `main`)
- [X] T095 [US5] Regenerate types via `pnpm gen:types` and commit `app/types/database.ts`

### Tests for User Story 5

- [X] T096 [P] [US5] Playwright test `tests/e2e/public-anon.spec.ts` — visit `/public/<seeded-slug>/ranking` without session; verify data shape (jersey + rank + per-category sums only); direct `from('point_entries').select()` as anon returns empty

### Implementation for User Story 5

- [X] T097 [P] [US5] Composable `app/composables/usePublicRanking.ts` — calls `rpc('get_public_ranking', {p_slug, p_from, p_to})` using the anon client
- [X] T098 [US5] Page `app/pages/public/[slug]/ranking.vue` — uses `layouts/public.vue`; renders a `RankingTable` variant that shows only jersey + rank + category sums; `TimeframePicker` bound to `usePublicRanking`; null jersey rendered as "—"

**Checkpoint**: US5 complete.

---

## Phase 9: User Story 6 — Trainingsfoto-Galerie mit Consent (Priority: P3)

**Goal**: Any authenticated team member sees photos of a training; consent-blocked training shows placeholder for `player` viewers.

**Independent Test**: Player of team opens `/t/<slug>/trainings/:id` — consent-clean training renders gallery; consent-blocked training renders placeholder text; anon cannot reach the file.

### Tests for User Story 6

- [X] T099 [P] [US6] Playwright test `tests/e2e/photos-flow.spec.ts` — player sees photos of consent-clean training and placeholder for consent-blocked training; direct Storage URL access as anon is denied

### Implementation for User Story 6

- [X] T100 [P] [US6] Extend `app/composables/useTrainingPhotos.ts` with `deriveConsentStatus(team_id)` — returns `clean` iff every active player in the team has `photo_consent = true`
- [X] T101 [US6] Component `app/components/trainings/TrainingPhotoGallery.vue` — mobile-scroll grid; renders placeholder overlay for `player` role when consent is `blocked`; trainer always sees raw thumbnails
- [X] T102 [US6] Wire `TrainingPhotoGallery` into `app/pages/t/[slug]/trainings/[id].vue` — also fixes a pre-existing bug found while writing T099's e2e test: a player's first-ever (SSR) visit to this page could permanently render "Training nicht gefunden" because `load()` gated everything on `useTeamContext()`'s async membership lookup, which can still be in flight on a cold visit, and the `watch`-based refetch never re-fired once it resolved (no observable value *change* across hydration). Fixed by deriving `team_id` from the fetched training row itself instead.

**Checkpoint**: US6 complete.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Deliver security guarantees (SC-003, SC-008, SC-009), performance targets (SC-001, SC-002, SC-010), deployment readiness, docs.

- [X] T103 [P] Playwright RLS single-team negative suite `tests/e2e/rls-negative-single-team.spec.ts` implementing rows N1..N6 from [contracts/rls-policies.md](./contracts/rls-policies.md); delivers SC-003
- [X] T104 [P] Playwright RLS cross-team negative suite `tests/e2e/rls-negative-cross-team.spec.ts` implementing rows X1..X10; delivers SC-009 and SC-008
- [X] T105 [P] Manual perf verification: on 4G-emulated mobile time US0 signup + team-create (SC-010 ≤3 min), US1 flow (SC-001 ≤2 min), US2 dashboard load (SC-002 ≤5 s); record in `specs/001-points-and-photos/perf-notes.md`
- [X] T106 [P] ~~Add `vercel.json`~~ — superseded: deployment target changed to self-hosted (netcup VPS), not Vercel (see [research.md R14](./research.md)). No PaaS config file needed; Nuxt's default `node-server` Nitro preset already produces a portable server. Documented required env vars and the Supabase redirect-allowlist requirement in [quickstart.md](./quickstart.md)
- [X] T107 [P] Add `README.md` at repo root — 20-line "How to run" + links to `specs/001-points-and-photos/quickstart.md` and `spec.md`
- [X] T108 [P] CI config `.github/workflows/ci.yml` — `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:e2e` against local Supabase booted in-job
- [X] T109 Update `.specify/memory/constitution.md`: close `TODO(DEPLOYMENT_TARGET)` with self-hosted netcup VPS + Supabase Cloud (not Vercel, per corrected R14); note the auth-model change (magic-link only) in the Tech Stack section; bump version to `1.1.0` (MINOR — expanded guidance) with a fresh Sync Impact Report
- [X] T110 Page `app/pages/t/[slug]/team/settings.vue` — trainer-only; edit team name + slug (with warning) + season_start; updates `teams` and `team_settings`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no deps.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **US0 (Phase 3, P1)**: after Foundational. **BLOCKS** US1..US6 because every other story needs a team context and a user with a membership.
- **US1 (Phase 4, P1)**: after US0.
- **US2 (Phase 5, P1)**: after US0; can start in parallel with US1 once T094 is not yet needed (T075/T076 depend only on T030 which is Foundational).
- **US3 / US4 (Phases 6, 7, P2)**: after US0. Independent of US1/US2 code path.
- **US5 (Phase 8, P3)**: after US0. Real `get_public_ranking` body is written in T094; the placeholder from T030 keeps types stable in the meantime.
- **US6 (Phase 9, P3)**: after US1 (needs at least one saved training with photos).
- **Polish (Phase 10)**: after all desired user stories.

### Within each user story

- Migrations before composables; composables before components; components before pages.
- Tests can be authored in parallel with implementation but MUST pass before the phase is "done".
- Commit after each logical group.

### Parallel opportunities

- All setup tasks marked [P] (T003–T014 minus T005/T009/T014).
- RLS policy migrations T020–T028 are independent files → parallel.
- Composables + components within a story are usually independent files → parallel.
- Different user stories can be built in parallel by different contributors once US0 is done.

---

## Parallel Example: US0

```bash
# After T042/T043 (tests authored), launch these in parallel:
Task: "T044 server route app/server/api/teams/create.post.ts"
Task: "T045 server route app/server/api/invitations/issue.post.ts"
Task: "T046 server route app/server/api/invitations/accept.post.ts"
Task: "T047 composable app/composables/useTeams.ts"
Task: "T048 composable app/composables/useInvitations.ts"
Task: "T049 component app/components/auth/LoginMagicLink.vue"
Task: "T050 component app/components/auth/TeamCreateForm.vue"
Task: "T051 component app/components/auth/InvitationAcceptCard.vue"
Task: "T052 component app/components/team/InviteForm.vue"
Task: "T053 component app/components/team/InviteList.vue"
Task: "T054 component app/components/team/MembershipTable.vue"
Task: "T055 component app/components/team/TeamSwitcher.vue"
```

---

## Implementation Strategy

### MVP First (US0 + US1)

1. Phase 1 Setup.
2. Phase 2 Foundational (CRITICAL — blocks all).
3. Phase 3 US0 (signup + team + invite) — **without US0, no user story is testable**.
4. Phase 4 US1 (trainer point entry) — closes the first value loop.
5. **STOP and VALIDATE** — run T042 + T061 and walk the acceptance scenarios manually on mobile.
6. Vercel preview deploy.

### Incremental Delivery

- After MVP (US0+US1) → US2 → US3+US4 in parallel → US5+US6 in parallel → Polish.

### Parallel Team Strategy

- All: Setup + Foundational + US0.
- Then Dev A: US1; Dev B: US2; Dev C: US3+US4; Dev D: US5 (after T094 lands) + US6.

---

## Notes

- [P] = different files, no incomplete dependency.
- [US#] labels bind tasks to spec.md acceptance scenarios.
- Every schema-affecting migration (T015–T018, T030, T094, plus any polish migration) MUST be paired with a `pnpm gen:types` commit before the next task proceeds (Constitution Principle V).
- The cross-team negative suite (T104) is essential — do not skip.
