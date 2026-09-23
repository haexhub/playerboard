# Phase 0 Research: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

## 1. Hard prerequisite: 004-veo-player-analytics is not implemented yet

**Finding**: `specs/004-veo-player-analytics/tasks.md` is fully unchecked. There is
no `veo_player_match_stats` table in `db/schema/index.ts`, no migration, no
generated type, and no frontend consuming it (`VeoPlayerSeasonSummary.vue`
etc. don't exist). PR #53 ("013-veo-player-analytics") only merged the
spec/plan/tasks documents, not the implementation.

**Decision**: This feature's Veo-Stats tab has a hard, blocking dependency on
004's foundational schema phase (its Phase 2 / T001–T004: the
`veo_player_match_stats` table, its RLS select policy, and the regenerated
`app/types/database.ts`) landing first. `data-model.md` for that table is
already fully specified by 004 and is reused as-is here — this plan does not
redesign it. The later `/speckit.tasks` run for this feature must declare
that dependency explicitly (either as a blocking predecessor task or by
sequencing 004's schema tasks ahead of this feature's own tasks). This plan
proceeds on the assumption that the table exists as specified in
[004's data-model.md](../004-veo-player-analytics/data-model.md).

**Alternative considered**: Fold 004's foundational schema tasks into this
feature's own tasks instead of treating it as an external dependency.
Rejected — it would duplicate ownership of a table whose shape 004 already
fully owns and specifies; sequencing is a tasks-phase concern, not a reason
to re-specify the schema here.

## 2. Public-exposure mechanism: reuse `public_ranking_reader`, don't add a second role

**Finding**: `20260915170000_public_ranking.sql` already establishes the
pattern for exposing anonymized data: a dedicated `nologin bypassrls`
Postgres role (`public_ranking_reader`) with narrow, explicit
column-level `select` grants on exactly the columns a public projection may
expose, owning one `security definer` function. The migration's own comment
documents a reproducible `SIGSEGV` when the self-hosted Postgres crashed on
a plain `GRANT ... TO current_user` during ownership transfer, worked around
with a conditional `do $$ ... $$` block.

**Decision**: Reuse the existing `public_ranking_reader` role for the new
`get_public_veo_stats` function instead of creating a second one. Add the
additional narrow column grants it needs (see data-model.md) in the new
migration, then `create function ... owner to public_ranking_reader`. This
avoids repeating the fragile role-creation/ownership-transfer dance a second
time, and keeps exactly one place (`public_ranking_reader`'s grant list)
that defines everything the public internet can ever read from this
database.

**Alternative considered**: A second role (e.g. `public_veo_reader`) scoped
only to Veo columns, for stricter least-privilege separation between the two
public projections. Rejected under Principle I (Simplicity First) — both
roles would need the identical crash-prone ownership-transfer boilerplate,
for a separation with no present-day need (both are read-only, anonymous,
narrow-grant projections of the same underlying team).

## 3. Season boundary for the Veo-Stats aggregate

**Finding** (from `/speckit.clarify`): the public Veo-Stats sum is bounded to
`teams.season_start .. now()`, matching the existing season concept the
points ranking already uses (`get_public_ranking`'s `p_from`/`p_to`, sourced
from `team_settings.season_start` client-side via `useTimeframe`).

**Decision**: `get_public_veo_stats(p_slug text)` takes no date-range
parameters (unlike `get_public_ranking`) — it reads `teams.season_start`
itself and filters `veo_matches.played_at >= season_start`. No timeframe
picker on the public Veo-Stats tab (FR-011): the season boundary is the only
bound, computed server-side, not client-selectable.

**Alternative considered**: Accept `p_from`/`p_to` like `get_public_ranking`
for symmetry. Rejected — the spec explicitly scoped the Veo tab to a single,
non-adjustable season total (Assumptions); adding parameters nobody can set
from the UI is unused surface.

## 4. Public opt-in storage and write path

**Finding**: `veo_team_mappings` already has `select`/`insert`/`update`
policies scoped to `is_trainer(team_id)`
(`20260922200000_veo_trainer_self_service.sql`), with no column-level grant
restriction — a trainer's own Supabase browser client can already `update`
any column of their team's row directly, RLS-checked, no server route
involved. This differs from `veo_sync_credentials`, whose complete lack of a
`select` policy is what forces that table's writes through `useAdminDb()`.

**Decision**: Add `public_stats_enabled boolean not null default false` to
`veo_team_mappings` (Drizzle schema + generated migration, no hand-written
RLS needed — the existing three policies already cover it). The new
`VeoPublicStatsToggle.vue` component reads/writes it directly via
`useSupabaseClient()`, exactly like `VeoLinkForm.vue` already reads
`enabled` through `useVeoLink().getCurrentMapping()`. No new API route.

**Alternative considered**: A `POST /api/veo/public-stats.post.ts` route with
an explicit `requireTrainer()` check, mirroring `player-assignment.post.ts`
from 004. Rejected — that pattern exists specifically for tables/operations
RLS can't cover (`veo_sync_credentials`'s missing select policy, or
`veo_player_match_stats` having no write policy for `authenticated` at all).
Here RLS already fully covers the write; adding a route would duplicate
authorization logic RLS already enforces.

## 5. Jersey-number identity for the Veo-Stats tab

**Finding**: 004's per-match breakdown deliberately preserves the
*historical* `veo_jersey_number` a player wore in a specific match (FR-003 in
004), while the season summary aggregates by `player_id`. The public
Trainingsbewertungen tab (001) identifies rows by the player's *current*
`players.jersey_number`.

**Decision**: The public Veo-Stats tab aggregates
`veo_player_match_stats` by `player_id` (summing `value` per `stat_type`,
`player_id is not null` rows only, `veo_matches.played_at >= season_start`)
and labels each resulting row with that player's *current*
`players.jersey_number` — not the per-match historical `veo_jersey_number`.
This matches the points-ranking convention and keeps the tab a single,
season-long row per player even if their number changed mid-season (see
spec.md Edge Cases). No per-match jersey history is exposed publicly at all
(FR-011 excludes the per-match breakdown entirely), so the historical/current
distinction that matters for 004's member-facing per-match view doesn't
surface here.

## 6. Tab UI: no Tabs primitive available

**Finding**: The shared design-system package `@haex-space/ui`
(`node_modules/@haex-space/ui`, published from an external repo,
`github.com/haex-space/haextension`) exposes `button`, `drawer`, `input`,
`sidebar`, `textarea`, `time-picker`, `tooltip` — no `tabs` component. It is
out of this feature's scope to change (separate repository).

**Decision**: Implement a minimal, local two-way toggle directly in
`app/pages/public/[slug]/ranking.vue` — a `ref<'points' | 'veo'>('points')`
switched by two `ShadcnButton`s (active/inactive `variant`), each ≥44px touch
target (Principle IV), showing/hiding the two table sections with `v-show`.
No new dependency, no cross-repo change, no custom ARIA tab widget beyond
what two labelled buttons already provide.

**Alternative considered**: Build a small reusable `TabGroup.vue` primitive
in this repo for future reuse. Rejected for now (YAGNI) — this is the first
and only place tabs are needed; extracting a primitive before a second call
site exists is premature abstraction (Principle I).
