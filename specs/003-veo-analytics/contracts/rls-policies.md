# RLS Policies: Veo-Kamera-Analytics

Reuses the existing `public.is_member(team_id)` and `public.is_trainer(team_id)`
helpers from
[001-points-and-photos/contracts/rls-policies.md](../../001-points-and-photos/contracts/rls-policies.md)
plus a new `public.is_veo_enabled(team_id)` security-definer helper (used by
the read policies below; `veo_team_mappings` itself no longer needs a
security-definer indirection since trainers can now query it directly under
their own row). All five tables have RLS enabled and at least one policy.

**Updated 2026-09-22** (see spec.md's Clarifications): `veo_team_mappings`
and `veo_sync_credentials` are no longer deny-all for `authenticated` — a
trainer can write their own team's row directly, through
`POST /api/veo/login` + `POST /api/veo/link`, which call
`useUserDb(event, ...)` (RLS-enforced, not `useAdminDb()`) so the database
itself — not application code — is what stops a trainer from touching
another team's row. `veo_matches`/`veo_match_stats`/`veo_sync_status` are
unchanged: still read-only for members, written only by the sync route via
`useAdminDb()`.

## `veo_matches`, `veo_match_stats`

Both readable by any member of the team (trainer or player — match results
and team stats are not sensitive in the way point entries can be):

| Policy | Operation, Role | Using |
|---|---|---|
| `veo_matches_read_member` | select, `authenticated` | `public.is_member(team_id) and public.is_veo_enabled(team_id)` |
| `veo_match_stats_read_member` | select, `authenticated` | membership and `public.is_veo_enabled((select team_id from veo_matches where id = match_id))` |

No `insert`/`update`/`delete` policy for `authenticated` on either table —
only `service_role` (via `useAdminDb()`) writes.

## `veo_sync_status`

Readable by team members (powers the sync-status banner, User Story 3, for
both roles — not trainer-only, so any member can see the app is degraded):

| Policy | Operation, Role | Using |
|---|---|---|
| `veo_sync_status_read_member` | select, `authenticated` | `public.is_member(team_id) and public.is_veo_enabled(team_id)` |

No write policy for `authenticated` — only the sync route updates it.

## `veo_sync_credentials`

| Policy | Operation, Role | Using / With Check |
|---|---|---|
| `veo_sync_credentials_write_trainer` | insert, `authenticated` | with check: `public.is_trainer(team_id)` |
| `veo_sync_credentials_write_trainer` | update, `authenticated` | using/with check: `public.is_trainer(team_id)` |

**No `select` policy for `authenticated`** — not readable by any
`authenticated` or `anon` role under any circumstance, including the trainer
who just wrote it; only `service_role` (via `useAdminDb()`, called
exclusively from `app/server/utils/veo/auth.ts`) can read it. The row
contains a live session credential, not just system-managed display data, so
it stays write-only for the app. The trainer-facing write happens through
`POST /api/veo/link` using `useUserDb(event, ...)`, immediately after
`POST /api/veo/login` performs the actual Veo login server-side (see
[research.md §9](../research.md#9-interactive-login-headless-browser)) — the
trainer's password itself never reaches this or any other table.

## `veo_team_mappings`

| Policy | Operation, Role | Using / With Check |
|---|---|---|
| `veo_team_mappings_read_trainer` | select, `authenticated` | `public.is_trainer(team_id)` |
| `veo_team_mappings_write_trainer` | insert, `authenticated` | with check: `public.is_trainer(team_id)` |
| `veo_team_mappings_write_trainer` | update, `authenticated` | using/with check: `public.is_trainer(team_id)` |

This is deliberately the enforcement point for FR-011 — a team with no row
here gets zero Veo data, regardless of what `veo_matches`/`veo_match_stats`
RLS would otherwise permit. `select` is safe to expose (no secret in this
row — just slugs) and lets the trainer's own settings page show the current
link status. No `delete` policy — re-running the linking flow upserts
instead.

Re-linking a team to a different Veo team overwrites `veo_club_slug`/
`veo_team_slug` in place; there is no separate disable action in this
feature. A Veo match deleted or made private in Veo remains visible while
the Playerboard mapping itself still exists, per the feature's retention
rule.

## `POST /api/veo/login` and `POST /api/veo/link` caller authentication

Both require a real Supabase session (`serverSupabaseUser(event)`) and a
`team_id` in the request body. `POST /api/veo/link` writes
`veo_team_mappings`/`veo_sync_credentials` via `useUserDb(event, ...)`, so
the `is_trainer(team_id)` RLS policies above are the actual enforcement
there — a non-trainer or a trainer of a different team gets a rejected
write, not a 403 the route code decided on its own. `POST /api/veo/login`
writes nothing (no row exists yet at that point, so RLS has nothing to
enforce against), so it runs the existing `requireTrainer(useAdminDb(),
teamId, userId)` helper (`app/server/utils/db.ts`, already used by
`app/server/api/invitations/issue.post.ts`) before starting the (expensive)
headless login — this is the one place in this feature with an
application-level authorization check instead of a table-level RLS policy,
precisely because there is no table write to attach the check to.

## `POST /api/veo/sync` caller authentication

Not a Postgres RLS concern, but the equivalent control at the route level:
the request must carry a bearer header matching
`runtimeConfig.veoSyncSecret` (`NUXT_VEO_SYNC_SECRET`), checked before any
DB or Veo call. See
[research.md §2](../research.md#2-authenticating-the-cron-caller).

## Negative-test matrix

Constitution Principle II requires every policy in this contract to be
covered by a test that would fail if the policy were dropped. `veo_sync_credentials`
stays the most sensitive one: a permissive `select` policy there would expose
the club's live Veo session to any authenticated user.

| # | Actor | Attempt | Expected | Covered by |
|---|---|---|---|---|
| V1 | Trainer of the mapped team | `select from veo_sync_credentials` | Empty (no `select` policy exists for anyone) | `rls-negative-single-team.spec.ts` |
| V2 | Trainer of team A | `insert`/`update veo_sync_credentials` for team B's `team_id` | Denied | `rls-negative-cross-team.spec.ts` |
| V3 | Trainer of team A | `insert`/`update veo_team_mappings` for team B's `team_id` | Denied | `rls-negative-cross-team.spec.ts` |
| V4 | Player (non-trainer) of the mapped team | `insert`/`update` on either table for their own team | Denied | `rls-negative-single-team.spec.ts` |
| V5 | Member of a team with no `veo_team_mappings` row | `select from veo_matches` | Empty | `veo-analytics-flow.spec.ts` |
| V6 | Unauthenticated caller | `POST /api/veo/sync` without/with a wrong bearer | 401 | `api-negative.spec.ts` |
| V7 | Player (non-trainer) of a team | `POST /api/veo/login` / `POST /api/veo/link` for that team | 403 | `api-negative.spec.ts` |
