-- ifa-board: backfill players.email, then lock it down (specs/015-unify-player-invite-dialog)
--
-- Order matters: the unique index must be created after the backfill so
-- deployment cannot fail on legacy duplicate addresses (data-model.md
-- "Migration/backfill"). This file runs after the drizzle-generated
-- 20260924093840_melodic_kabuki.sql, which added the column and table but
-- deliberately skipped creating players_email_per_team_uniq.

do $$
declare
  ambiguous record;
begin
  -- Prefer the linked Auth account's email; otherwise the newest invitation
  -- for that player (an open one over an already-accepted one).
  with candidates as (
    select
      p.id as player_id,
      p.team_id,
      nullif(lower(trim(coalesce(
        au.email,
        (
          select i.email
          from public.invitations i
          where i.player_id = p.id
          order by (i.accepted_at is null) desc, i.created_at desc
          limit 1
        )
      ))), '') as candidate_email
    from public.players p
    left join auth.users au on au.id = p.linked_user_id
  ),
  ranked as (
    select
      c.player_id,
      c.candidate_email,
      count(*) over (partition by c.team_id, c.candidate_email) as dup_count
    from candidates c
    where c.candidate_email is not null
  )
  update public.players p
  set email = r.candidate_email
  from ranked r
  where r.player_id = p.id
    and r.dup_count = 1;

  -- Ambiguous legacy duplicates (two players in the same team resolving to
  -- the same candidate) are left NULL rather than assigned arbitrarily;
  -- surface them for manual follow-up.
  for ambiguous in
    with candidates as (
      select
        p.id as player_id,
        p.team_id,
        nullif(lower(trim(coalesce(
          au.email,
          (
            select i.email
            from public.invitations i
            where i.player_id = p.id
            order by (i.accepted_at is null) desc, i.created_at desc
            limit 1
          )
        ))), '') as candidate_email
      from public.players p
      left join auth.users au on au.id = p.linked_user_id
    )
    select team_id, candidate_email, count(*) as player_count
    from candidates
    where candidate_email is not null
    group by team_id, candidate_email
    having count(*) > 1
  loop
    raise notice 'players.email backfill: team % has % players sharing candidate address % — left NULL for manual follow-up',
      ambiguous.team_id, ambiguous.player_count, ambiguous.candidate_email;
  end loop;
end
$$;

create unique index players_email_per_team_uniq
  on public.players (team_id, lower(email))
  where email is not null;

-- player_email_change_requests: RLS. Only the linked account owner may ever
-- read their own pending request; no client (trainer or owner) may write it
-- directly — only the privileged server routes via useAdminDb() do.
alter table public.player_email_change_requests enable row level security;

create policy player_email_change_requests_read_owner on public.player_email_change_requests
  for select to authenticated
  using (linked_user_id = auth.uid());

-- The helper reads the Auth address while keeping auth.users out of the
-- application's Drizzle schema. It is only callable by the trigger function.
create function public.players_auth_email(user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select lower(trim(email))
  from auth.users
  where id = user_id
$$;

revoke all on function public.players_auth_email(uuid) from public;

-- players_linked_email_guard: once a player is linked, its email is also its
-- Auth login address. A new link gets the Auth address automatically, while
-- an ordinary authenticated write must never change the address of a row that
-- remains linked. The privileged owner-confirmation route connects as the
-- `postgres` role and is allowed through the rolbypassrls check. This checks
-- session_user because the trigger function is SECURITY DEFINER.
create function public.players_linked_email_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if tg_op = 'INSERT' and new.linked_user_id is not null then
    new.email := public.players_auth_email(new.linked_user_id);
  elsif tg_op = 'UPDATE'
    and new.linked_user_id is not null
    and old.linked_user_id is distinct from new.linked_user_id then
    new.email := public.players_auth_email(new.linked_user_id);
  elsif tg_op = 'UPDATE'
    and old.linked_user_id is not null
    and new.linked_user_id is not null
    and new.email is distinct from old.email
    and not exists (
      select 1
      from pg_roles
      where rolname = session_user
        and rolbypassrls
    ) then
    raise exception 'players.email for a linked player can only change through the owner-confirmed email change flow';
  end if;
  return new;
end;
$$;

create trigger players_linked_email_guard
  before insert or update on public.players
  for each row
  execute function public.players_linked_email_guard();
