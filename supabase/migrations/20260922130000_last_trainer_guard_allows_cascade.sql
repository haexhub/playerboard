-- Part of making account deletion possible (see the generated migration that
-- switches the audit foreign keys to ON DELETE SET NULL).
--
-- The last-trainer guard must not veto a delete that Postgres is cascading
-- from auth.users: the account is going away either way, and vetoing it only
-- turns account erasure back into a manual SQL job. A team whose sole trainer
-- deletes their account is left without one and needs a trainer reassigned
-- out of band.
create or replace function public.prevent_last_trainer_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_remaining int;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
    if old.role <> 'trainer' then
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
