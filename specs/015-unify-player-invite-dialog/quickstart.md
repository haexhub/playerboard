# Quickstart Delta: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

No new dev-environment setup — reuses the running stack from
[specs/001-points-and-photos/quickstart.md](../001-points-and-photos/quickstart.md).
After `/speckit.tasks` lands and the migration is authored:

1. `pnpm db:generate` — Drizzle picks up `email` on `players` (+ `players_email_per_team_uniq`)
   and the request table definition.
2. Review the generated migration against [data-model.md](./data-model.md): backfill unambiguous
   legacy addresses before creating the unique index, enable request-table RLS, and install the
   linked-player email write trigger.
3. `pnpm db:reset` to apply, then `pnpm gen:types`.
4. Manual smoke test as a trainer on `/t/<slug>/players`:
   - "Neuer Spieler" → save with just a name, no email — player is created, "Direkt einladen" was
     disabled the whole time.
   - "Bearbeiten" that same player → add an email, check "Direkt einladen", save → confirm an
     invite mail goes out (or check the `invitations` row locally).
   - In the list, click "Einladen" on that player again → confirm it resends without a dialog and
     without erroring on the still-open invitation.
   - Accept the invite as that email in another session, then "Bearbeiten" the now-linked player →
     confirm "Direkt einladen" is gone/disabled, and changing the email starts a pending
     owner-confirmed Auth email change. Confirm both current and new addresses as the account owner,
     finalize the request, and verify via Supabase Auth dashboard or another sign-in that Auth and
     `players.email` now match. Confirm that clearing the linked player's email is rejected and
     leaves the old address intact.
   - Deactivate the player, then reactivate via "Bearbeiten" → "Aktiv im Kader" — confirm no
     separate "Aktivieren" button exists in the list.
   - Try to give two players in the same team the same email → confirm the save is rejected.
   - Simulate a resend-mail failure → confirm the previous open invitation/token remains usable.
