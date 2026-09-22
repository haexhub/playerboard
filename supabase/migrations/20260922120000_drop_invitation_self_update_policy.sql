-- Invitees never update their invitation row themselves: acceptance runs
-- through the service-role function accept_invitation(), which sets
-- accepted_at after verifying token, expiry and email. The self-update
-- policy below therefore had no legitimate caller, but Postgres RLS cannot
-- restrict an UPDATE to single columns, so it let an invitee rewrite
-- role/team_id/player_id/expires_at of their own pending invitation before
-- accepting it (e.g. player -> trainer). Remove it.

drop policy if exists invitations_accept_own_email on public.invitations;
