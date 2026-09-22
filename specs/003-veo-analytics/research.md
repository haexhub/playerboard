# Phase 0 Research: Veo-Kamera-Analytics

All items below were unresolved in the initial Technical Context. Each is
recorded as Decision / Rationale / Alternatives considered.

## 1. Where does the periodic sync run?

**Decision**: A new Nitro server route, `POST /api/veo/sync`, triggered by an
OS-level cron entry on the existing production VPS (`curl` with a shared
secret, once daily).

**Rationale**: The repo has no scheduling mechanism at all today — no
node-cron, no in-process timer, no systemd timer (confirmed by repo-wide
search). The app already runs as a single long-lived Node process
(`node .output/server/index.mjs`) on a self-hosted VPS (constitution:
"no third-party PaaS"). A plain cron entry calling a protected HTTP route is
the smallest possible addition: no new npm dependency, no new always-on
in-process timer, and the route itself follows the exact shape already used
for other privileged actions (`app/server/api/invitations/issue.post.ts`,
`app/server/api/profile/moderate.post.ts`).

**Alternatives considered**:
- *In-process scheduler (e.g. a timer started on server boot)* — rejected:
  adds a persistent background timer inside what is otherwise a stateless,
  per-request server; harder to trigger manually/observe than a plain HTTP
  route; no existing precedent in this codebase.
- *Standalone script run directly by cron, bypassing Nuxt* — rejected:
  would duplicate the DB-connection and auth-check plumbing that already
  lives in `app/server/utils/db.ts`, instead of reusing it.
- *Supabase Edge Function on a schedule* — rejected: introduces a second
  deployment target/runtime (Deno, Supabase-hosted) the project does not use
  anywhere else. The constitution's deployment section is explicit that this
  app is self-hosted on a VPS behind a reverse proxy; Supabase is only used
  for Postgres/Auth/Storage. Adding Edge Functions would be a new
  abstraction with no present-day need — direct violation of Principle I.

## 2. Authenticating the cron caller

**Decision**: `POST /api/veo/sync` requires a shared-secret bearer header,
compared against `runtimeConfig.veoSyncSecret` (`NUXT_VEO_SYNC_SECRET`).
Requests without a matching header get `401` before any work happens.

**Rationale**: The existing privileged-route pattern
(`serverSupabaseUser(event)` + membership/role lookup) assumes an
interactive, logged-in human. The cron caller is a machine with no Supabase
session. A single static shared secret is the simplest mechanism that still
keeps the route unreachable by the public internet; it mirrors how the route
itself then uses `useAdminDb()` (server-trusted, RLS-bypassing) exactly like
the two existing privileged routes.

**Alternatives considered**: mTLS / IP allowlisting at the reverse-proxy
level — rejected as unnecessary extra infra for a single internal cron call;
a shared secret is the smallest sufficient control here, and the reverse
proxy is outside this repo's scope.

## 3. Veo authentication strategy

**Decision**: Primary approach is *silent session renewal*: a one-time
interactive login (done once, outside of production, by a human) captures
the `auth.veo.co` session artifact; the sync route replays it against
`auth.veo.co/oidc/auth?...&prompt=none` (standard OIDC silent-auth) to mint a
fresh ~1h access token on every run, then calls
`app.veo.co/api/app/matches/` and `app.veo.co/api/app/analysis/stats/`
directly with that token. No password is stored anywhere in this system.

**Evidence**: A live probe against `auth.veo.co/oidc/auth` with
`prompt=none` and a valid existing browser session returned a fresh
authorization `code` without showing any login form — confirming the
session-cookie-based silent-auth path is accepted by Veo's identity
provider. Full round-trip token minting was not completed live (blocked by
this project's own tooling safety guardrails against live credential
exchange in a chat session) but is a standard, well-understood OIDC flow to
implement and test as ordinary reviewed code.

**Fallback (documented, not built for v1)**: if the `auth.veo.co` session
turns out to be too short-lived in practice (discovered via
`veo_sync_status.consecutive_failures` staying elevated after a credential
refresh), fall back to a scheduled headless-browser login (e.g. Playwright
in a small separate job) that re-authenticates with stored credentials and
extracts a fresh bearer token from network traffic — mirroring the manual
research done for this feature. Not implemented now: would add a
Chromium-capable runtime this project's Node/Nitro deployment does not have,
and is only worth the added complexity if Decision 3's primary approach is
proven insufficient in production.

**Risk accepted**: both `app.veo.co/api/app/...` (used here) and the
documented `api.veo.co` partner API are outside any support/versioning
guarantee for this project — the private one used here even more so, since
it is Veo's undocumented internal frontend API, not even the invite-only
partner API. Mitigated by: fail-closed sync (never fabricate data, FR-007),
and visible sync-status surfacing (FR-009/User Story 3) so breakage is
noticed within a day, not silently.

