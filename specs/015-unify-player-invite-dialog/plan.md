# Implementation Plan: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

**Branch**: `015-unify-player-invite-dialog` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-unify-player-invite-dialog/spec.md`

## Summary

Collapse `PlayerForm.vue`'s three create-time modes (manual / link-existing-account / invite) into
one flat form used for both create and edit, add a persistent `players.email` column (nullable,
unique per team, case-insensitive) as the durable "email on file," and turn the roster's
"Einladen" button into a direct, dialog-free (re)send action gated on that column plus
`linked_user_id`. Reactivation stays exclusively the "Aktiv im Kader" checkbox in the edit dialog
(no new button). Two small backend changes make this possible: `POST /api/invitations/issue`
becomes idempotent per `player_id` (updates an existing open invitation instead of failing on
`invitations_player_open_uniq`), and a new trainer-gated route corrects a linked player's real
login e-mail via `admin.auth.admin.updateUserById(...)` instead of delete-and-recreate. The
players roster page's separate generic invite dialog (`isInviteDialogOpen` / `InviteForm.vue`
wiring) is removed as dead code; `InviteForm.vue` remains the members-page workflow, with its
optional player-precreate sub-flow additionally persisting the invitation email.

## Technical Context

**Language/Version**: TypeScript 5.6+, strict mode; Node.js 22 LTS — same stack, no new runtime.
**Primary Dependencies**: None new. Reuses `zod`, `drizzle-orm`, the existing `serverSupabaseServiceRole`/`serverSupabaseUser` helpers, and `app/server/utils/db.ts`'s `requireTrainer`/`useAdminDb` (already used by `issue.post.ts` and `profile/moderate.post.ts`, which is the direct precedent for the new email-correction route's `admin.auth.admin.*` call shape).
**Storage**: PostgreSQL (Supabase-managed). One new nullable column, `players.email`, plus one new partial unique index (`players_email_per_team_uniq`, mirroring the existing `players_active_jersey_per_team_uniq` pattern). The migration backfills unambiguous addresses from linked Auth users or invitation history before creating the index; no new tables.
**Testing**: Vitest for any pure logic worth isolating (e.g. the "can invite / is linked" visibility predicate, if it ends up non-trivial enough to extract — otherwise covered inline by the e2e specs, per Simplicity). Playwright e2e: rewrite the mode-based subtests in `tests/e2e/players-flow.spec.ts` (link/invite radio assertions no longer apply) and extend `tests/e2e/invitation-mail.spec.ts` for idempotent resend, concurrent resend, and preserving the previous invitation when mail delivery fails — same fixture/seed strategy already used by both files, no new test infrastructure.
**Target Platform**: Existing web app. `POST /api/invitations/issue` gains idempotent-resend behavior (no route added there); one new route, `POST /api/players/[player_id]/email`, added for the linked-player email correction — no new deployment target.
**Project Type**: Web application — extends the existing single Nuxt project, no new project.
**Performance Goals**: None new. Both affected actions are single-click, single-row admin operations at the scale of one team's roster (bounded per Constitution's Simplicity rationale) — negligible volume.
**Constraints**: RLS mandatory (Principle II) — the new `players.email` column needs no new policy, since `players_write_trainer`/`players_read_member` already cover every column on the table. The new server route re-derives authorization itself (`requireTrainer`) exactly like `issue.post.ts` and `profile/moderate.post.ts` already do, rather than inventing a new authorization mechanism. It must validate and normalize a non-empty email for linked players, preflight team uniqueness, and compensate if Auth and the database cannot be updated consistently.
**Scale/Scope**: One team, one squad (per Constitution's Simplicity rationale) — email-uniqueness and idempotent-resend checks are both simple, unindexed-scale lookups scoped to a single team's roster.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 ([`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)).

| Principle | Gate | Status |
|---|---|---|
| **I. Simplicity First** (NON-NEGOTIABLE) | No new abstraction/service without present-day need; reuse existing patterns. | ✅ Pass. No new invite endpoint — the existing `issue.post.ts` is made idempotent in place and reused by both the dialog checkbox and the list button. The one new route (`players/[player_id]/email.post.ts`) mirrors `profile/moderate.post.ts`'s exact `requireTrainer` + `serverSupabaseServiceRole` + `admin.auth.admin.*` shape rather than inventing a new authorization pattern. The "link existing account" mode is *removed* from the dialog (net simplification), not replaced by something new. `InviteForm.vue` keeps its load-bearing members-page workflow; the only added write is persisting the email that already belongs to the pre-created player row. |
| **II. Role-Based Access via Supabase RLS** (NON-NEGOTIABLE) | Every table + at least one policy; cross-boundary access denied by policy, not app logic. | ✅ Pass. `players.email` is covered by the existing `players_read_member`/`players_write_trainer` policies (they gate the whole row, not specific columns) — no new policy needed. The new email-correction route needs `service_role` (to call `admin.auth.admin.updateUserById`), so — like `issue.post.ts` and `profile/moderate.post.ts` before it — it re-checks the caller's trainer role itself via `requireTrainer` before touching anything, rather than relying on RLS it deliberately bypasses. See [contracts/rls-policies.md](./contracts/rls-policies.md). |
| **III. Konfigurierbare Punktekategorien** | N/A — feature does not touch point categories. | ✅ N/A |
| **IV. Mobile-First UX** | New UI usable on ≥360px portrait; ≥44px touch targets. | ✅ Pass. Reuses the existing dialog/table/`ShadcnCheckbox`/`ShadcnButton` components at their existing touch-target sizing; the change is field composition and button wiring, not new layout primitives. |
| **V. Type Safety End-to-End** | Schema change → regenerate + commit Supabase types. | ✅ Pass. `players.email` is added via Drizzle (`pnpm db:generate` → hand-reviewed migration), and `pnpm gen:types` output is committed in the same change, same as every prior schema change. |

