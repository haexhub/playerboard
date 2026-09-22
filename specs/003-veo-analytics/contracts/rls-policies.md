# RLS Policies: Veo-Kamera-Analytics

Reuses the existing `public.is_member(team_id)` and `public.is_trainer(team_id)`
helpers from
[001-points-and-photos/contracts/rls-policies.md](../../001-points-and-photos/contracts/rls-policies.md)
plus a new `public.is_veo_enabled(team_id)` security-definer helper (used by
the read policies below). All five tables have RLS enabled and at least one
policy.

**Updated 2026-09-22** (see spec.md's Clarifications): `veo_team_mappings` is
no longer deny-all for `authenticated` — a trainer can now
`select`/`insert`/`update` their own team's row directly.
`veo_sync_credentials` stays fully deny-all, including for the trainer —
see its own section below for why, discovered during this same round of
changes.

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

**No policy at all for `authenticated`/`anon`** — unreachable by any client
role under any circumstance, for any operation. Only `service_role` (via
`useAdminDb()`) ever touches it: `app/server/utils/veo/auth.ts` reads it,
`app/server/api/veo/link.post.ts` writes it.

This is stricter than a naive "trainer can manage their own team's
credentials" policy would be, and deliberately so — two reasons:

1. **The credential itself**: this row holds a live Veo session artifact,
   not display data. No `select` policy should ever exist for it, for any
   role, regardless of how narrowly scoped.
2. **A Postgres/RLS mechanic, not a choice**: `INSERT ... ON CONFLICT DO
   UPDATE` (and a plain `UPDATE`, tested directly) both need row-visibility
   to identify a conflicting/matching row — which is exactly what a `select`
   policy grants. Without one, both silently fail to find the row under RLS
   (`UPDATE` matches zero rows; PostgREST still reports HTTP success, which
   is what makes this easy to miss in a REST-level test). Confirmed by
   direct testing against the local DB while diagnosing why the real linking
   flow returned 403 for a genuine trainer.

Given (2), even an `insert`/`update`-only policy (no `select`) for
`veo_sync_credentials` would not reliably work for repeat writes — so
`POST /api/veo/link` doesn't attempt it. It authorizes with the same
explicit `requireTrainer(useAdminDb(), team_id, userId)` check
`POST /api/veo/login` already uses (`app/server/utils/db.ts`, also used by
`app/server/api/invitations/issue.post.ts`), then writes both
`veo_team_mappings` and `veo_sync_credentials` in one `useAdminDb()`
transaction — atomic, and not subject to the RLS/ON CONFLICT limitation
above since `useAdminDb()` bypasses RLS entirely. The trainer's Veo
*password* itself never reaches this or any other table — only the session
cookie captured by `POST /api/veo/login` (see
[research.md §9](../research.md#9-interactive-login-headless-browser)).

## `veo_team_mappings`

| Policy | Operation, Role | Using / With Check |
|---|---|---|
| `veo_team_mappings_read_trainer` | select, `authenticated` | `public.is_trainer(team_id)` |
| `veo_team_mappings_write_trainer` | insert, `authenticated` | with check: `public.is_trainer(team_id)` |
| `veo_team_mappings_update_trainer` | update, `authenticated` | using/with check: `public.is_trainer(team_id)` |

This is deliberately the enforcement point for FR-011 — a team with no row
here gets zero Veo data, regardless of what `veo_matches`/`veo_match_stats`
RLS would otherwise permit. `select` is safe to expose (no secret in this
row — just slugs) and lets the trainer's own settings page show the current
link status.

Unlike `veo_sync_credentials`, this table's `select` policy means `INSERT
... ON CONFLICT DO UPDATE` genuinely works under RLS here (confirmed by
direct testing: a trainer's own upsert succeeds and is visible afterward).
`POST /api/veo/link` still writes this table via the same `useAdminDb()`
transaction as `veo_sync_credentials` (for atomicity between the two related
rows, and one authorization check instead of two) — but these policies
remain the real, enforced boundary for any *other* caller, such as a direct
PostgREST call or the settings page's own read. No `delete` policy —
re-running the linking flow upserts instead.

Re-linking a team to a different Veo team overwrites `veo_club_slug`/
`veo_team_slug` in place; there is no separate disable action in this
feature. A Veo match deleted or made private in Veo remains visible while
the Playerboard mapping itself still exists, per the feature's retention
rule.

## `POST /api/veo/login` and `POST /api/veo/link` caller authentication

Both require a real Supabase session (`serverSupabaseUser(event)`) and a
`team_id` in the request body, and both authorize with the same explicit
`requireTrainer(useAdminDb(), team_id, userId)` check rather than relying on
RLS for their own write — `POST /api/veo/login` because it writes nothing
(no row exists yet, so there's nothing for RLS to enforce against);
`POST /api/veo/link` because `veo_sync_credentials`' RLS can't cover an
upsert (see above). This is an application-level authorization check
instead of a table-level RLS policy, precisely because neither route has a
write that RLS can meaningfully gate.

## `POST /api/veo/sync` caller authentication

Not a Postgres RLS concern, but the equivalent control at the route level:
the request must carry a bearer header matching
`runtimeConfig.veoSyncSecret` (`NUXT_VEO_SYNC_SECRET`), checked before any
DB or Veo call. See
[research.md §2](../research.md#2-authenticating-the-cron-caller).

## Negative-test matrix

Constitution Principle II requires every policy in this contract to be
covered by a test that would fail if the policy were dropped. `veo_sync_credentials`
stays the most sensitive one: any policy there — even a narrow one — would
risk exposing the club's live Veo session to an authenticated caller.

| # | Actor | Attempt | Expected | Covered by |
|---|---|---|---|---|
| V1 | Trainer of the mapped team | `select`/`insert` on `veo_sync_credentials` | Denied/empty — no policy exists for anyone, any operation | `rls-negative-single-team.spec.ts` |
| V2 | Trainer of team A | `insert veo_sync_credentials` for team B's `team_id` | Denied | `rls-negative-cross-team.spec.ts` |
| V3 | Trainer of team A | `insert`/`update veo_team_mappings` for team B's `team_id` | Denied | `rls-negative-cross-team.spec.ts` |
| V4 | Player (non-trainer) of the mapped team | `insert`/`update` on either table for their own team | Denied | `rls-negative-single-team.spec.ts` |
| V5 | Member of a team with no `veo_team_mappings` row | `select from veo_matches` | Empty | `veo-analytics-flow.spec.ts` |
| V6 | Unauthenticated caller | `POST /api/veo/sync` without/with a wrong bearer | 401 | `api-negative.spec.ts` |
| V7 | Player (non-trainer) of a team | `POST /api/veo/login` / `POST /api/veo/link` for that team | 403 | `rls-negative-single-team.spec.ts` (N14) |
