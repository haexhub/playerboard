-- ifa-board: replace the deny-all policies on veo_team_mappings/
-- veo_sync_credentials with is_trainer(team_id)-gated ones (specs/
-- 003-veo-analytics, Clarifications 2026-09-22). A trainer now links their
-- own team to Veo directly (POST /api/veo/login + /api/veo/link), instead
-- of a deployment operator seeding these rows by hand. The credential
-- itself stays unreadable by anyone but service_role — only insert/update
-- open up, never select.

drop policy if exists veo_team_mappings_deny_authenticated on public.veo_team_mappings;
drop policy if exists veo_sync_credentials_deny_authenticated on public.veo_sync_credentials;

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

create policy veo_sync_credentials_write_trainer on public.veo_sync_credentials
  for insert to authenticated
  with check (public.is_trainer(team_id));

create policy veo_sync_credentials_update_trainer on public.veo_sync_credentials
  for update to authenticated
  using (public.is_trainer(team_id))
  with check (public.is_trainer(team_id));

-- Deliberately no select policy on veo_sync_credentials for `authenticated`:
-- the session cookie stays unreadable by any client, including the trainer
-- who just wrote it. Only service_role (useAdminDb(), from
-- app/server/utils/veo/auth.ts) reads it.
