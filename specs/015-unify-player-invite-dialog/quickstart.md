# Quickstart Delta: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

No new dev-environment setup — reuses the running stack from
[specs/001-points-and-photos/quickstart.md](../001-points-and-photos/quickstart.md).
After `/speckit.tasks` lands and the migration is authored:

1. `pnpm db:generate` — Drizzle picks up `email` on `players` (+ `players_email_per_team_uniq`).
2. Review the generated migration against [data-model.md](./data-model.md) — no hand-written RLS
   migration needed this time (contracts/rls-policies.md — no policy change).
3. `pnpm db:reset` to apply, then `pnpm gen:types`.
4. Manual smoke test as a trainer on `/t/<slug>/players`:
   - "Neuer Spieler" → save with just a name, no email — player is created, "Direkt einladen" was
     disabled the whole time.
   - "Bearbeiten" that same player → add an email, check "Direkt einladen", save → confirm an
     invite mail goes out (or check the `invitations` row locally).
   - In the list, click "Einladen" on that player again → confirm it resends without a dialog and
     without erroring on the still-open invitation.
   - Accept the invite as that email in another session, then "Bearbeiten" the now-linked player →
     confirm "Direkt einladen" is gone/disabled, and changing the email now updates the login email
     instead (verify via Supabase Auth dashboard or another sign-in with the new address).
   - Deactivate the player, then reactivate via "Bearbeiten" → "Aktiv im Kader" — confirm no
     separate "Aktivieren" button exists in the list.
   - Try to give two players in the same team the same email → confirm the save is rejected.