**No violations. Complexity Tracking section intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/015-unify-player-invite-dialog/
├── plan.md                  # This file
├── spec.md                  # Feature specification
├── research.md              # Phase 0 output — technical decisions
├── data-model.md            # Phase 1 output — schema delta
├── contracts/
│   └── rls-policies.md      # RLS delta (none) + the two route contracts
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (/speckit.tasks, not this command)
```

### Source Code (repository root, delta only — rest of the app is unchanged)

```text
app/
├── components/players/
│   ├── PlayerForm.vue        # Collapse 3-mode radio to one flat form; add `email` input + "Direkt einladen"
│   │                          # checkbox (enabled only when email set and not linked); on submit, branch email
│   │                          # handling by `linked_user_id` (plain field vs. auth-email-correction route);
│   │                          # drop the "link" mode and its candidate-select UI (stays reachable via PlayerList's
│   │                          # existing Konto column, unchanged); drop the create-time-only rollback-on-invite-
│   │                          # failure `remove(createdPlayerId)` path (research.md §5)
│   └── PlayerList.vue         # "Einladen" button: remove the `emit('invite')` / dialog trigger, call
│                               # `useInvitations().issue(...)` directly on click instead; disable when
│                               # `!row.email || row.linked_user_id`; add `row.email` to the `list()` projection
├── pages/t/[slug]/players/
│   └── index.vue              # Remove `isInviteDialogOpen`, `openInviteDialog`, `onInvited`, the `InviteForm`
│                               # import and its dialog block, and the `@invite` listener on `PlayerList`; extend
│                               # the local `PlayerRow` type with `email` and `linked_user_id`
├── composables/
│   └── usePlayers.ts          # `Player`/`ActivePlayer`-adjacent types + `list()`/`create()`/`update()` gain
│                               # optional `email`; new thin wrapper `updateLinkedEmail(id, email)` →
│                               # `POST /api/players/[player_id]/email` (mirrors `useInvitations().issue`'s
│                               # `$fetch` wrapper shape)
├── components/team/
│   └── InviteForm.vue         # Keep the existing members-page workflow; persist its pre-created
│                              # player's invitation email in `players.email`
└── server/api/
    ├── invitations/
    │   └── issue.post.ts      # Idempotent per `player_id`: inside the existing transaction, look up an open
    │                           # (`accepted_at is null`) invitation for this `player_id` first; if found, UPDATE
    │                           # its `email`/`token`/`expires_at` in place instead of inserting, then send the
    │                           # magic link as today; if not found, insert as today (unchanged path)
    └── players/
        └── [player_id]/
            └── email.post.ts  # New. Trainer-gated (`requireTrainer`), service-role: verifies the player
                                 # belongs to `team_id` and is linked (`linked_user_id` not null), calls
                                 # `admin.auth.admin.updateUserById(linked_user_id, { email, email_confirm: true })`,
                                 # syncs `players.email` on success; on failure, compensates the Auth change,
                                 # leaves the player row untouched, and surfaces the error

db/schema/index.ts               # + `email: text('email')` on `players`, + `players_email_per_team_uniq`
                                   # partial unique index (mirrors `players_active_jersey_per_team_uniq`)

supabase/migrations/
└── <ts>_players_email.sql       # column + backfill + unique index (index after backfill)

app/types/database.ts            # regenerated via `pnpm gen:types` (Constitution Principle V)

tests/e2e/
├── players-flow.spec.ts         # Rewrite the mode-based subtests (invite/link radio assertions); add: create
│                                 # without email, edit to add email + "Direkt einladen", resend via list button
│                                 # (incl. while an invitation is already open), reactivate via edit checkbox,
│                                 # per-team email-uniqueness rejection, linked-player email correction
└── invitation-mail.spec.ts      # Add: resending an already-open invitation succeeds instead of 409ing
```

**Structure Decision**: Extends the existing single Nuxt project and the existing player-management
vertical slice (001-points-and-photos, extended by 006-player-detail-edit) — no new project, no new
page. The one schema change is additive and column-scoped, read/written through the existing
RLS-gated Supabase browser client exactly like every other `players` column today. The one
genuinely new server-side piece, the email-correction route, reuses the exact
`requireTrainer` + `serverSupabaseServiceRole` shape `profile/moderate.post.ts` already established
for "trainer corrects something about a linked account" — not a new authorization pattern.
`issue.post.ts` keeps its existing transaction and rollback-on-mail-failure behavior for both insert
and update paths; only its insert-vs-update branching changes.

## Complexity Tracking

*None. All gates pass.*
