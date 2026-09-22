-- is_veo_enabled() is executable by every authenticated user (RLS policies
-- run as the caller), so it answered "is Veo enabled for team X?" for any
-- team id. Restrict the answer to teams the caller is a member of; the
-- policies already AND it with is_member(), so they are unaffected.

create or replace function public.is_veo_enabled(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member(p_team)
    and exists (
      select 1
        from public.veo_team_mappings
        where public.veo_team_mappings.team_id = p_team
          and public.veo_team_mappings.enabled
    );
$$;
