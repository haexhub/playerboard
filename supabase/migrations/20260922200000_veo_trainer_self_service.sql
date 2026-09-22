-- ifa-board: replace the deny-all policy on veo_team_mappings with
-- is_trainer(team_id)-gated ones (specs/003-veo-analytics, Clarifications
-- 2026-09-22). A trainer now links their own team to Veo directly
-- (POST /api/veo/login + /api/veo/link), instead of a deployment operator
-- seeding this row by hand.
--
-- veo_sync_credentials stays deny-all for `authenticated`: it deliberately
-- has no select policy (the session cookie must never be readable by any
-- client, even the trainer who wrote it), and without one, Postgres's
-- INSERT ... ON CONFLICT DO UPDATE and plain UPDATE can't resolve which row
-- to touch under RLS (confirmed by direct testing — UPDATE silently matches
-- zero rows). Rather than add a select policy just to make writes work
-- (defeating the point), POST /api/veo/link writes both tables via
-- useAdminDb() with an explicit requireTrainer() check instead of RLS — see
-- contracts/rls-policies.md.

drop policy if exists veo_team_mappings_deny_authenticated on public.veo_team_mappings;

create policy veo_team_mappings_read_trainer on public.veo_team_mappings
  for select to authenticated
  using (public.is_trainer(team_id));

create policy veo_team_mappings_write_trainer on public.veo_team_mappings
  for insert to authenticated
  with check (public.is_trainer(team_id));

create policy veo_team_mappings_update_trainer on public.veo_team_mappings
  for update to authenticated
  using (public.is_trainer(team_id))
  with check (public.is_trainer(team_id));
