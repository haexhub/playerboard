# Contract: UI Flows (Round 2, Multi-Tenant)

**Feature**: 001-points-and-photos
**Purpose**: Screen-level contracts for each MVP user story in the
multi-tenant scope. Data + actions per screen; visual design is
implementation-time. Every screen renders on 360×640 mobile without
horizontal scroll and uses ≥44px min-height on interactive controls
(Constitution IV).

---

## Route map

| Route | Layout | Auth | Team-Context | Role | Story |
|---|---|---|---|---|---|
| `/` | default | — | — | — | Landing/redirect |
| `/login` | default | none | — | — | US0 |
| `/callback` | default | (in progress) | — | — | US0 (Supabase callback) |
| `/start` | onboarding | required | none | — | US0 |
| `/invite/:token` | default | optional | — | — | US0 |
| `/t/:slug` | default | required | member | any | Team landing (role-aware) |
| `/t/:slug/dashboard` | default | required | member | player OR trainer | US2 |
| `/t/:slug/trainings` | default | required | member | any | US1 (list) |
| `/t/:slug/trainings/new` | default | required | member | trainer | US1 |
| `/t/:slug/trainings/:id` | default | required | member | trainer edits; player views | US1, US6 |
| `/t/:slug/players` | default | required | member | trainer | US4 |
| `/t/:slug/players/:id` | default | required | member | any | US2 detail |
| `/t/:slug/categories` | default | required | member | trainer | US3 |
| `/t/:slug/ranking` | default | required | member | any | US2 |
| `/t/:slug/team/members` | default | required | member | trainer | US0 (member mgmt) |
| `/t/:slug/team/settings` | default | required | member | trainer | Season, name, slug edit |
| `/public/:slug/ranking` | public | none | — | anon | US5 |

Redirect rules (`middleware/auth.global.ts` + `team-context.ts`):

