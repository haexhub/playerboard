# Quickstart: Veo-Spieler-Statistiken

No operational changes from 003-veo-analytics. This feature adds one table
and extends the existing daily sync route — it does not introduce any new
environment variable, dependency, deployment step, or cron entry.

- **Env vars**: none added. Reuses `NUXT_VEO_SYNC_SECRET`,
  `NUXT_VEO_LINK_TOKEN_SECRET`, and `NUXT_VEO_CHROMIUM_EXECUTABLE_PATH`
  exactly as already documented in
  [003-veo-analytics/quickstart.md](../003-veo-analytics/quickstart.md).
- **Cron**: unchanged — the same daily `POST /api/veo/sync` call now also
  populates `veo_player_match_stats` per match, with no change to how or
  when it's triggered.
- **Local dev**: after pulling this feature, run `pnpm db:migrate` (new
  `veo_player_match_stats` table + RLS policy) and `pnpm gen:types`
  (Supabase types), same as any other schema change.
- **Backfill**: the first sync run after deploying this feature reprocesses
  the team's full existing match history for player stats (FR-006), the
  same as 003-veo-analytics did for team stats — no separate backfill step
  or script.
