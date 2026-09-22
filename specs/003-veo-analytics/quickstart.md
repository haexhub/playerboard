# Quickstart Delta: Veo-Kamera-Analytics

## New environment variables

Add to `.env` (local) / the deployment's env config — **never** the club's
Veo password or session value itself (see
[research.md §4](./research.md#4-credential-storage), that lives in
`veo_sync_credentials`, not env), and **not** the club/team slugs either
(those live in `veo_team_mappings`, see below —
[research.md §5](./research.md#5-team-mapping-veo-team--playerboard-team)):

```
NUXT_VEO_SYNC_SECRET=<random shared secret, used by the cron call>
NUXT_VEO_LINK_TOKEN_SECRET=<random secret, signs the short-lived token between /api/veo/login and /api/veo/link>
```

`NUXT_VEO_LINK_TOKEN_SECRET` signs the ~5-minute token that carries the
freshly captured session cookie from `POST /api/veo/login`'s response to
`POST /api/veo/link`'s request body, so the raw cookie is never sent to the
browser in plaintext (see [research.md §9](./research.md#9-interactive-login-headless-browser)).
Unlike the credential itself, this secret has no confidentiality
requirement beyond "not guessable" — it never identifies a specific team or
session on its own.

## Local development — no live Veo dependency

There is no sandbox/test Veo account. Local dev and CI do **not** call the
real Veo API:

- Unit tests for `app/server/utils/veo/mapStats.ts` run against fixture
  payloads (captured during this feature's research, checked into
  `tests/fixtures/veo/`).
- The e2e spec seeds `veo_matches`/`veo_match_stats`/`veo_sync_status` rows
  directly via the local Supabase DB, then verifies the `/t/[slug]/analytics`
  page and the sync-status banner — it never invokes `POST /api/veo/sync`
  against the real Veo backend.
- `POST /api/veo/sync` itself can be smoke-tested locally only by someone
  with real club credentials, manually, against the real Veo API — not part
  of the automated suite.
- `POST /api/veo/login` (§9) is tested the same way: the RLS/role gating
  (V4/V7 in the negative-test matrix) runs against the local Supabase DB
  without a real login, but an actual successful login against `auth.veo.co`
  can only be smoke-tested manually, by a trainer with real Veo credentials.

## Enabling a team for Veo sync (self-service, since 2026-09-22)

**Superseded the original manual-SQL process below.** A trainer opens their
team's Veo settings page (`/t/[slug]/team/veo`), enters their own Veo email
and password, picks the matching club/team from the list the app fetches
from their real Veo account, and confirms — see spec.md's User Story 4 and
Clarifications (2026-09-22). This single action does what the two manual
steps below used to require: it inserts/updates both `veo_team_mappings`
(club/team slug, `enabled = true`) and `veo_sync_credentials` (the resulting
session cookie), scoped to that trainer's own team by RLS
([contracts/rls-policies.md](./contracts/rls-policies.md)). No deployment
operator, no direct SQL, no platform-admin step.

To re-establish a session once `veo_sync_status.consecutive_failures`
indicates it has stopped renewing, the trainer just repeats the same flow.

<details>
<summary>Original v1 process (manual SQL) — kept for history, no longer used</summary>

Until 2026-09-22, both of the following were done via direct SQL by whoever
operated the deployment
([research.md §5](./research.md#5-team-mapping-veo-team--playerboard-team)):

1. Insert one row into `veo_team_mappings` for the team being enabled:
   `team_id` (the Playerboard team's uuid), `veo_club_slug` (e.g.
   `tsv-ifa-chemnitz`), `veo_team_slug` (e.g. `c-junioren-cec9ec43`),
   `enabled = true`.
2. A trainer/admin logs into `app.veo.co` with the club account in a normal
   browser, copies the `auth.veo.co` cookies from DevTools as one
   `name=value; name2=value2` string, and inserts it into
   `veo_sync_credentials` for the team via a direct DB write.

</details>

## New runtime dependency: Chromium

`POST /api/veo/login` ([research.md §9](./research.md#9-interactive-login-headless-browser))
drives a real headless Chromium to perform the trainer's Veo login. This
only runs on-demand when a trainer submits the linking form, never on the
daily cron sync — `POST /api/veo/sync` itself has no new dependency.

Production runs as a prebuilt Docker image
(`ghcr.io/haexhub/playerboard`, built by `.github/workflows/ci.yml`), not a
bare VPS process — the deployment Ansible role (`Projekte/ansible`,
`roles/playerboard/`) only pulls and runs that image, it doesn't build it.
So the Chromium dependency lives in the **Dockerfile** itself, not in any
manual VPS/Ansible step:

- Playwright's own bundled Chromium download doesn't support Alpine's musl
  libc (the app's base image, `node:22-alpine`), so the `deps` stage sets
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` before `pnpm install`, and the
  `runner` stage installs Alpine's own `chromium` package instead
  (`apk add chromium`), pointing at it via
  `NUXT_VEO_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
  (`runtimeConfig.veoChromiumExecutablePath` in `nuxt.config.ts`, read by
  `app/server/utils/veo/login.ts`). Verified working end-to-end in a
  `node:22-alpine` container during this change.
- `--no-sandbox` is passed when launching (required to run Chromium as the
  container's non-root user); the only page ever navigated to is Veo's own
  login form, not arbitrary content.
- Local dev leaves `NUXT_VEO_CHROMIUM_EXECUTABLE_PATH` unset, so Playwright
  launches its own downloaded browser (`~/.cache/ms-playwright`) as usual —
  no local Alpine/chromium setup needed.

## Production scheduling

Add one crontab entry on the VPS (outside this repo, documented here for
ops reference):

```bash
# /etc/playerboard/veo-sync.env is root-owned and mode 0600.
0 3 * * * . /etc/playerboard/veo-sync.env && test -n "${NUXT_VEO_SYNC_SECRET:-}" || { echo "veo sync environment missing" | logger; exit 1; }; curl --fail --silent --show-error --connect-timeout 10 --max-time 300 -X POST https://<host>/api/veo/sync \
  -H "Authorization: Bearer ${NUXT_VEO_SYNC_SECRET}" || echo "veo sync failed" | logger
```

Daily at 03:00 is sufficient per FR-006/the clarified "täglicher Batch
reicht" decision.

## After schema changes

As with every schema-affecting change in this repo:

```
pnpm db:generate   # drizzle-kit generate → new supabase/migrations/*.sql
pnpm gen:types      # regenerate app/types/database.ts
```

Both the migration and the regenerated types MUST be committed together
(Principle V).
