-- teams.timezone feeds `at time zone` in validate_training_date_not_future().
-- It is trainer-writable via teams_update_trainer and has no UI, so a bad
-- value set through the API is only noticed when every training insert for
-- that team starts failing with `time zone "…" not recognized`. Reject the
-- bad value at write time instead.

create or replace function public.validate_team_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is null then
    raise exception 'team timezone must not be null'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'unknown team timezone: %', new.timezone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_team_timezone() from public, anon, authenticated;

create trigger teams_validate_timezone
  before insert or update of timezone on public.teams
  for each row execute function public.validate_team_timezone();
