# Quickstart: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

No operational changes. This feature adds one boolean column, one
`security definer` function, and one page-level UI change — no new
environment variable, dependency, deployment step, or cron entry.

- **Env vars**: none added.
- **Prerequisite**: 004-veo-player-analytics' foundational schema
  (`veo_player_match_stats` table + RLS select policy) must already be
  migrated and syncing data — see research.md §1. Without it, the Veo-Stats
  tab has a real schema to query against but no rows; a team can still
  enable `public_stats_enabled` and will correctly see the "no data yet"
  empty state.
- **Local dev**: after pulling this feature, run `pnpm db:migrate` (new
  `veo_team_mappings.public_stats_enabled` column + `get_public_veo_stats`
  function) and `pnpm gen:types`, same as any other schema change.
- **Trying it out**: as a trainer, open the team's Veo settings page
  (`/t/<slug>/team/veo`) and enable the new public-visibility toggle, then
  open `/public/<slug>/ranking` in a private/incognito window and switch to
  the "Veo-Stats" tab.
- **Backfill**: none needed — the toggle only changes what's exposed, not
  what's synced; existing synced data becomes visible immediately once both
  gates are on.
