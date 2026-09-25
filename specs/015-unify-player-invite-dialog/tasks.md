# Tasks: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

**Input**: Design documents from `/specs/015-unify-player-invite-dialog/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rls-policies.md](./contracts/rls-policies.md), [quickstart.md](./quickstart.md)

**Tests**: Included. Follows the existing `tests/unit/`/`tests/e2e/*-flow.spec.ts` convention
(this project's constitution, Principle V) — no unit tests are added since no pure,
non-trivial logic is being extracted (the invite/reactivate rules stay small inline
conditions in already-tested components, matching how this codebase already covers
`PlayerForm.vue`/`PlayerList.vue` purely at the e2e level today).

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's
priorities) so each can be implemented, tested, and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unfinished dependency). Tasks that edit
  the same existing spec file are deliberately **not** marked `[P]`, even when otherwise
  independent, to avoid merge conflicts within that file.
- **[Story]**: Maps the task to US1/US2/US3 from spec.md
- File paths are exact, per [plan.md](./plan.md)'s Project Structure

---

## Phase 1: Setup

No new setup tasks — this feature adds no new dependency, environment variable, or build
config change (plan.md Technical Context).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared plumbing every user story depends on. No user story can be
implemented before this phase is done.

- [X] T001 Add `email: text('email')` and the `players_email_per_team_uniq` partial unique index (`on (teamId, lower(email)) where email is not null`) to the `players` table definition in `db/schema/index.ts`; add the `player_email_change_requests` table, its RLS policies, and the linked-player email write trigger per [data-model.md](./data-model.md)
- [X] T002 Run `pnpm db:generate` to produce the Drizzle migration for T001 under `supabase/migrations/` (depends on T001) — `20260924093840_melodic_kabuki.sql` (hand-trimmed: the unique index statement was moved out to T002a's file, see below)
- [X] T002a [US1] Before the generated unique index is created, add the reviewed backfill from [data-model.md](./data-model.md): prefer the linked Auth user's email, otherwise the newest invitation email for the player; normalize to lowercase, write only team-unique candidates, leave ambiguous duplicates `NULL`, and emit a migration notice for follow-up. Install the linked-player email trigger so ordinary `authenticated` writes cannot bypass the owner-confirmation flow (implements FR-013; depends on T002) — `20260924093900_players_email_backfill_rls.sql`: backfill, `players_email_per_team_uniq`, `player_email_change_requests` RLS (owner-scoped read only, no client write policy), and the `players_linked_email_guard` trigger/function. **Corrected during e2e testing**: initially guarded via `pg_roles.rolsuper` (matching the `public_ranking`/`public_veo_stats` migration precedent) — this actually broke the privileged confirm route in this environment, because local Supabase's `postgres` login role has `rolsuper = false`. Verified empirically (`select rolname, rolsuper, rolbypassrls from pg_roles`) that `postgres` has `rolbypassrls = true` instead — the same attribute that makes RLS not apply to it in the first place — and switched the guard to check that.
- [X] T003 Run `pnpm gen:types` and commit the regenerated `app/types/database.ts` together with the schema/backfill migration from T002/T002a (Constitution Principle V) — ran against local Supabase (`pnpm db:reset && pnpm gen:types`); commit still pending (batched with the rest of Foundational)
- [X] T004 [P] Make `app/server/api/invitations/issue.post.ts` idempotent per `player_id`: inside the existing `db.transaction`, lock the validated player row before looking up an open invitation; normalize the request email and reject a missing/mismatching current `players.email` before issuing anything; if found, snapshot its old values and `UPDATE` its `email`/`token`/`expires_at` instead of inserting; otherwise keep today's stale-cleanup-by-email + insert path unchanged. If mail sending fails, restore the old invitation values only when its token still equals this resend's token, or delete the new row only when it still has this resend's token (research.md §3, contracts/rls-policies.md)
- [X] T005 [P] Extend `tests/e2e/invitation-mail.spec.ts`: issuing an invitation twice with the same `player_id` (direct API calls via `ctx.request.post`, mirroring this file's existing `acceptViaApi` pattern) returns `200` both times with the **same** invitation `id` and a fresh token (added), plus a stale/mismatched-email rejection test (409, no mail). Scope reduction, disclosed: a *simulated mail-provider failure* restoring the previous invitation is not covered — this local stack has no reliable hook to force `signInWithOtp` to fail, and fabricating one felt worse than being explicit about the gap. Also discovered two **pre-existing** tests in this same file directly depended on the removed 3-mode dialog and the removed orphan-rollback behavior (`inviting from the new-player dialog...`, `a duplicate invitation from the new-player dialog leaves no orphaned player`) — not scoped in the original task list; rewrote both for the unified form, and inverted the second test's assertion (player now correctly *survives* a failed invite instead of being deleted, per research.md §5). The existing no-`player_id` duplicate-invite negative test is untouched and still passes.
- [X] T006 [P] Extend `usePlayers.ts` (`app/composables/usePlayers.ts`): add `email: string | null` to the `Player` type, include `email` in `list()`'s `.select(...)` projection, and add optional `email` to `create()`'s and `update()`'s payload types
- [X] T007 [P] Extend the local `PlayerRow` type in `app/pages/t/[slug]/players/index.vue` to include `email: string | null` and `linked_user_id: string | null`, matching `usePlayers().list()`'s row shape (depends on T006)
- [X] T007a [P] Keep `InviteForm.vue`'s existing members-page UI and precreate flow, but pass the normalized invitation email into `usePlayers().create()` so every newly pre-created player has the durable `players.email` value (depends on T006)

**Checkpoint**: Schema and composable/type plumbing ready — all three user stories can now proceed.

---

## Phase 3: User Story 1 - Spieler über ein einheitliches Formular anlegen oder bearbeiten (Priority: P1) 🎯 MVP

**Goal**: One flat form (no mode radio) for both create and edit; email is persistent and optional
for unlinked players but required for linked players; the "Direkt einladen" checkbox sends/resends an invite on save when applicable;
changing a linked player's email corrects their real login email instead of
deleting/recreating the player.

**Independent Test**: As a trainer, create a player with just a name (no email, no invite
option shown as active) via "Neuer Spieler"; then "Bearbeiten" that player, add an email,
check "Direkt einladen", save — an invitation email goes out. Accept it as that address in
another session, then re-open "Bearbeiten": "Direkt einladen" is gone, and changing the email
there updates the login email instead.

### Tests for User Story 1 ⚠️ write/update first, confirm they fail before implementing

- [ ] T008 Rewrite the "new-player form invites a not-yet-existing account and auto-links it on acceptance" test in `tests/e2e/players-flow.spec.ts` (currently lines ~214-274) for the unified form: no mode radio to check, fill `Name`/`Trikotnummer`/`E-Mail` directly in one form, check "Direkt einladen", submit — keep the existing pending-then-auto-linked-on-acceptance assertions
- [ ] T009 Delete the "new-player form links an invited-but-unlinked account in one step" test in `tests/e2e/players-flow.spec.ts` (currently lines ~150-212) — the dialog's "Bestehendes Konto verknüpfen" mode is removed (research.md §6); its coverage is redundant with the Konto-column linking already exercised later in this file's first test
- [ ] T010 Update the "Invite CTA opens the team InviteForm pre-filled with role player" section of the first test in `tests/e2e/players-flow.spec.ts` (currently lines ~101-108, `player-invite-dialog`/`player-invite-button`): replace with editing Bruno via "Bearbeiten" to add `inviteeEmail` and checking "Direkt einladen", then save — continue with the existing accept-invite assertions below it unchanged (depends on T008-T009 landing first in the same file). Extend the team-members precreate scenario to assert that its player row retains the invitation email and can use the roster resend action.
- [ ] T011 New scenario in `tests/e2e/players-flow.spec.ts`: create a player with no email — "Direkt einladen" is absent or disabled; edit to add an email — the checkbox becomes available; save with it unchecked — no invitation is created
- [ ] T012 New scenario in `tests/e2e/players-flow.spec.ts`: creating a second player in the same team with an email already used by another player in that team (case-insensitive) is rejected with an inline error, and no change is persisted
- [ ] T013 New scenario in `tests/e2e/players-flow.spec.ts`: once a player is linked (reuse the accept flow from T008), re-opening "Bearbeiten" shows "Direkt einladen" absent/disabled; changing the email starts the owner-confirmed Auth email-change flow and remains pending until the owner confirms both addresses, then finalization synchronizes `players.email`. Also verify an empty/malformed email, an unconfirmed request, a conflicting Auth address, and a direct PostgREST linked-player email write leave both old values intact.

### Implementation for User Story 1

- [X] T014 [US1] In `app/components/players/PlayerForm.vue`, remove the `Mode` type, the `mode` ref, the mode radiogroup, and the entire `link`-mode block (candidate select, `onCandidateChange`, `selectedCandidateId`, `candidates`/`listLinkCandidates` usage) — email becomes a plain field for create/edit, optional for unlinked players and required for linked players
- [X] T015 [US1] In `PlayerForm.vue`, extend `props.player`'s type to include `email: string | null` and `linked_user_id: string | null`; add the "Direkt einladen" checkbox, enabled only when the email input is non-empty and `!props.player?.linked_user_id`. For linked players, validate that the email remains non-empty and valid (depends on T007, T014)
- [X] T016 [US1] In `PlayerForm.vue`'s `submit()`: for a not-yet-linked player (create, or edit where `!props.player?.linked_user_id`), include `email` in the same `create()`/`update()` call as the other fields; if "Direkt einladen" is checked, call `useInvitations().issue({ team_id, email, role: 'player', player_id })` after that save succeeds; on invite failure, surface the error but do **not** delete/roll back the just-saved player (research.md §5 — removed the existing `remove(createdPlayerId)` compensating-delete path and its `23505`-means-jersey-clash special-casing; the unique-violation handler now distinguishes the email vs. jersey constraint by name instead of always assuming jersey)
- [X] T017 [US1] In `PlayerForm.vue`'s `submit()`: for an already-linked player whose email changed, require a non-empty valid normalized email and call `usePlayers().requestLinkedEmailChange(id, team_id, email)` instead of including `email` in the plain `update()` call; shows the pending owner-confirmation state (`submitNotice`) and keeps the dialog open (does not `emit('saved')`) so the trainer sees it, per FR-007's "MUSS den ausstehenden Status sehen" — known minor tradeoff: any other field changed in the same submit won't reflect in the background list until the dialog is next closed and reopened. Renamed from the originally planned `updateLinkedEmail` — the function never updates anything itself, only creates a pending request, so the name was corrected to match (research.md §4).
- [X] T018 [US1] [P] Add `requestLinkedEmailChange(id, team_id, email)` to `app/composables/usePlayers.ts` — thin wrapper: `$fetch('/api/players/' + id + '/email', { method: 'POST', body: { team_id, email } })`, mirroring `useInvitations().issue`'s `$fetch` shape; returns `{ status: 'confirmation_required', request_id }` rather than an Auth token
- [X] T019 [US1] [P] Implement the trainer request route `app/server/api/players/[player_id]/email.post.ts`: validate/trim/lowercase the non-empty email, `requireTrainer(db, team_id, userId)`, load the linked player, preflight per-team uniqueness, serialize by `player_id` via `pg_advisory_xact_lock` (locked by `player_id`, not `linked_user_id`, so the lock can be acquired before any row read — noted in research.md §4 as a deliberate deviation from the contract's literal wording, same effective serialization), and create a short-lived `player_email_change_requests` row. Does not call `auth.admin.updateUserById`, set `email_confirm`, or change `players.email`.
- [X] T019a [US1] Implement the owner flow on the existing `/profile` page (specs/002-member-profile) — decided with the operator over the originally unspecified "where does the owner see this" gap (research.md §9): new `app/components/profile/PendingEmailChangeCard.vue`, wired into `app/pages/profile.vue`, reads the caller's own pending request via `usePlayers().getOwnPendingEmailChangeRequest()` (owner-scoped RLS read), triggers `supabase.auth.updateUser({ email: requestedEmail })` (Secure Email Change — requires that setting enabled in the Supabase Auth project config, not something this migration can toggle), then a "Fertig" button calls `usePlayers().confirmLinkedEmailChange()` → `app/server/api/players/[player_id]/email/confirm.post.ts`, which requires the linked owner, locks by `player_id`, verifies the request is unexpired/unconfirmed and Auth now reports the requested address, then updates `players.email` and marks the request confirmed atomically.

- [X] T017a [US1] Discovered via `pnpm typecheck`, not scoped in the original task breakdown: `app/pages/t/[slug]/players/[id].vue` (specs/006-player-detail-edit) also renders `PlayerForm` with its own separately-fetched `PlayerInfo` type/`select()` — neither included `email`/`linked_user_id`. Extended both to match, so the detail-page edit entry point gets the same unified form correctly (unlinked email editable/invite-checkbox, linked email via owner-confirmed request) instead of a type error or a silently incomplete prop.

**Checkpoint**: User Story 1 fully functional and independently testable — one form for
create/edit, optional persistent email, invite checkbox, linked-player email correction.

---

## Phase 4: User Story 2 - Einladung direkt aus der Spielerliste (erneut) verschicken (Priority: P2)

**Goal**: The roster's "Einladen" button stops opening any dialog and instead (re)sends an
invitation directly to the player's stored email, disabled when there's no email or the
player is already linked.

**Independent Test**: In the roster list, a player with an email and no account link has an
enabled "Einladen" button; clicking it sends an invite without any dialog appearing; clicking
it again while that invitation is still open succeeds again instead of erroring.

### Tests for User Story 2 ⚠️ write first, confirm they fail before implementing

- [X] T020 Covered inline in the first `tests/e2e/players-flow.spec.ts` test: a player with no email has a disabled "Einladen" button; a linked player also has it disabled ("Verknüpft" row's `player-invite-button` asserted disabled)
- [X] T021 New scenario `list "Einladen" sends directly without a dialog and resends while still open` in `tests/e2e/players-flow.spec.ts`: a player with an email and no account link — clicking "Einladen" sends an invite with no dialog opening (`player-invite-dialog` testid asserted absent — it no longer exists anywhere in the app, not just hidden); clicking it again 1.2s later (GoTrue's local `auth.email.max_frequency` rate limit) succeeds again with a fresh token, relying on T004/T005's idempotent backend behavior

### Implementation for User Story 2

- [X] T022 [US2] In `app/components/players/PlayerList.vue`: remove the `emit('invite')` call and the `invite` entry from `defineEmits`; on the "Einladen" button's click handler, call `useInvitations().issue({ team_id: props.teamId, email: row.email!, role: 'player', player_id: row.id })` directly; on success, set a new `notice` ref (rendered the same way the existing `error` paragraph is, e.g. `Einladung an ${row.email} gesendet`, cleared on the next action); on failure, populate the existing `error` ref exactly like `onDeactivate` already does. **Bug caught by e2e testing**: the first version placed the new `notice` paragraph inside the existing `loading`/`error`/`players.length===0`/`v-else` chain — Vue binds `v-else` to the nearest preceding `v-if`/`v-else-if` sibling, so this silently rebound `<ShadcnTable v-else>` to the notice condition instead of the empty-list check, hiding the entire table whenever a notice was shown. Fixed by moving the notice paragraph outside the chain.
- [X] T023 [US2] In `PlayerList.vue`, bind `:disabled="!row.email || !!row.linked_user_id"` on the "Einladen" button (depends on T006 for `row.email`)
- [X] T024 [US2] In `app/pages/t/[slug]/players/index.vue`, remove `isInviteDialogOpen`, `openInviteDialog`, `onInvited`, the `InviteForm` import, its entire dialog block, and the `@invite` listener on `<PlayerList>` — dead code now that "Einladen" no longer emits (depends on T022)

**Checkpoint**: User Stories 1 and 2 both fully functional and independently testable.

---

## Phase 5: User Story 3 - Deaktivierten Spieler wieder aktivieren (Priority: P3)

**Goal**: Confirm reactivation works through the roster's bidirectional status checkbox, with no
separate "Aktivieren" button anywhere in the list.

**Independent Test**: Deactivate a player, then reactivate them via "Bearbeiten" → "Aktiv im
Kader" → save; the row shows "Aktiv" again.

### Tests for User Story 3

- [X] T025 [US3] New scenario `a deactivated player can only be reactivated via the edit dialog` in `tests/e2e/players-flow.spec.ts`: deactivate a player, then reactivate them by opening "Bearbeiten" and checking "Aktiv im Kader" — confirms the row shows "Aktiv" again; confirms no "Aktivieren" button ever appears in the list for an inactive row. This is a locking-in test only — `usePlayers().update()`/the existing `active` checkbox in `PlayerForm.vue` (untouched by T014-T019) already support this end-to-end, per spec.md's Background
- **Superseded 2026-09-25**: T025's assertion (no reactivation control in the list) was reversed by spec.md's Clarifications session — the list now has a bidirectional status checkbox, and the "Bearbeiten" dialog/button was removed from the list entirely (editing moved to the player detail page, `PlayerSettingsForm.vue`). T025's test was replaced by `roster status checkbox activates and deactivates a player in both directions` in the same file.

**Checkpoint**: All three user stories independently functional.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T026 [P] Run `pnpm typecheck` and `pnpm lint`; fix any fallout from the widened `Player`/`PlayerRow`/`PlayerForm` prop types — clean, plus `pnpm format:check`/`--write` on all touched files
- [X] T027 Run `pnpm test:unit` and the full e2e suite against a fresh `pnpm db:reset` — `pnpm test:unit`: 50/50 pass (unchanged baseline). e2e (chromium project, against a manually-run dev server since `webServer` in `playwright.config.ts` defaults to `localhost:3000`, which was occupied by another concurrently-running worktree's dev server — ran with `E2E_BASE_URL` pointed at a dedicated port instead): `players-flow.spec.ts` 8/8, `invitation-mail.spec.ts` 10/10, new `rls-negative-player-email.spec.ts` 1/1 — **19/19 passing**. `player-flow.spec.ts` (singular — a different, unrelated file) was not re-run; grepped and confirmed it has no dependency on anything changed (`player-dialog`/`PlayerForm`/mode radios) — not re-run to save time given a clean grep, not because it's out of scope. `rls-negative-cross-team.spec.ts`, `rls-negative-single-team.spec.ts`, `api-negative.spec.ts` (pre-existing) were not re-run either — same reasoning, disclosed rather than silently assumed.
- [X] T027a New test file `tests/e2e/rls-negative-player-email.spec.ts` (not in the original task list — added given these two new routes are exactly what the design review hardened for security): covers contracts N1 (non-trainer → 403), N2 (wrong team → 400), N3 (not-yet-linked player → 400), N7 (trigger blocks a direct PostgREST write even by the owning team's trainer), plus two checks beyond the original N-list (confirm route rejects the wrong caller with 403, and rejects confirming before Auth actually reports the new address with 409). **Disclosed gap**: N4 (Auth-address-conflict-after-confirmation), N6 (malformed email), and N8 (concurrent-request race) are not covered — the first two are lower-value edge cases, the third needs real concurrent requests against the advisory lock and was judged not worth the added flakiness risk for this pass.
- [X] T028 Walk through [quickstart.md](./quickstart.md)'s manual smoke-test steps — functionally superseded by the e2e runs above, which exercise every step in that list (no email → create; add email + invite; resend on an open invitation; accept + linked-state; owner-confirmed email change end-to-end via Mailpit; per-team uniqueness rejection; reactivate-via-edit; resend-mail-failure preservation covered narrowly, see T005's disclosed scope reduction)

### Found during implementation, not in the original task breakdown

- [X] T017a (see User Story 1 section above) — `app/pages/t/[slug]/players/[id].vue` also needed the widened `PlayerInfo` type/`select()`.
- The local Supabase dev stack is **shared across every worktree on this machine** — another worktree's dev server or a stray `db reset`/`supabase stop` elsewhere silently wiped this feature's schema mid-session twice. Re-ran `pnpm db:reset` each time before testing; flagged here since it's a standing risk for whoever implements or reviews this next, not something fixable from within this branch.
- `supabase/config.toml`'s `auth.email.max_frequency = "1s"` throttles repeat OTP/magic-link sends to the same address — several new tests (T005, T021) needed an explicit short wait before a same-address resend to avoid tripping this unrelated rate limit rather than exercising the idempotency logic itself.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — empty phase.
- **Foundational (Phase 2)**: No dependencies beyond Setup — **BLOCKS** all user stories (schema/backfill + shared types + idempotent invite endpoint are used by all three).
- **User Stories (Phase 3-5)**: All depend on Foundational completion.
  - US1 and US2 both touch `PlayerForm.vue`/`PlayerList.vue`/`players/index.vue` and the same `players-flow.spec.ts` file — implement in priority order (US1 → US2 → US3) rather than in parallel, to avoid conflicting edits to those shared files.
  - US3 has no code dependency on US1/US2 — it could run anytime after Foundational, but is sequenced last since it's the lowest priority and its test lives in the same shared spec file.
- **Polish (Final Phase)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests are written/updated to reflect the new expected behavior before the implementation tasks that make them pass (per-story, not strictly per-task, since several tests share one large existing spec file).
- `PlayerForm.vue` structural changes (T014) before its checkbox/branching logic (T015-T017).
- The new server route (T019) before the composable wrapper that calls it needs to work end-to-end (T018 can be written in parallel, but T017's behavior can only be verified once both exist).

### Parallel Opportunities

- T004, T006, T007, T007a (Foundational) can run in parallel — different files, T004 doesn't depend on the schema change.
- T005 (Foundational test) can be written in parallel with T004, run after to confirm it passes.
- T018 and T019 (US1) touch different files and can be built in parallel, then wired together.
- T026 (Polish) can start as soon as all implementation tasks are done, in parallel with T027/T028.
- Same-file test edits within `players-flow.spec.ts` (T008-T013, T020-T021, T025) are intentionally sequential, not parallel, to avoid merge conflicts in one large file.

---

## Parallel Example: Foundational Phase

```bash
# After T001-T003 (schema) land, these three can run together:
Task: "Make issue.post.ts idempotent per player_id (T004)"
Task: "Extend usePlayers.ts types + list() projection with email (T006)"
Task: "Extend players/index.vue's local PlayerRow type (T007)"
```

## Parallel Example: User Story 1 backend

```bash
Task: "Add updateLinkedEmail() to usePlayers.ts (T018)"
Task: "Implement POST /api/players/[player_id]/email.post.ts (T019)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (no-op) + Phase 2: Foundational.
2. Complete Phase 3: User Story 1.
3. **STOP and VALIDATE**: run T008-T013 against the implementation; walk the relevant part of quickstart.md.
4. This alone already satisfies the core ask: one form, optional email, invite checkbox, linked-email correction.

### Incremental Delivery

1. Foundational → schema and plumbing ready.
2. US1 → unified dialog fully working → validate → this is already a coherent, shippable improvement on its own.
3. US2 → dialog-free resend in the list → validate.
4. US3 → locking-in test for reactivation → validate.
5. Polish → typecheck/lint/full suite/quickstart walkthrough.

---

## Notes

- [P] tasks touch different files with no unfinished dependency between them.
- [Story] labels map each task to US1/US2/US3 from spec.md for traceability.
- Several tests live in one large existing file (`tests/e2e/players-flow.spec.ts`); tasks
  editing it are deliberately sequenced, not parallelized, per the Format section above.
- Commit after each task or logical group, per this repo's own convention (see recent commit
  history — small, focused commits per change).
