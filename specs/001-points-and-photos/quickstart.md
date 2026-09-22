# Quickstart: ifa-board dev environment (Round 2, Multi-Tenant)

**Feature**: 001-points-and-photos
**Date**: 2026-09-10 (regenerated after Round-2 clarify)

Bootstrap the app locally: Nuxt frontend + Supabase (Docker) + Inbucket
email capture for magic-links.

## Prerequisites

- **Node.js 22 LTS** (`nvm install 22 && nvm use 22`)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** (Supabase Postgres + Studio + Inbucket)
- **Supabase CLI** (`brew install supabase/tap/supabase` or download binary)

## One-time setup

```bash
# 1. Install app dependencies
pnpm install

# 2. Start local Supabase (Postgres + Auth + Studio + Inbucket at :54324)
supabase start

# 3. Apply migrations + seed
supabase db reset

# 4. Generate typed database bindings
pnpm gen:types             # writes app/types/database.ts

# 5. Set environment variables
cp .env.example .env
# Values printed by `supabase start` fill:
#   SUPABASE_URL
#   SUPABASE_KEY
#   SUPABASE_SERVICE_KEY
#   NUXT_SUPABASE_SECRET_KEY   (server-only, mirrors SUPABASE_SERVICE_KEY)
#   SUPABASE_DB_URL / NUXT_SUPABASE_DB_URL   (Postgres connection for Drizzle)

# 6. Run dev server
pnpm dev                   # http://localhost:3000
```

## Creating the first user (locally)

There is **no** studio-created bootstrap trainer anymore. Signup happens
in-app via magic-link:

1. Open `http://localhost:3000/login`.
2. Enter any address (e.g. `me@example.com`).
3. Open **Inbucket** at `http://localhost:54324` — the magic-link
   arrives instantly. Click it.
4. You land on `/callback` → `/start`.
5. Enter your display name, then **Team gründen** with any name (e.g.
   "Test-Team"). You're now the trainer of that team.
6. Continue to `/t/test-team/…` and start building trainings, players,
   categories.

For a second user (to simulate invitations):

1. In an Incognito window, repeat 1–4 with `player@example.com`.
2. Back in the first window, go to `/t/test-team/team/members`, click
   **Einladen**, enter `player@example.com`, choose role `player`,
   send.
3. In the Incognito window, refresh Inbucket, open the newest email,
   click. You land on `/callback` → `/invite/<token>` → **Annehmen** →
   `/t/test-team/dashboard`.

## Running the test suites

```bash
pnpm test:unit
pnpm test:e2e
```

Playwright config boots the dev server, resets the DB, and seeds two
teams (A and B) with a trainer and player each — for the cross-team
RLS negative suite (SC-009).

## Deploying to production (self-hosted + Supabase Cloud)

Outline (not part of the MVP task list):

1. `supabase link --project-ref <ref>`; `supabase db push` to apply
   migrations to Cloud.
2. `pnpm build` produces a portable Node server at
   `.output/server/index.mjs` (Nuxt's default `node-server` preset —
   no extra config needed). Run it on the target VPS (e.g. via
   `systemd` or a process manager) and put it behind a reverse proxy
   (nginx/Caddy) for TLS; set `SUPABASE_URL`, `SUPABASE_KEY`,
   `NUXT_SUPABASE_SECRET_KEY`, `NUXT_SUPABASE_DB_URL` env vars
   on the host.
3. Configure Supabase Auth → Email → disable password login, enable
   magic-link, set the `redirectTo` URL allowlist to include the
   production origin and the exact callback URL, for example
   `https://<production-host>/callback`. Keep the origin entry if it is used
   by other flows; add every other exact `redirectTo` URL separately.
4. Set the SMTP for magic-link email in Supabase (or use the built-in
   free tier).

## Common commands

```bash
supabase migration new <slug>
supabase db reset
pnpm gen:types
pnpm lint
pnpm typecheck
```

Every schema-affecting migration MUST be committed together with the
regenerated `app/types/database.ts` (Constitution Principle V).
