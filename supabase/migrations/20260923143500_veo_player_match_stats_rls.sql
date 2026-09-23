-- 004-veo-player-analytics foundational schema, T003: RLS for
-- veo_player_match_stats. Same shape as veo_match_stats_read_member
-- (20260918165000_veo_access_policy.sql) — member + is_veo_enabled(team_id)
-- resolved via match_id. No insert/update/delete policy for `authenticated`:
-- only service_role (via useAdminDb()) writes from the sync route, and a
-- trainer's manual jersey-number correction goes through an explicit
-- requireTrainer() app-level check, not RLS (004/data-model.md).
--
-- Implemented here as a blocking prerequisite for 005-public-veo-ranking
-- (specs/005-public-veo-ranking/research.md §1) — not part of 004's own
-- feature branch history.

alter table public.veo_player_match_stats enable row level security;

create policy veo_player_match_stats_read_member on public.veo_player_match_stats
  for select to authenticated
  using (
    public.is_member(
      (select team_id from public.veo_matches where id = match_id)
    )
    and public.is_veo_enabled(
      (select team_id from public.veo_matches where id = match_id)
    )
  );
