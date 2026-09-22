-- Account deletion crosses the database, Supabase Auth, and Storage, so it
-- cannot be one atomic transaction. The pending rows created immediately
-- before Auth deletion make the hand-off durable and recoverable.
create or replace function public.prevent_last_trainer_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_remaining int;
begin
  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
    if old.role <> 'trainer' then
      return old;
    end if;
    -- The team is being deleted in this same statement.
    if not exists (select 1 from public.teams where id = v_team_id) then
      return old;
    end if;
    -- Auth deletion is external to the database transaction. Let it remove
    -- this membership only when the route has recorded the intended cleanup.
    if exists (
      select 1
      from public.pending_account_deletions
      where user_id = old.user_id and team_id = v_team_id
    ) then
      return old;
    end if;
  else
    if old.role <> 'trainer' then
      return new;
    end if;
    if old.role = 'trainer'
       and new.role = 'trainer'
       and old.team_id = new.team_id then
      return new;
    end if;
    v_team_id := old.team_id;
  end if;

  perform 1 from public.teams where id = v_team_id for update;

  select count(*) into v_remaining
    from public.memberships
    where team_id = v_team_id and role = 'trainer'
      and not (user_id = old.user_id);

  if v_remaining = 0 then
    raise exception 'A team must keep at least one trainer.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
