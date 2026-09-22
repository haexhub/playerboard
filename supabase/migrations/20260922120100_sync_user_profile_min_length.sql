-- user_profiles_display_name_len_check requires at least two visible
-- characters, but sync_user_profile() derives the default display name from
-- the e-mail local part, which may be a single character (m@example.com).
-- The failing CHECK propagated out of the AFTER INSERT trigger and rolled
-- back the auth.users insert, so such users could not sign up at all.
-- Fall back to the full e-mail address when the derived name is too short,
-- and never overwrite a display name the member has already chosen.

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
  if length(trim(regexp_replace(v_name, '[​-‍﻿]', '', 'g'))) < 2 then
    v_name := new.email;
  end if;

  insert into public.user_profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do update
    set display_name = coalesce(public.user_profiles.display_name, excluded.display_name);
  return new;
end;
$$;
