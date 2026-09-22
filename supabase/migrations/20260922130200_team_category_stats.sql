-- The player detail page derived the team average/median per category by
-- calling get_player_scores_by_category once per active player, on every
-- timeframe change: one round trip per player, and Promise.all discarded
-- every result when a single call failed. Aggregate it in one query instead.
--
-- Semantics are unchanged: only players with at least one entry in a
-- category contribute to that category (a non-participant is not counted as
-- zero), only active players and active categories, only saved trainings in
-- the window. SECURITY INVOKER, so the caller's RLS applies exactly as it did
-- to the per-player function.

create or replace function public.get_team_category_stats(
  p_team uuid,
  p_from date,
  p_to   date
)
returns table (
  category_id uuid,
  team_avg    numeric,
  team_median double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with player_sums as (
    select pe.player_id, pe.category_id, sum(pe.value) as sum_value
      from public.point_entries pe
      join public.trainings t on t.id = pe.training_id
      join public.players p on p.id = pe.player_id
      join public.point_categories pc on pc.id = pe.category_id
     where t.team_id = p_team
       and t.status = 'saved'
       and t.date between p_from and p_to
       and p.active
       and pc.active
     group by pe.player_id, pe.category_id
  )
  select category_id,
         avg(sum_value) as team_avg,
         percentile_cont(0.5) within group (order by sum_value) as team_median
    from player_sums
   group by category_id;
$$;

revoke all on function public.get_team_category_stats(uuid, date, date)
  from public, anon, service_role;
grant execute on function public.get_team_category_stats(uuid, date, date)
  to authenticated;
