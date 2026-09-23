# Feature Specification: Einheitlicher Spieler-Dialog & direkte Einladungs-Aktionen

**Feature Branch**: `015-unify-player-invite-dialog`
**Spec Directory**: `015-unify-player-invite-dialog`
**Created**: 2026-09-24
**Status**: Draft
**Input**: User description: "den spieler anlegen dialog möchte ich überarbeiten und vereinheitlichen.
ich möchte nicht mehr 2 verschiedene tabs/views haben, sondern nur eine. das email feld soll einfach
optional werden. beim anlegen soll es eine checkbox geben, die angehackt werden kann (wenn eine email
hinterlegt wurde), um neu erstellte spieler mit einer email direkt einladen zu können. in der spieler
übersicht soll es ebenfalls nur über den bearbeiten button möglich sein, die daten zum spieler zu
verändern, inklusive email adresse. wenn eine email angegeben wurde, soll wieder die checkbox aktiv
werden, über die der spieler direkt eine einladung bekommen kann. wenn vorher eine andere email
hinterlegt war, soll der alte spieler gelöscht werden. oder kann man in supabase das einfach ändern?
in der spielerübersicht kann man spieler deaktivieren. allerdings gibt es keine möglichkeit, einen
deaktivierten spieler wieder zu aktivieren. das soll ebenfalls geändert werden. der einladen button
soll nicht mehr den spieler anlegen dialog hochbringen (das geht nur noch über bearbeiten), sondern
schickt einfach die einladung an die hinterlegte email (erneut) raus. das geht natürlich nur, wenn
eine email hinterlegt ist, ansonsten muss der button disabled sein"

## Background

Der bestehende Spieler-Dialog (`PlayerForm.vue`, spezifiziert in
[specs/001-points-and-photos](../001-points-and-photos/spec.md) und ergänzt um einen zweiten
Einstiegspunkt in [specs/006-player-detail-edit](../006-player-detail-edit/spec.md)) hat beim Anlegen
drei Modi (manuell / bestehendes Konto verknüpfen / per E-Mail einladen), von denen der
Verknüpfen-Modus nur sichtbar ist, wenn verknüpfbare Kandidaten existieren. Spieler haben heute
**keine eigene E-Mail-Spalte** — eine E-Mail existiert nur flüchtig auf der `invitations`-Tabelle,
solange eine Einladung offen ist. Der "Einladen"-Button im Spielerstamm öffnet aktuell einen
separaten, generischen Einladungs-Dialog (`InviteForm.vue`, auch für Trainer-Einladungen genutzt),
der nicht auf die angeklickte Zeile bezogen ist. Es gibt zudem keine Möglichkeit, einen deaktivierten
Spieler über die Oberfläche wieder zu aktivieren — nur die "Aktiv im Kader"-Checkbox im
Bearbeiten-Dialog erlaubt das indirekt.

Diese Spec vereinheitlicht den Anlegen/Bearbeiten-Dialog auf ein einziges Formular, macht die E-Mail
zu einem dauerhaft gespeicherten, jederzeit über "Bearbeiten" änderbaren Feld, und macht den
"Einladen"-Button im Spielerstamm zu einer direkten Aktion ohne Dialog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spieler über ein einheitliches Formular anlegen oder bearbeiten (Priority: P1)

Ein Trainer legt einen neuen Spieler an oder bearbeitet einen bestehenden über ein einziges
Formular ohne Modus-Auswahl. Die E-Mail ist ein optionales Feld; ist sie ausgefüllt, kann der
Trainer per Checkbox festlegen, ob beim Speichern sofort eine Einladung verschickt werden soll.

**Why this priority**: Kernanliegen der Anfrage — die aktuelle Drei-Modi-Auswahl beim Anlegen
verwirrt und die Bearbeiten-Ansicht bietet heute keine E-Mail-Verwaltung.

**Independent Test**: Als Trainer "Neuer Spieler" öffnen, nur Name eingeben und speichern (kein
E-Mail-Feld nötig) — Spieler wird angelegt. Danach denselben Spieler über "Bearbeiten" öffnen,
E-Mail eintragen, "Direkt einladen" ankreuzen, speichern — eine Einladung wird verschickt.

