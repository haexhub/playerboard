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
   - Click that player's name (links to `/t/<slug>/players/<id>`) → on the detail page's
     always-visible settings form, add an email → confirm it autosaves ("Gespeichert"), then use the
     "Einladen" button next to the email field (disabled without an email or once linked) → confirm
     an invite mail goes out (or check the `invitations` row locally).
   - Back in the list, click "Einladen" on that player again → confirm it resends without a dialog
     and without erroring on the still-open invitation.
   - Accept the invite as that email in another session, then reopen the now-linked player's detail
     page → confirm the email field still requires the owner-confirmed flow for changes: changing it
     starts a pending Auth email change. Confirm both current and new addresses as the account owner,
     finalize the request, and verify via Supabase Auth dashboard or another sign-in that Auth and
     `players.email` now match. Confirm that clearing the linked player's email is rejected and
     leaves the old address intact.
   - Deactivate the player via the list's status checkbox, then check it again to reactivate — no
     navigation away from the list is needed either way (as of 2026-09-25; the checkbox replaced the
     old edit-dialog-only reactivation path).
   - Try to give two players in the same team the same email → confirm the save is rejected.
   - Simulate a resend-mail failure → confirm the previous open invitation/token remains usable.
   - (2026-09-25) Click "Löschen" on a player with no recorded points → confirm the dialog, row
     disappears. Click "Löschen" on a player who already has point entries → confirm it's rejected
     with a message suggesting deactivation instead, and the row remains.
