-- T094: real implementation of get_public_ranking(text, date, date).
--
-- Runs as a dedicated security-definer role with column-level grants scoped
-- to exactly what the anonymous public projection may expose (no team id,
-- no player name/position, no photo/consent data). RLS on the underlying
-- tables would otherwise block this role entirely (it has no membership
-- row), so the role is granted BYPASSRLS — the narrow column grants below
-- are what actually bound its access, not row policies.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'public_ranking_reader') then
    create role public_ranking_reader nologin bypassrls;
  end if;
end
$$;

-- The migration runner is not necessarily a superuser (Supabase's `postgres`
-- role isn't); ALTER FUNCTION ... OWNER TO below requires membership in the
-- target role, so grant it to whichever role is currently running this file.
--
-- Skipped for superusers: they don't need membership for the ownership
-- transfer. On the self-hosted stack (supabase/postgres 15.8.1.085) this
-- plain GRANT made the server process die with SIGSEGV when run by
-- `supabase db push` as supabase_admin, sending the whole database into crash
-- recovery on every container start. The same statement did not crash when
-- sent through psql/pgbench, so the exact trigger is not understood.
do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    execute format('grant public_ranking_reader to %I', current_user);
  end if;
end
$$;

grant usage on schema public to public_ranking_reader;
-- CREATE is needed only transiently so Postgres allows the ownership
-- transfer below (it requires the new owner to be able to create objects
-- in the schema); revoked again once ownership is set.
grant create on schema public to public_ranking_reader;

grant select (id, name, slug) on public.teams to public_ranking_reader;
grant select (id, team_id, name, sort_order, active) on public.point_categories to public_ranking_reader;
grant select (id, team_id, jersey_number, active) on public.players to public_ranking_reader;
grant select (id, team_id, date, status) on public.trainings to public_ranking_reader;
grant select (player_id, category_id, training_id, value) on public.point_entries to public_ranking_reader;

create or replace function public.get_public_ranking(
  p_slug text,
  p_from date,
  p_to   date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
           )) as ranking_vector
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
           order by sort_order
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
$$;

alter function public.get_public_ranking(text, date, date) owner to public_ranking_reader;
revoke create on schema public from public_ranking_reader;

revoke all on function public.get_public_ranking(text, date, date)
  from public, service_role;
grant execute on function public.get_public_ranking(text, date, date) to anon, authenticated;
