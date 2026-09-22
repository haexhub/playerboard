# RLS Policies: Veo-Kamera-Analytics

Reuses the existing `public.is_member(team_id)` helper from
[001-points-and-photos/contracts/rls-policies.md](../../001-points-and-photos/contracts/rls-policies.md)
plus a new `public.is_veo_enabled(team_id)` security-definer helper, because
authenticated users cannot query `veo_team_mappings` directly. All five tables
have RLS enabled and at least one policy. No table below gets an
`is_trainer`-gated write policy: the analytics tables and the two
service-role-only tables are not writable by any authenticated user. The sync
route reads/writes the analytics tables and reads the two protected tables via
`useAdminDb()` (server-trusted, bypasses RLS entirely); the deployment operator
may seed the protected tables through direct SQL. The two service-role-only
tables have explicit deny-all policies for `authenticated`, which satisfy the
policy-per-table invariant without granting any user access.

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

RLS enabled with an explicit deny-all policy for `authenticated`. Not readable
or writable by any `authenticated` or `anon` role under any circumstance — only `service_role`
(via `useAdminDb()`, called exclusively from
`app/server/utils/veo/auth.ts`) can access it. This is the strictest
variant of the existing `service_role`-only-write shape: here even `select`
is service_role-only, since the row contains a live session credential, not
just system-managed display data.

## `veo_team_mappings`

RLS enabled with an explicit deny-all policy for `authenticated` — same
service-role-only shape as `veo_sync_credentials`, for the same reason: for
this feature's own scope, only the sync route
(`useAdminDb()`) reads it, and only a human with direct DB access writes it
(see [research.md §5](../research.md#5-team-mapping-veo-team--playerboard-team)).
This is deliberately the enforcement point for FR-011 — a team with no
enabled row here gets zero Veo data, regardless of what
`veo_matches`/`veo_match_stats` RLS would otherwise permit.

When `enabled` is set to false or the mapping row is deleted, the three read
policies immediately hide the team's retained analytics and sync status. The
rows remain stored so re-enabling the mapping makes them visible again; this
does not delete historical data. A Veo match deleted or made private in Veo
remains visible while the Playerboard mapping itself remains enabled, per the
feature's retention rule.

**Follow-up, out of scope for this feature**: once the separate
"Platform-Administration" feature adds a `platform_admins` table/role, it
will add an `authenticated`-scoped write policy here (`using`/`with check`
against that role) so its settings UI can manage this table through the app
instead of raw SQL. No other table in this contract needs to change when
that happens.

## `POST /api/veo/sync` caller authentication

Not a Postgres RLS concern, but the equivalent control at the route level:
the request must carry a bearer header matching
`runtimeConfig.veoSyncSecret` (`NUXT_VEO_SYNC_SECRET`), checked before any
DB or Veo call. See
[research.md §2](../research.md#2-authenticating-the-cron-caller).

## Negative-test matrix

Constitution Principle II requires every policy in this contract to be
covered by a test that would fail if the policy were dropped. The two
`service_role`-only tables are the sensitive ones: a permissive policy there
exposes the club's Veo login.

| # | Actor | Attempt | Expected | Covered by |
|---|---|---|---|---|
| V1 | Trainer of the mapped team | `select from veo_sync_credentials` | Empty | `rls-negative-single-team.spec.ts` (N11) |
| V2 | Trainer of the mapped team | `select from veo_team_mappings` | Empty | `rls-negative-single-team.spec.ts` (N11) |
| V3 | Member of a team with no enabled mapping | `select from veo_matches` | Empty | `veo-analytics-flow.spec.ts` |
| V4 | Unauthenticated caller | `POST /api/veo/sync` without/with a wrong bearer | 401 | `api-negative.spec.ts` |