**Acceptance Scenarios**:

1. **Given** der Trainer öffnet "Neuer Spieler", **When** das Formular angezeigt wird, **Then**
   sieht er ein einziges Formular mit Name (Pflichtfeld), E-Mail (optional), Trikotnummer
   (optional), Position (optional), Foto-Einwilligung, Aktiv im Kader und "Direkt einladen" — ohne
   Modus-Auswahl.
2. **Given** das E-Mail-Feld ist leer, **Then** ist die "Direkt einladen"-Checkbox deaktiviert.
3. **Given** der Trainer trägt eine E-Mail ein, **Then** wird die "Direkt einladen"-Checkbox
   aktivierbar.
4. **Given** die Checkbox ist beim Speichern angehakt, **When** das Speichern erfolgreich ist,
   **Then** erhält der Spieler zusätzlich zum Anlegen/Aktualisieren eine (neue oder erneute)
   Einladung an die eingetragene E-Mail.
5. **Given** der Trainer bearbeitet einen bereits mit einem Konto verknüpften Spieler
   (`linked_user_id` gesetzt), **Then** ist die "Direkt einladen"-Checkbox nicht sichtbar bzw.
   deaktiviert, da nichts mehr einzuladen ist.
6. **Given** der Trainer ändert im Bearbeiten-Dialog die E-Mail eines bereits verknüpften Spielers
   auf eine neue Adresse, **When** er speichert, **Then** wird die Login-E-Mail des bestehenden
   Kontos direkt geändert (kein Löschen/Neuanlegen des Spielers), und Erfolg/Fehlschlag wird
   angezeigt.

---

### User Story 2 - Einladung direkt aus der Spielerliste (erneut) verschicken (Priority: P2)

Ein Trainer klickt in der Spielerliste auf "Einladen" bei einem Spieler, für den bereits eine
E-Mail hinterlegt ist, und die Einladung wird ohne weiteren Dialog sofort (erneut) verschickt.

**Why this priority**: Zweites Kernanliegen — der Button soll keinen Dialog mehr öffnen, sondern
direkt wirken.

**Independent Test**: In der Spielerliste einen Spieler mit hinterlegter E-Mail und ohne
Kontoverknüpfung suchen, auf "Einladen" klicken — ohne dass sich ein Dialog öffnet, erscheint eine
Erfolgsmeldung und eine neue E-Mail wird verschickt (auch wenn bereits eine offene Einladung
existierte).

**Acceptance Scenarios**:

1. **Given** ein Spieler hat keine E-Mail hinterlegt, **Then** ist der "Einladen"-Button in der
   Zeile deaktiviert.
2. **Given** ein Spieler ist bereits mit einem Konto verknüpft, **Then** ist der
   "Einladen"-Button deaktiviert.
3. **Given** ein Spieler hat eine E-Mail hinterlegt und ist nicht verknüpft, **When** der Trainer
   auf "Einladen" klickt, **Then** wird ohne Dialog sofort eine Einladung an diese E-Mail
   verschickt bzw. eine bereits offene Einladung erneut zugestellt.

---

### User Story 3 - Deaktivierten Spieler wieder aktivieren (Priority: P3)

Ein Trainer möchte einen zuvor deaktivierten Spieler wieder aktiv setzen.

**Why this priority**: Behebt eine bestehende Lücke (keine Reaktivierung möglich), ist aber
seltener nötig als Anlegen/Bearbeiten oder Einladen.

**Independent Test**: Einen inaktiven Spieler über "Bearbeiten" öffnen, "Aktiv im Kader" ankreuzen,
speichern — der Spieler erscheint in der Liste wieder als aktiv.

**Acceptance Scenarios**:

1. **Given** ein Spieler ist inaktiv, **When** der Trainer ihn über "Bearbeiten" öffnet und "Aktiv
   im Kader" ankreuzt und speichert, **Then** wird der Spieler wieder als aktiv geführt.
2. **Given** die Spielerliste, **Then** existiert kein separater "Aktivieren"-Button — Aktivieren
   und Deaktivieren laufen über unterschiedliche Wege (Liste vs. Bearbeiten-Dialog), das ist so
   beabsichtigt.

### Edge Cases

