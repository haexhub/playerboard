-- Revoke open player invitations when their roster entry is deleted.
-- Accepted invitations remain as history and are detached by the existing
-- ON DELETE SET NULL foreign key action.

create function public.revoke_open_player_invitations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.invitations
   where player_id = old.id
     and accepted_at is null;
  return old;
end;
$$;

revoke all on function public.revoke_open_player_invitations()
  from public, anon, authenticated, service_role;

create trigger revoke_open_player_invitations_before_delete
before delete on public.players
for each row execute function public.revoke_open_player_invitations();
