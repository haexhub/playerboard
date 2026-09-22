-- veo_match_id was globally unique, so if two Playerboard teams were ever
-- mapped to the same Veo team the sync would move the existing row to the
-- team synced last instead of storing one row per team. Scope the identity
-- to the team that owns the row. Dropping the constraint drops its index.

alter table public.veo_matches
  drop constraint if exists veo_matches_veo_match_id_unique;

create unique index if not exists veo_matches_team_match_uniq
  on public.veo_matches using btree (team_id, veo_match_id);