- E-Mail-Feld leer beim Speichern: "Direkt einladen" kann nicht angehakt sein, kein
  Einladungsversand.
- Zwei Spieler desselben Teams würden dieselbe E-Mail erhalten (Groß-/Kleinschreibung
  ignoriert): Speichern wird mit Validierungsfehler abgelehnt.
- "Einladen" wird für einen Spieler geklickt, der bereits eine offene, noch nicht abgelaufene
  Einladung hat: Die bestehende Einladung wird aktualisiert und erneut zugestellt, statt einen
  Fehler wegen doppelten offenen Einladungen zu erzeugen.
- Die E-Mail eines bereits verknüpften Spielers wird auf eine Adresse geändert, die schon zu einem
  anderen Supabase-Auth-Konto gehört: Änderung wird abgelehnt, Fehlermeldung angezeigt, die zuvor
  gespeicherte E-Mail bleibt unverändert bestehen.
- Ein Spieler wird deaktiviert, während eine Einladung für ihn offen ist: Der Einladungsstatus
  bleibt unabhängig vom Aktiv-Status unverändert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Der Anlegen/Bearbeiten-Dialog MUSS ein einziges Formular ohne Modus-Auswahl sein,
  mit den Feldern Name (Pflicht), E-Mail (optional), Trikotnummer (optional), Position (optional),
  Foto-Einwilligung, Aktiv im Kader und "Direkt einladen".
- **FR-002**: Der bisherige Modus "Bestehendes Konto verknüpfen" MUSS aus diesem Dialog entfernt
  werden; die Funktion bleibt ausschließlich über die bestehende Konto-Spalte im Spielerstamm
  erreichbar.
- **FR-003**: Spieler MÜSSEN eine dauerhaft gespeicherte, über "Bearbeiten" jederzeit änderbare
  E-Mail-Adresse haben können (auch ohne dass zu diesem Zeitpunkt eine Einladung verschickt wird).
- **FR-004**: Die E-Mail-Adresse MUSS pro Team eindeutig sein (Groß-/Kleinschreibung ignorierend),
  analog zur bestehenden Eindeutigkeitsregel für Trikotnummern.
- **FR-005**: Die "Direkt einladen"-Checkbox MUSS nur aktivierbar sein, wenn eine E-Mail
  eingetragen ist UND der Spieler noch nicht mit einem Konto verknüpft ist; bei bereits
  verknüpften Spielern MUSS sie ausgeblendet oder deaktiviert sein.
- **FR-006**: Ist die "Direkt einladen"-Checkbox beim Speichern (Anlegen oder Bearbeiten) angehakt,
  MUSS eine Einladung an die aktuell im Formular stehende E-Mail verschickt werden — auch dann,
  wenn für diesen Spieler bereits eine offene Einladung existiert (siehe FR-009).
- **FR-007**: Wird bei einem bereits verknüpften Spieler (`linked_user_id` gesetzt) die E-Mail
  geändert, MUSS die Login-E-Mail des bestehenden Kontos direkt angepasst werden — ohne den
  Spieler-Datensatz zu löschen und neu anzulegen. Schlägt die Änderung fehl (z. B. Adresse bereits
  vergeben), DARF die zuvor gespeicherte E-Mail nicht überschrieben werden und der Fehler MUSS dem
  Trainer angezeigt werden.
- **FR-008**: Der "Einladen"-Button im Spielerstamm DARF keinen Dialog mehr öffnen. Er MUSS
  stattdessen direkt eine (erneute) Einladung an die für den Spieler hinterlegte E-Mail auslösen.
- **FR-009**: Der "Einladen"-Button MUSS deaktiviert sein, wenn der Spieler keine E-Mail hinterlegt
  hat oder bereits mit einem Konto verknüpft ist. Existiert für den Spieler bereits eine offene,
  nicht abgelaufene Einladung, MUSS ein erneuter Klick diese Einladung erneut zustellen statt
  einen Fehler zu erzeugen.
- **FR-010**: Reaktivierung eines deaktivierten Spielers MUSS ausschließlich über die "Aktiv im
  Kader"-Checkbox im Bearbeiten-Dialog möglich sein; es MUSS kein zusätzlicher
  "Aktivieren"-Button im Spielerstamm eingeführt werden.
