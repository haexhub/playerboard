-- FR-011: assigned player stats are visible to every team member, but raw
-- rows without a player assignment are correction data for trainers only.
drop policy if exists veo_player_match_stats_read_member on public.veo_player_match_stats;

create policy veo_player_match_stats_read_member on public.veo_player_match_stats
  for select to authenticated
  using (
    public.is_member(
      (select team_id from public.veo_matches where id = match_id)
    )
    and public.is_veo_enabled(
      (select team_id from public.veo_matches where id = match_id)
    )
    and (
      player_id is not null
      or public.is_trainer(
        (select team_id from public.veo_matches where id = match_id)
      )
    )
  );