- Unauthenticated → `/login` (with `?redirect=<current>` if present).
- Authenticated, no memberships, not on `/start`/`/invite/**` → `/start`.
- Authenticated with memberships, on `/` → `/t/<lastSlug>` (or first
  membership's slug).
- Authenticated but no membership in `<slug>` on `/t/<slug>/**` →
  `/start`.
- Non-trainer on trainer-only route → `/t/<slug>/dashboard`.

---

## Screen contracts

### S0a — Login (`/login`)

**Shows**: single email input, "Anmelde-Link senden" button, small
link "Zur öffentlichen Rangliste" that requires knowing a slug (opens a
slug input).

**Actions**: submit → `useAuth.signInWithMagicLink(email, { redirectTo:
window.location.origin + (route.query.redirect ?? '/callback') })`.

**Feedback**: after submit, replace form with "Prüfe deine E-Mails".

### S0b — Callback (`/callback`)

**Shows**: neutral spinner "Anmeldung wird abgeschlossen…" while
Supabase reads the URL fragment / query.

**Actions**: after session, read `useAuth.memberships`; navigate to
either `/start` (none) or `/t/<lastSlug>` (some).

### S0c — Onboarding start (`/start`, layout: `onboarding`)

**Shows**:

- If `display_name` not yet set: inline form "Wie sollen wir dich
  nennen?" → writes `auth.users.user_metadata.display_name`.
- Card A: "Team gründen" — button → dialog with `name` + optional
  `slug`, on submit `POST /api/teams/create`, on success redirect
  `/t/<slug>`.
- Card B: "Einladungen für <email>" — lists `invitations` rows where
  `email = auth.email` and `accepted_at is null and expires_at >
  now()`; each shows team name, offered role, "Annehmen" button that
  POSTs to `/api/invitations/accept`.

### S0d — Invitation landing (`/invite/:token`)

**Shows**:

- If no session: input "E-Mail" (defaults to invitation email if
  fetchable via a public projection), "Anmelde-Link senden".
- If session but email ≠ invitation email: reject the invitation and show an
  error explaining that the user must sign in with the invited email; there is
  no "Trotzdem annehmen" override.
- Else: card "<TeamName> lädt dich als <role> ein", "Annehmen" button
  → `POST /api/invitations/accept`.

### S1 — Trainer training editor (`/t/:slug/trainings/new`, `.../trainings/:id` in trainer role)

Identical to Round 1 in shape, but all IDs are team-scoped:

- Grid rows = players **where team_id = current team & active**.
- Columns = active categories **where team_id = current team**.
- "+ Kategorie hinzufügen" opens the same create dialog as S7, scoped to the
  current team; on save the category list reloads and the grid gains a
  column immediately, no navigation away from S1.
- Photo upload writes to `training-photos/<team_id>/<training_id>/<uuid>.ext`.
- Players without photo consent are flagged with a red warning icon
  (tooltip) next to their name in the grid row.
- Auto-save per cell; "Speichern" transitions status to `saved`.

### S2 — Player dashboard (`/t/:slug/dashboard`)

**Shows**: current rank in the current team, timeframe picker, CTA to own
`/t/:slug/players/<me>`, and the full team ranking table (shown to both
players and trainers as of 2026-09-25 — previously trainer-only, with a
separate top-3 list for players). Ranks 1–3 are highlighted gold/silver/
bronze, ranks 4–10 with a subtle tint, and the bottom two ranks in red.

### S3 — Team ranking (`/t/:slug/ranking`)

**Shows**: full team ranking with names + jersey numbers +
per-category totals.

### S4 — Player detail (`/t/:slug/players/:id`)

**Shows**: name, jersey number, position, line chart per category with
team average + median comparison lines. Trainers additionally see an
always-visible, autosaving settings form (name, jersey number, position,
e-mail, photo consent, active) — this is the only place editing happens
(the roster list has no separate edit dialog); an "Einladen" button next to
the e-mail field (since 2026-09-25) is enabled once an e-mail is present and
the player isn't linked, mirroring the roster's own invite button.

### S5 — Public anonymous ranking (`/public/:slug/ranking`, layout: `public`)

Identical to Round 1 but the slug is in the URL (per team).

### S6 — Players CRUD (`/t/:slug/players`)

Trainer-only. Table with, per row: name linked to the player's detail page
(S4 — that's where editing happens, no edit dialog in the list), a status
checkbox (active/inactive, togglable in both directions), a consent
checkbox, "Einladen", and "Löschen" (since 2026-09-25). "Einladen" prefills
invitation email and role (`player`). "Löschen" asks for confirmation and
permanently removes the player; the database rejects it (with a UI message
suggesting deactivation instead) if the player already has recorded points
(FR-032). The "Neuer Spieler" button still opens a create-only dialog.

### S7 — Categories CRUD (`/t/:slug/categories`)

Trainer-only. Same as Round 1 but scoped to the current team.

### S8 — Team members (`/t/:slug/team/members`)

Trainer-only. Two sections:

- **Aktuelle Mitglieder**: table (display_name, email, role, "Rolle
  ändern"-Dropdown, "Entfernen"-Button). Removing self or changing
  the last trainer's role is blocked (trigger error surfaces as toast).
- **Offene Einladungen**: list of invitations with `accepted_at is
  null`; "Widerrufen" button deletes the row.
- **Neue Einladung**: form (email + role) → `POST /api/invitations/issue`.

### S9 — Team settings (`/t/:slug/team/settings`)

Trainer-only. Fields: team name, slug (with warning about breaking
URLs), season_start date. On save, update `teams` + `team_settings`.

---

## Team switcher

Present in every `default`-layout page. shadcn `Dropdown` bound to
`useTeamContext.memberships`. Items show team name + role badge.
Selecting an item navigates to `/t/<slug>/`.

## Empty and error states

- `/start` with no invitations and no team → only "Team gründen" card.
- `/t/<slug>/trainings` empty → "Noch kein Training erfasst" +
  trainer-only CTA "Erstes Training anlegen".
- `/t/<slug>/players` (trainer) empty → CTA "Ersten Spieler anlegen".
- `/t/<slug>/categories` (trainer) empty → CTA "Erste Kategorie
  anlegen".
- `/t/<slug>/ranking` with no entries → "Keine Punkte im gewählten
  Zeitraum".
- Network failure on save → toast; local state kept.
- RLS denial (unexpected) → toast "Keine Berechtigung"; redirect
  `/start` if the user has no membership in that team.