## 4. Credential storage

**Decision**: The captured `auth.veo.co` session artifact is stored in a new
table, `veo_sync_credentials`. **Updated 2026-09-22**: `select` stays closed
to everyone but `useAdminDb()` (the credential itself is never exposed to
any client), but `insert`/`update` are now gated to `authenticated` via
`public.is_trainer(team_id)` instead of being closed entirely — see §9. The
trainer's Veo *password* never reaches this table (or any table): it lives
only in the request body and the headless-browser process's memory for the
duration of `POST /api/veo/login`, then is discarded.

**Rationale**: Per explicit decision earlier in this project's brainstorming
session, the credential must never live in `.env`/the repository. A
service_role-only DB row reuses an access-control mechanism the project
already has (RLS) instead of introducing a new one (e.g. Supabase Vault,
external secret manager), and — unlike a static env var — can be rotated by
re-running the one-time capture step and updating one row, without a
redeploy.

**Alternatives considered**: `runtimeConfig` env var — rejected as the
explicit anti-pattern this plan is meant to avoid (redeploy-to-rotate,
higher risk of ending up in a committed `.env`). Supabase Vault — rejected
as a new mechanism this project does not otherwise use, when RLS already
provides an equivalent trust boundary (Principle I: no new abstraction
without present-day need beyond what RLS already gives us).

## 5. Team mapping (Veo team ↔ Playerboard team)

**Decision** (superseded twice — first during the original `/speckit.clarify`
that introduced the table, then again on 2026-09-22 when the platform-admin
gate was replaced by trainer self-service; see spec.md's Clarifications,
FR-011, User Story 4, and §9/§10 below): the mapping is a database table,
`veo_team_mappings`, not fixed `runtimeConfig` values. **As of 2026-09-22**,
RLS grants `select`/`insert`/`update` to `authenticated` gated by
`public.is_trainer(team_id)` — the trainer of a team manages that team's own
row directly through the app, no deny-all, no manual SQL. The paragraphs
below describe the *original* reasoning for introducing the table at all
(still valid) and the *original* v1 sequencing (superseded — kept for
history, see §9/§10 for what replaced it).

**Rationale**: A club-internal security requirement emerged during
clarification: a team MUST NOT see Veo data without an explicit, deliberate
enablement decision — not something derivable from a single fixed
deployment config that's easy to lose track of. That decision must be made
by a *platform admin* (a cross-team authority this app does not yet have —
see the "Platform-admin UI sequencing" note below). A database table is the
correct home for an admin-managed, potentially-multi-row setting per
Principle III's precedent (config lives in data, not code) — this is no
longer speculative, it's an explicit requirement.

**Platform-admin UI sequencing — superseded 2026-09-22, kept for history**:
this paragraph described the original v1 plan, where the feature built no
platform-admin role and the one row in `veo_team_mappings` was created
directly via SQL by the deployment operator. That plan assumed the separate
"Platform-Administration" feature would eventually add a `platform_admins`
role and replace the deny-all policy with a role-scoped one. In practice,
the manual-SQL step turned out to block real usage entirely (no trainer
could self-serve, and no such platform-admin feature exists yet). The
2026-09-22 clarification replaced this with trainer self-service instead of
waiting on "Platform-Administration": `is_trainer(team_id)` — a role this
app already has — turned out to be the right authority all along, not a
new cross-team `platform_admins` role. See §9/§10 for the replacement
mechanism.

**Alternatives considered**: three fixed `runtimeConfig` values (the
original v1 plan, before this clarification) — rejected once the explicit
"platform-admin must control this" requirement emerged, since an env var
is redeploy-only and doesn't fit "an admin deliberately enables a team,"
and doesn't set up cleanly for the follow-on admin UI. Building the full
platform-admin role *now*, inside this feature — rejected: bigger than this
feature's own scope, reusable well beyond Veo, and not needed to satisfy
the actual security requirement today (a manual DB row already does).

## 6. Season aggregation (User Story 2)

**Decision**: Computed on-the-fly by querying `veo_matches` +
`veo_match_stats` for the team, not maintained as a separate precomputed
table.

**Rationale**: Data volume is tiny (one team, tens of matches per season,
~28 stat rows per match) — aggregating at read time is cheap and always
consistent with the underlying rows, with none of the invalidation
complexity a materialized rollup would add. Simplicity First default:
prefer the boring query over a caching/precomputation layer with no present
performance need.

## 7. Idempotent upserts

**Decision**: `veo_matches` is keyed by Veo's own globally-unique match
identifier (`veo_match_id`, unique index); `veo_match_stats` uses a
composite primary key (`match_id`, `team_association`, `stat_type`). Both
upserts use `ON CONFLICT ... DO UPDATE`.