- **FR-011**: Die bisherige generische Einladungs-Dialog-Anbindung an den Spielerstamm (der
  separate "Spieler einladen"-Dialog samt zugehörigem Öffnen-Zustand) MUSS entfernt werden, da sie
  durch das vereinheitlichte Formular und die direkte Einladen-Aktion redundant geworden ist. Die
  Komponente `InviteForm.vue` selbst — inklusive ihrer optionalen "Spieler gleichzeitig
  anlegen"-Unterfunktion — MUSS unverändert erhalten bleiben, da sie auch auf der
  Mitglieder-Seite (`team/members.vue`) für Trainer- und Spieler-Einladungen genutzt wird und
  diese Unterfunktion dort weiterhin gebraucht wird.
- **FR-012**: Für diese Fähigkeit MUSS die Schreibautorisierung weiterhin ausschließlich über
  bestehende bzw. minimal erweiterte RLS-Policies auf `players` erfolgen; es DÜRFEN keine neuen
  Rollen oder Berechtigungsmodelle eingeführt werden.

### Key Entities

- **Player** (erweitert, aus specs/001-points-and-photos): neues Attribut `email` (optional,
  pro Team eindeutig ohne Berücksichtigung der Groß-/Kleinschreibung) als dauerhaft gespeicherte
  Kontaktadresse, unabhängig vom flüchtigen Einladungsstatus.
- **Invitation** (bestehend): bleibt der Prüfpfad je Einladungsversuch; Verhalten beim erneuten
  Auslösen für einen Spieler mit bereits offener Einladung ändert sich von "Fehler" zu
  "aktualisieren und erneut zustellen".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Trainer kann einen neuen Spieler ohne E-Mail-Angabe in einem einzigen
  Formulardurchlauf anlegen, ohne einen Modus wählen zu müssen.
- **SC-002**: Ein Trainer kann einem bestehenden Spieler nachträglich eine E-Mail hinzufügen und
  im selben Speichervorgang eine Einladung auslösen.
- **SC-003**: Ein erneuter Klick auf "Einladen" für einen Spieler mit offener Einladung führt in
  100 % der Fälle zu einer erfolgreich zugestellten (erneuten) Einladung statt zu einem Fehler.
- **SC-004**: Kein Spieler kann nach dem Speichern eine E-Mail tragen, die im selben Team bereits
  einem anderen Spieler zugeordnet ist.
- **SC-005**: Ein deaktivierter Spieler kann ausschließlich über den Bearbeiten-Dialog wieder
  aktiviert werden, und diese Änderung ist unmittelbar in der Spielerliste sichtbar.

## Assumptions

- Die Änderung der Login-E-Mail eines bereits verknüpften Spielers erfolgt serverseitig direkt
  (`updateUserById`, sofort wirksam ohne Bestätigungs-E-Mail an die neue Adresse) statt über
  Löschen und Neuanlegen — bestätigt durch den Auftraggeber.
- `players.email` ist pro Team eindeutig (Groß-/Kleinschreibung ignorierend) — bestätigt durch den
  Auftraggeber, analog zur bestehenden Trikotnummer-Regel.
- Der Modus "Bestehendes Konto verknüpfen" entfällt im Dialog vollständig und bleibt nur über die
  Konto-Spalte im Spielerstamm erreichbar — bestätigt durch den Auftraggeber.
- `InviteForm.vue` bleibt vollständig unverändert bestehen (inkl. ihrer "Spieler gleichzeitig
  anlegen"-Unterfunktion), da sie auch von `team/members.vue` für Trainer- und Spieler-Einladungen
  genutzt wird; nur ihre Anbindung an den Spielerstamm (der dortige Dialog-Zustand und -Trigger)
  entfällt.
- Es werden keine neuen RLS-Policies benötigt: Lese-/Schreibzugriff auf das neue `email`-Feld läuft
  über die bestehenden Policies `players_read_member` / `players_write_trainer`; nur die
  serverseitige Auth-E-Mail-Änderung und der idempotente Einladungs-Resend benötigen weiterhin
  Service-Role-Zugriff wie die bestehende Einladungs-Route.
