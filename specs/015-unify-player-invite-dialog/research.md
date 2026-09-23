# Phase 0 Research: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

No `[NEEDS CLARIFICATION]` markers remained in spec.md — the decisions below were already made
with the operator during design and are recorded here with their rationale and rejected
alternatives, per the research.md format.

## 1. Persistent `players.email` vs. deriving email from `invitations`

**Decision**: Add a real, nullable `players.email` column as the durable "email on file,"
independent of the `invitations` table.

**Rationale**: Today, email only exists transiently on `invitations.email` while an invitation is
open. Once accepted (or if never invited), there is nothing to display or edit. The spec requires
the edit dialog to always show/edit a player's email and the list's "Einladen" button to have a
stable target — both need a value that survives invitation acceptance, expiry, or absence
entirely.

**Alternatives considered**:
- *Derive display email from the latest `invitations` row for `player_id`*: rejected — breaks the
  moment an invitation is accepted (the row's `accepted_at` gets set, but nothing then represents
  "their current email" once they're free to change it via their own account), and gives no place
  to store an email for a player who was created manually and never invited.
- *Read the linked auth user's email directly (`auth.users` via a view) for linked players, and
  fall back to the invitation row otherwise*: rejected — two different read paths for the same UI
  field, and `auth.users` isn't otherwise modelled in RLS-readable form (see
  `issue.post.ts`'s comment on why it's queried via raw SQL only server-side). A single column is
  simpler and is already the established pattern for denormalizing account-adjacent display data
  (`user_profiles.display_name` does the same for names).

## 2. Per-team email uniqueness

**Decision**: `unique index players_email_per_team_uniq on players (team_id, lower(email)) where email is not null`.

**Rationale**: Mirrors the existing `players_active_jersey_per_team_uniq` pattern exactly (same
shape, same rationale: catch trainer typos/duplicate entries early, at the database layer).
Confirmed with the operator.

**Alternatives considered**:
- *No uniqueness constraint*: rejected — two players in the same team could end up with the same
  email by typo, and (worse) two open invitations would then race for the same
  `invitations_team_email_open_uniq` slot with no clear owner.
- *Global uniqueness across all teams*: rejected — out of scope; nothing in the spec asks for
  cross-team identity resolution, and the existing jersey-number rule is also team-scoped, not
  global.

## 3. Idempotent invite (re)send instead of a second endpoint

**Decision**: Modify `POST /api/invitations/issue`'s existing transaction to look up an open
invitation for the given `player_id` first; if one exists, `UPDATE` its `email`/`token`/
`expires_at` in place and resend, instead of attempting an `INSERT` that would hit
`invitations_player_open_uniq` and fail with `23505` → `409`.

**Rationale**: Both the dialog's "Direkt einladen" checkbox and the list's dialog-free "Einladen"
button need to work whether or not a prior invitation is still open — that's the whole point of
"resend." Reusing the one existing endpoint keeps a single code path for "get this player invited"
(Simplicity, Principle I) instead of adding a second one.

**Alternatives considered**:
- *New dedicated `POST /api/players/[player_id]/invite/resend` endpoint*: rejected — would
  duplicate the mail-sending, token-generation, and rollback-on-mail-failure logic that
  `issue.post.ts` already has; the only thing that needs to change is the insert-vs-update branch.
- *Delete the open invitation and insert a fresh one*: rejected — functionally equivalent to an
  update but does an extra round-trip and briefly leaves no invitation row if the process is
  interrupted between delete and insert; an in-place `UPDATE` is atomic within the existing
  transaction.
- *Let the second click fail with 409 and show "invitation already sent" in the UI*: rejected —
  contradicts FR-009's explicit requirement that a resend click must succeed, and doesn't solve
  the case where the trainer corrected a typo'd email and needs the *new* address to receive the
  link.

## 4. Correcting a linked player's login email

**Decision**: New trainer-gated, service-role route,
`POST /api/players/[player_id]/email`, calling
`admin.auth.admin.updateUserById(linked_user_id, { email, email_confirm: true })`, then syncing
`players.email` on success.