**Rationale**: Matches FR-008 (no duplicate/contradictory rows on repeated
or overlapping sync runs) at the schema level rather than relying on
application-level de-duplication logic.

## 8. Testing strategy for the external integration

**Decision**: The Veo HTTP payload → schema mapping (`mapStats.ts`) is a
pure function, unit-tested with fixture payloads captured during this
feature's research (the real `POST .../analysis/stats/` response shape
observed live). The e2e suite seeds `veo_matches`/`veo_match_stats`/
`veo_sync_status` directly in the test database and verifies the display
pages and the sync-status banner — it does not call the live Veo API.

**Rationale**: There is no sandbox/test Veo account, and the API is
undocumented and could change; a CI test that depends on live Veo would be
flaky and unrelated to this project's own correctness. Unit-testing the pure
mapping function against captured real-world fixtures gives regression
coverage for the one part of the integration this project fully controls,
consistent with the existing repo convention of unit-testing pure
`~/utils/*` functions only.

## 9. Interactive login (headless browser)

**Decision**: `POST /api/veo/login` performs the trainer's Veo login itself,
server-side, using a headless Chromium via Playwright: navigate to Veo's
real login page (`app.veo.co/accounts/login/`), fill the trainer's email and
password into the actual visible form fields, submit, wait for the redirect
back to `app.veo.co` that confirms success (or detect the still-on-login-page
failure state), then read the resulting `auth.veo.co` cookies from the
browser context and return them as the same `name=value; ...` string
previously captured by hand from DevTools. Hard timeout (~30s); browser is
always closed in a `finally`, whether login succeeded or not.

**Rationale**: Veo's login form posts to an internal API whose exact
contract could not be determined from the public, minified `auth.veo.co`
Next.js bundle (checked live during this feature's research — no stable
`/api/login`-shaped REST path or GraphQL operation name was findable by
static inspection). Driving the real, visible login form through a headless
browser is robust to Veo changing that internal contract, since it only
depends on the login page still rendering an email/password form — the same
assumption a human doing the manual capture already depended on. This is
the "fallback" approach §3 originally deferred as "not implemented now" for
the *daily sync's* session renewal — it is not needed there (the existing
`prompt=none` silent-renewal flow in `auth.ts` is unchanged and still
handles that). It is now used, on-demand only, for the trainer-initiated
*initial* login, a different and much less frequent call site.

**Cost accepted**: adds `playwright` + a Chromium binary as a new runtime
dependency on the VPS (`playwright install chromium`, see
[quickstart.md](./quickstart.md)). This only runs when a trainer submits the
linking form (rare, human-triggered), never on the daily cron sync — the
sync route's own dependency footprint is unchanged.

**Alternatives considered**: reverse-engineering the internal login POST
endpoint for a plain `fetch()` call, matching the existing `client.ts`/`auth.ts`
style with zero new runtime dependencies — rejected for the *login* step
specifically (still the right style for the *already-confirmed* `/clubs/`,
`/teams/`, `/matches/`, `/analysis/stats/` endpoints used elsewhere, see
§10) because static analysis of the login bundle didn't yield a stable
endpoint to call, and guessing at an undocumented credential-submission
contract carries more risk than the added Chromium dependency.

## 10. Team/club discovery for the linking picker

**Decision**: After a successful login (§9), `POST /api/veo/login` calls two
already-authenticated Veo endpoints with the fresh session, using the same
Bearer-token pattern `client.ts` already uses for `/matches/`:

- `GET /api/app/clubs/?filter=own&fields=slug&fields=name&fields=team_count&fields=is_club_admin` —
  every club the logged-in Veo user belongs to.
- `GET /api/app/clubs/{club_slug}/teams/?fields=slug&fields=name&fields=match_count` —
  every team within one of those clubs.

The route calls the second endpoint once per club from the first, and
returns the combined `{ clubSlug, clubName, teams: [{ teamSlug, teamName }] }[]`
list to the client for the picker UI (User Story 4, Clarifications
2026-09-22: "Auswahl aus den tatsächlichen Clubs/Teams", not manual
slug entry).

**Evidence**: Both endpoints were confirmed live during this feature's
research (read-only navigation/fetch calls against an already-authenticated
session, real response bodies observed) — `GET .../teams/` returned real
data for the club already configured in production
(`tsv-ifa-chemnitz`, 8 teams including the already-synced
`c-junioren-cec9ec43`). `GET /api/app/clubs/?filter=own&...` was observed
succeeding (200) during ordinary page navigation in the same session: the
exact request shape the real Veo frontend sends when listing "my clubs".

**Rationale**: Matches this feature's existing precedent (§8: undocumented
private API, used as ordinary reviewed code, no support/versioning
guarantee) rather than introducing a new integration style. Keeps
`client.ts`'s plain-`fetch()`-with-Bearer-token shape for everything except
the one step (§9) that genuinely needs a browser.
