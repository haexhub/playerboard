-- Two active categories may share a sort_order (the category form accepts
-- any positive number). Both ranking functions ordered the ranking vector and
-- the category list by sort_order alone, so under a tie the element order was
-- unspecified: rank() could compare different vectors on consecutive calls
-- and the ranking could reshuffle without any data changing. Break the tie by
-- category id. Scores are returned keyed by category, so the displayed values
-- were never misattributed; only the rank order and header order wobbled.
--
-- CREATE OR REPLACE keeps each function's owner and grants, including
-- get_public_ranking's security-definer owner public_ranking_reader.

CREATE OR REPLACE FUNCTION public.get_team_ranking(p_team uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_categories jsonb;
  v_rows jsonb;
begin
  if not public.is_member(p_team) then
    return null;
  end if;

  with active_cats as (
    select id, name, sort_order
      from public.point_categories
      where team_id = p_team and active
      order by sort_order
  ),
  scored as (
    select p.id  as player_id,
           p.name,
           p.jersey_number,
           ac.id as category_id,
           coalesce(sum(pe.value) filter (where t.id is not null), 0)::bigint as sum_value
      from public.players p
      cross join active_cats ac
      left join public.point_entries pe on pe.player_id = p.id and pe.category_id = ac.id
      left join public.trainings t on t.id = pe.training_id
        and t.date between p_from and p_to
        and t.status = 'saved'
        and t.team_id = p_team
     where p.team_id = p_team and p.active
     group by p.id, p.name, p.jersey_number, ac.id
  ),
  pivoted as (
    select player_id, name, jersey_number,
           jsonb_object_agg(category_id::text, sum_value) as scores,
           array_agg(sum_value order by (select sort_order from active_cats ac where ac.id = category_id), category_id) as ranking_vector
      from scored
     group by player_id, name, jersey_number
  ),
  ranked as (
    select *,
           rank() over (order by ranking_vector desc) as rank_position
      from pivoted
  )
  select jsonb_agg(row_to_json(r) order by r.rank_position, r.jersey_number nulls last)
    into v_rows
    from (
      select rank_position, player_id, name, jersey_number, scores
        from ranked
    ) r;

  select jsonb_agg(row_to_json(c) order by c.sort_order, c.id)
    into v_categories
    from (
      select id, name, sort_order from public.point_categories
        where team_id = p_team and active order by sort_order
    ) c;

  return jsonb_build_object(
    'team_id', p_team,
    'from', p_from,
    'to', p_to,
    'categories', coalesce(v_categories, '[]'::jsonb),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_ranking(p_slug text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_team_id uuid;
  v_team_name text;
  v_categories jsonb;
  v_rows jsonb;
begin
  select id, name into v_team_id, v_team_name
    from public.teams where slug = p_slug;

  if v_team_id is null then
    return jsonb_build_object(
      'team_name', null, 'from', p_from, 'to', p_to,
      'categories', '[]'::jsonb, 'rows', '[]'::jsonb,
      'not_found', true
    );
  end if;

  with active_cats as (
    select id, name, sort_order
      from public.point_categories
      where team_id = v_team_id and active
      order by sort_order
  ),
  scored as (
    select p.id as player_id,
           p.jersey_number,
           ac.id as category_id,
           ac.name as category_name,
           coalesce(sum(pe.value) filter (where t.id is not null), 0)::bigint as sum_value
      from public.players p
      cross join active_cats ac
      left join public.point_entries pe on pe.player_id = p.id and pe.category_id = ac.id
      left join public.trainings t on t.id = pe.training_id
        and t.date between p_from and p_to
        and t.status = 'saved'
        and t.team_id = v_team_id
     where p.team_id = v_team_id and p.active
     group by p.id, p.jersey_number, ac.id, ac.name
  ),
  pivoted as (
    select player_id, jersey_number,
           jsonb_object_agg(category_name, sum_value) as scores,
           array_agg(sum_value order by (
             select sort_order from active_cats ac where ac.id = category_id
           ), category_id) as ranking_vector
      from scored
     group by player_id, jersey_number
  ),
  ranked as (
    select *,
           rank() over (order by ranking_vector desc) as rank_position
      from pivoted
  )
  select jsonb_agg(
           jsonb_build_object(
             'rank_position', rank_position,
             'jersey_number', jersey_number,
             'scores', scores
           )
           order by rank_position, jersey_number nulls last
         )
    into v_rows
    from ranked;

  select jsonb_agg(
           jsonb_build_object('name', name, 'sort_order', sort_order)
           order by sort_order, id
         )
    into v_categories
    from public.point_categories
   where team_id = v_team_id and active;

  return jsonb_build_object(
    'team_name', v_team_name,
    'from', p_from,
    'to', p_to,
    'categories', coalesce(v_categories, '[]'::jsonb),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;
