-- Keep the anonymous Veo projection limited to the nine metrics defined by
-- the public Veo stats contract, even if another privileged writer stores a
-- future or otherwise sensitive stat type in veo_player_match_stats.
create or replace function public.get_public_veo_stats(
  p_slug text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_season_start date;
  v_enabled boolean;
  v_rows jsonb;
begin
  select t.id, ts.season_start into v_team_id, v_season_start
    from public.teams t
    join public.team_settings ts on ts.team_id = t.id
   where t.slug = p_slug;

  if v_team_id is null then
    return jsonb_build_object(
      'enabled', false, 'season_start', null, 'rows', '[]'::jsonb,
      'not_found', true
    );
  end if;

  select coalesce(vtm.enabled, false) and coalesce(vtm.public_stats_enabled, false)
    into v_enabled
    from public.veo_team_mappings vtm
    where vtm.team_id = v_team_id;

  if not coalesce(v_enabled, false) then
    return jsonb_build_object(
      'enabled', false, 'season_start', v_season_start, 'rows', '[]'::jsonb
    );
  end if;

  with in_season_matches as (
    select id from public.veo_matches
     where team_id = v_team_id and played_at >= v_season_start
  ),
  aggregated as (
    select
      vpms.player_id,
      vpms.stat_type,
      case
        when vpms.stat_type = 'top_speed_kmh' then max(vpms.value)
        when vpms.stat_type = 'average_speed_kmh' then avg(vpms.value)
        else sum(vpms.value)
      end as total
      from public.veo_player_match_stats vpms
      join in_season_matches m on m.id = vpms.match_id
     where vpms.player_id is not null
       and vpms.stat_type in (
         'distance_total_meters',
         'sprints_total',
         'top_speed_kmh',
         'average_speed_kmh',
         'high_intensity_runs_total',
         'seconds_played_total',
         'football_shots_total',
         'football_goal_total',
         'football_goal_involvement_total'
       )
     group by vpms.player_id, vpms.stat_type
  ),
  pivoted as (
    select player_id, jsonb_object_agg(stat_type, total) as stats
      from aggregated
     group by player_id
  )
  select jsonb_agg(
           jsonb_build_object('jersey_number', p.jersey_number, 'stats', pv.stats)
           order by p.jersey_number nulls last
         )
    into v_rows
    from pivoted pv
    join public.players p on p.id = pv.player_id and p.active and p.team_id = v_team_id;

  return jsonb_build_object(
    'enabled', true,
    'season_start', v_season_start,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

alter function public.get_public_veo_stats(text) owner to public_ranking_reader;
revoke all on function public.get_public_veo_stats(text)
  from public, service_role;
grant execute on function public.get_public_veo_stats(text) to anon, authenticated;
