-- T003: get_public_veo_stats(text) — public, anonymized Veo season stats.
--
-- Gated by BOTH veo_team_mappings.enabled (internal Veo sync enablement,
-- 003-veo-analytics) AND the new public_stats_enabled (trainer-controlled,
-- default false, this feature) — flipping Veo on internally never
-- auto-publishes it. Reuses the public_ranking_reader role from
-- 20260915170000_public_ranking.sql instead of creating a second
-- bypassrls role for the same crash-prone ownership-transfer dance (see
-- that migration's comment on the self-hosted SIGSEGV, and
-- specs/005-public-veo-ranking/research.md §2).

do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    execute format('grant public_ranking_reader to %I', current_user);
  end if;
end
$$;

grant usage on schema public to public_ranking_reader;
-- CREATE is needed only transiently for the ownership transfer below;
-- revoked again once ownership is set, same as 20260915170000_public_ranking.sql.
grant create on schema public to public_ranking_reader;

grant select (team_id, season_start) on public.team_settings to public_ranking_reader;
grant select (team_id, enabled, public_stats_enabled) on public.veo_team_mappings to public_ranking_reader;
grant select (id, team_id, played_at) on public.veo_matches to public_ranking_reader;
grant select (match_id, player_id, stat_type, value) on public.veo_player_match_stats to public_ranking_reader;

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

  -- Aggregate curated stat values per player across matches played since
  -- season_start, then pivot to one row per player and project only the
  -- player's current jersey_number — never player_id, never a name
  -- (specs/005-public-veo-ranking/data-model.md). Additive metrics are
  -- summed; speed metrics retain their meaning across multiple matches.
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
revoke create on schema public from public_ranking_reader;

revoke all on function public.get_public_veo_stats(text)
  from public, service_role;
grant execute on function public.get_public_veo_stats(text) to anon, authenticated;
