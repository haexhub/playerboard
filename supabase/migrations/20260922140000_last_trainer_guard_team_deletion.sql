-- Reverses the cascade exemption added in 20260922130000: letting the delete
-- through left a team without a trainer, which is not an acceptable trade.
-- That migration is already merged, so it stays and this one redefines the
-- function on top of it.
--
-- A team must keep a trainer, and that stays true when the trainer's account
-- is deleted: the cascade from auth.users hits this trigger and the deletion
-- is refused, so the account can only go once the role has been handed over.
-- POST /api/profile/delete does that handover first and explains the rule;
-- this trigger is the backstop for anything that bypasses the route.
--
-- The one case the guard must not block is the team itself being deleted:
-- there is no team left that could need a trainer. Deleting a team cascades
-- into its memberships, so detect it by the team row already being gone.

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