**Rationale**: Confirmed with the operator: apply immediately, no confirmation round-trip to the
new address, no delete-and-recreate of the player. `email_confirm: true` matches "trainer already
verified this is correct" — the same trust level `profile/moderate.post.ts` already extends to a
trainer acting on a team member's account (display name reset, avatar removal).

**Alternatives considered**:
- *Delete the player row and recreate it with the new email*: this was the operator's original
  fallback question; rejected once `updateUserById` was confirmed to work — deleting would orphan
  or cascade-affect the player's existing points/photos/stats history tied to `player_id`, which
  `updateUserById` avoids entirely by leaving the player row's identity untouched.
- *Let Supabase's default double-opt-in email change flow run* (`email_confirm` omitted/`false`,
  sending a confirmation to the new address before it takes effect): rejected per the operator's
  stated preference for an immediate, direct change; also would leave the roster displaying a
  "pending" email with no UI in scope to represent that intermediate state.
- **Known tradeoff, surfaced but not blocking**: `updateUserById` changes the person's *global*
  Supabase Auth login email, not something scoped to this team. If that same auth account is also
  a linked player/member on another team (structurally possible, not excluded by the schema), a
  trainer of *this* team correcting the email changes their login for every team. No requirement
  in scope addresses multi-team accounts, and the operator confirmed proceeding with
  `updateUserById` regardless — noted here so it's a known, accepted tradeoff rather than an
  unexamined one.

## 5. No compensating rollback of the player row on invite-send failure

**Decision**: When "Direkt einladen" is checked and the invite/resend call fails (create or edit
path), keep the player row's saved fields (including email) and surface only the invite error —
do not delete a just-created player, unlike today's `PlayerForm.vue` (`remove(createdPlayerId)` on
`issue()` failure).

**Rationale**: Today's rollback exists because, in the old 3-mode form, "invite" *was* the create
action — a player created only to be thrown away if the invite failed made sense when the player
had no independent reason to exist without it. Now that email is a plain, optional, persistent
field, a player row is valid on its own regardless of invite outcome; deleting it would destroy
legitimate data (name, jersey number, position) over an unrelated mail-delivery failure, and would
contradict FR-003 ("dauerhaft gespeicherte ... E-Mail-Adresse ... auch ohne dass zu diesem
Zeitpunkt eine Einladung verschickt wird").

**Alternatives considered**:
- *Keep the rollback, scoped to "was this player created in this same submit"*: rejected — still
  punishes a trainer for a transient mail-sending failure (e.g. Supabase Auth rate limit) by
  discarding correctly-entered roster data they'd have to retype.

## 6. Dropping "Bestehendes Konto verknüpfen" from the dialog

**Decision**: Remove the `link` mode from `PlayerForm.vue` entirely. Linking an existing,
unlinked account to a player stays possible exclusively via `PlayerList.vue`'s existing inline
Konto-column select + "Verknüpfen" button (`usePlayers().linkUser`), unchanged.

**Rationale**: Confirmed with the operator — this is a straight redundancy removal, not a
capability loss. `PlayerList.vue`'s inline linker already calls the identical `linkUser()`
function the dialog's `link` mode called, and is reachable for any not-yet-linked player at any
time (not just at creation), which is strictly more flexible than the dialog's create-only
version.

## 7. `InviteForm.vue` scope boundary

**Decision**: `InviteForm.vue` is left completely unchanged, including its optional
"create a player row" sub-flow. Only its *usage* on the players roster page
(`isInviteDialogOpen`, `openInviteDialog`, `onInvited`, the dialog block, the `@invite` listener)
is removed.

**Rationale**: Initial design assumed this sub-flow was redundant once the unified `PlayerForm`
covers player-creation-with-invite. Tracing actual usage
(`app/pages/t/[slug]/team/members.vue:32`) showed `InviteForm` is also the invite form on the
*team members* page, where a trainer can invite someone with role "player" and optionally
pre-create their roster row in the same step — a workflow this feature was never asked to change.
Removing the sub-flow would have silently regressed that unrelated page. This was caught before
implementation and the spec (FR-011) was corrected accordingly.

**Alternatives considered**:
- *Remove the sub-flow from `InviteForm.vue` and add it back on `team/members.vue` in some other
  form*: rejected — pure scope creep relative to what was requested; `team/members.vue` isn't
  otherwise touched by this feature.
