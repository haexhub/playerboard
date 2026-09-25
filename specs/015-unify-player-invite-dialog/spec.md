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

## Clarifications

### Session 2026-09-25

- Q: US3 AC2 legt bewusst fest, dass Aktivieren/Deaktivieren über unterschiedliche Wege laufen
  (Liste vs. Bearbeiten-Dialog). Soll das dabei bleiben? → A: Nein — Status (aktiv/inaktiv) wird
  direkt in der Spielerliste per Checkbox in beide Richtungen umgeschaltet, wie schon die
  Foto-Einwilligung. Der separate "Deaktivieren"-Button entfällt. US3 AC2 ist damit überholt (siehe
  Durchstreichung dort).
- Q: Wenn der "Bearbeiten"-Button aus der Liste fällt, wie wird ein Spieler dann noch bearbeitet? →
  A: Der Name in der Spielerliste verlinkt auf die Spieler-Detailseite
  ([specs/001-points-and-photos](../001-points-and-photos/spec.md) S4); Bearbeiten läuft
  ausschließlich noch über das dort bereits vorhandene, autospeichernde Formular
  (`PlayerSettingsForm.vue`). Der separate Bearbeiten-Dialog im Spielerstamm entfällt vollständig;
  "Neuer Spieler" bleibt ein eigener (Anlegen-only) Dialog.
- Q: Die Spieler-Detailseite hat kein Einladen — wie lädt ein Trainer einen Spieler ein, dessen
  E-Mail gerade erst dort eingetragen wurde, ohne zurück zur Liste zu wechseln? → A: Ein
  "Einladen"-Button neben dem E-Mail-Feld auf der Detailseite, disabled ohne E-Mail oder bei bereits
  verknüpftem Spieler — exakt dieselbe Bedingung und derselbe `issue()`-Aufruf wie der Listenbutton.
- Q: Spieler sollen komplett gelöscht werden können — wie verträgt sich das mit FR-032 (kein Löschen
  bei historischen Punkteinträgen)? → A: Ein "Löschen"-Button pro Zeile in der Spielerliste, mit
  Sicherheitsabfrage. `players.id` wird von `point_entries.player_id` per `ON DELETE RESTRICT`
  geschützt (bereits im Schema vorhanden, siehe `db/schema/index.ts`); ein Löschversuch für einen
  Spieler mit Punkteinträgen schlägt serverseitig fehl und die UI zeigt einen Hinweis, stattdessen zu
  deaktivieren, statt den Fehler ungefiltert durchzureichen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spieler über ein einheitliches Formular anlegen oder bearbeiten (Priority: P1)

Ein Trainer legt einen neuen Spieler an oder bearbeitet einen bestehenden über ein einziges
Formular ohne Modus-Auswahl. Bei nicht verknüpften Spielern ist die E-Mail ein optionales Feld;
ist sie ausgefüllt, kann der Trainer per Checkbox festlegen, ob beim Speichern sofort eine
Einladung verschickt werden soll. Bei verknüpften Spielern bleibt eine gültige Login-E-Mail
erforderlich.

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
   auf eine neue Adresse, **When** er speichert, **Then** wird eine kurze, kontoinhaber-bestätigte
   E-Mail-Änderung gestartet. Die Login-E-Mail des bestehenden Kontos und `players.email` bleiben
   bis zur Bestätigung unverändert; danach werden beide synchronisiert, ohne den Spieler zu
   löschen oder neu anzulegen.

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

*(Aktualisiert 2026-09-25 — Acceptance Scenario 2 unten ist überholt und durch
die neue Statuscheckbox in der Liste ersetzt; siehe Clarifications.)*

Ein Trainer möchte einen zuvor deaktivierten Spieler wieder aktiv setzen.

**Why this priority**: Behebt eine bestehende Lücke (keine Reaktivierung möglich), ist aber
seltener nötig als Anlegen/Bearbeiten oder Einladen.

**Independent Test**: In der Spielerliste die Status-Checkbox einer inaktiven Zeile anhaken —
der Spieler erscheint sofort wieder als aktiv (alternativ weiterhin über die Checkbox "Aktiv im
Kader" auf der Spieler-Detailseite, S4 in ui-flows.md).

**Acceptance Scenarios**:

1. **Given** ein Spieler ist inaktiv, **When** der Trainer die Status-Checkbox der Zeile in der
   Spielerliste anhakt, **Then** wird der Spieler ohne weitere Bestätigung wieder als aktiv
   geführt.
2. ~~**Given** die Spielerliste, **Then** existiert kein separater "Aktivieren"-Button — Aktivieren
   und Deaktivieren laufen über unterschiedliche Wege (Liste vs. Bearbeiten-Dialog), das ist so
   beabsichtigt.~~ *(entfällt seit 2026-09-25 — durch eine bidirektionale Status-Checkbox in der
   Liste ersetzt, siehe Clarifications unten.)*

### Edge Cases

- E-Mail-Feld leer beim Speichern: "Direkt einladen" kann nicht angehakt sein, kein
  Einladungsversand.
- Bei einem bereits verknüpften Spieler darf das E-Mail-Feld nicht geleert oder mit einem
  ungültigen Wert gespeichert werden, weil es zugleich die Login-E-Mail ist.
- Zwei Spieler desselben Teams würden dieselbe E-Mail erhalten (Groß-/Kleinschreibung
  ignoriert): Speichern wird mit Validierungsfehler abgelehnt.
- "Einladen" wird für einen Spieler geklickt, der bereits eine offene, noch nicht abgelaufene
  Einladung hat: Die bestehende Einladung wird aktualisiert und erneut zugestellt, statt einen
  Fehler wegen doppelten offenen Einladungen zu erzeugen.
- Die E-Mail eines bereits verknüpften Spielers wird auf eine Adresse geändert, die schon zu einem
  anderen Supabase-Auth-Konto gehört: Änderung wird abgelehnt, Fehlermeldung angezeigt, die zuvor
  gespeicherte E-Mail bleibt unverändert bestehen.
- Die Änderung der E-Mail eines verknüpften Spielers wird erst nach Bestätigung des Kontoinhabers
  wirksam. Bricht der Kontoinhaber ab oder läuft die Bestätigung ab, bleiben beide bisherigen
  E-Mail-Werte erhalten.
- Ein veralteter Spielerstamm-Tab versucht, eine Einladung mit einer früher gespeicherten E-Mail
  zu senden: Der Server lehnt den Versand ab und verschickt keine Einladung.
- Wenn der Versand einer erneuten Einladung fehlschlägt, bleiben die vorherige Einladung und ihr
  bisheriger Token gültig; ein fehlgeschlagener Versand darf keinen funktionierenden Einladungslink
  unbrauchbar machen.
- Ein Spieler wird deaktiviert, während eine Einladung für ihn offen ist: Der Einladungsstatus
  bleibt unabhängig vom Aktiv-Status unverändert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Der Anlegen/Bearbeiten-Dialog MUSS ein einziges Formular ohne Modus-Auswahl sein,
  mit den Feldern Name (Pflicht), E-Mail (optional bei nicht verknüpften Spielern), Trikotnummer
  (optional), Position (optional), Foto-Einwilligung, Aktiv im Kader und "Direkt einladen". Bei
  verknüpften Spielern muss die E-Mail gültig und nicht leer sein.
- **FR-002**: Der bisherige Modus "Bestehendes Konto verknüpfen" MUSS aus diesem Dialog entfernt
  werden; die Funktion bleibt ausschließlich über die bestehende Konto-Spalte im Spielerstamm
  erreichbar.
- **FR-003**: Nicht verknüpfte Spieler MÜSSEN eine dauerhaft gespeicherte, über "Bearbeiten"
  jederzeit änderbare E-Mail-Adresse haben können (auch ohne dass zu diesem Zeitpunkt eine
  Einladung verschickt wird). Bei bereits verknüpften Spielern bleibt die E-Mail-Adresse ein
  gültiger, nicht-leerer Login-Bezug und darf nicht geleert werden.
- **FR-004**: Die E-Mail-Adresse MUSS pro Team eindeutig sein (Groß-/Kleinschreibung ignorierend),
  analog zur bestehenden Eindeutigkeitsregel für Trikotnummern.
- **FR-005**: Die "Direkt einladen"-Checkbox MUSS nur aktivierbar sein, wenn eine E-Mail
  eingetragen ist UND der Spieler noch nicht mit einem Konto verknüpft ist; bei bereits
  verknüpften Spielern MUSS sie ausgeblendet oder deaktiviert sein.
- **FR-006**: Ist die "Direkt einladen"-Checkbox beim Speichern (Anlegen oder Bearbeiten) angehakt,
  MUSS eine Einladung an die aktuell im Formular stehende E-Mail verschickt werden — auch dann,
  wenn für diesen Spieler bereits eine offene Einladung existiert (siehe FR-009).
- **FR-007**: Wird bei einem bereits verknüpften Spieler (`linked_user_id` gesetzt) die E-Mail
  geändert, MUSS eine E-Mail-Änderung im Namen des Kontoinhabers angefordert werden — ohne den
  Spieler-Datensatz zu löschen und neu anzulegen. Die Login-E-Mail DARF erst nach der Bestätigung
  des Kontoinhabers über Supabase' sicheren E-Mail-Änderungsablauf geändert werden. Bis dahin
  bleiben Login-E-Mail und `players.email` unverändert; der Trainer MUSS den ausstehenden Status
  sehen. Schlägt die Änderung fehl (z. B. Adresse bereits vergeben oder leer/ungültig), DARF
  weder die Login-E-Mail noch die zuvor gespeicherte E-Mail überschrieben werden und der Fehler
  MUSS dem Trainer angezeigt werden.
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
  Komponente `InviteForm.vue` selbst bleibt für die Mitglieder-Seite (`team/members.vue`) samt
  ihrer optionalen "Spieler gleichzeitig anlegen"-Unterfunktion erhalten; wenn sie dort einen
  Spieler vorab anlegt, MUSS sie die Einladungs-E-Mail auch in `players.email` speichern, damit
  der neue Bestandspfad denselben Spieler später erneut einladen kann.
- **FR-012**: Für diese Fähigkeit MUSS die Schreibautorisierung weiterhin ausschließlich über
  bestehende bzw. minimal erweiterte RLS-Policies auf `players` erfolgen; es DÜRFEN keine neuen
  Rollen oder Berechtigungsmodelle eingeführt werden.
- **FR-013**: Beim erstmaligen Einführen von `players.email` MÜSSEN bekannte E-Mail-Adressen aus
  bestehenden verknüpften Konten und Einladungen übernommen werden, sofern die Zuordnung innerhalb
  des Teams eindeutig ist. Mehrdeutige Altbestände DÜRFEN nicht willkürlich zugeordnet werden und
  MÜSSEN für eine spätere manuelle Nachpflege erkennbar bleiben.
- **FR-014**: Eine Einladung mit `player_id` MUSS die normalisierte Request-E-Mail innerhalb der
  gleichen Transaktion mit der aktuell gespeicherten `players.email` vergleichen. Bei fehlender
  oder abweichender Adresse MUSS der Versand abgelehnt werden, damit ein veralteter Client keine
  Einladung an eine nicht mehr hinterlegte Adresse verschickt.

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
- **SC-003**: Ein erneuter Klick auf "Einladen" für einen Spieler mit offener Einladung führt zu
  einer erfolgreichen Resend-Anfrage mit derselben Einladungs-ID und einem neuen gültigen Token,
  statt wegen der offenen Einladung mit `409` fehlzuschlagen. Die tatsächliche Zustellung durch
  den externen Maildienst ist dabei nicht Teil des messbaren Anwendungsergebnisses.
- **SC-004**: Kein Spieler kann nach dem Speichern eine E-Mail tragen, die im selben Team bereits
  einem anderen Spieler zugeordnet ist.
- **SC-005**: Ein deaktivierter Spieler kann ausschließlich über den Bearbeiten-Dialog wieder
  aktiviert werden, und diese Änderung ist unmittelbar in der Spielerliste sichtbar.

## Assumptions

- Die Änderung der Login-E-Mail eines bereits verknüpften Spielers erfolgt über einen
  kontoinhaberbestätigten Supabase-E-Mail-Änderungsablauf. Ein Trainer darf keine globale Auth-
  Login-Adresse direkt per Service-Role auf eine eigene Adresse umstellen.
- Bei einem bereits verknüpften Spieler ist die E-Mail im Formular weiterhin erforderlich; nur
  bei nicht verknüpften Spielern ist sie optional.
- `players.email` ist pro Team eindeutig (Groß-/Kleinschreibung ignorierend) — bestätigt durch den
  Auftraggeber, analog zur bestehenden Trikotnummer-Regel.
- Der Modus "Bestehendes Konto verknüpfen" entfällt im Dialog vollständig und bleibt nur über die
  Konto-Spalte im Spielerstamm erreichbar — bestätigt durch den Auftraggeber.
- `InviteForm.vue` bleibt als UI und Workflow für `team/members.vue` erhalten (inkl. ihrer
  "Spieler gleichzeitig anlegen"-Unterfunktion). Ihr Precreate-Schreibvorgang wird lediglich um
  das Speichern der bereits eingegebenen Einladungs-E-Mail in `players.email` ergänzt; nur ihre
  Anbindung an den Spielerstamm (der dortige Dialog-Zustand und -Trigger) entfällt.
- Es werden keine neuen RLS-Policies benötigt: Lese-/Schreibzugriff auf das neue `email`-Feld läuft
  über die bestehenden Policies `players_read_member` / `players_write_trainer`; nur die
  serverseitige Auth-E-Mail-Änderung und der idempotente Einladungs-Resend benötigen weiterhin
  Service-Role-Zugriff wie die bestehende Einladungs-Route.
- Bei Einführung der neuen Spalte werden bekannte E-Mail-Adressen aus bestehenden verknüpften
  Auth-Konten und, sofern dort nicht vorhanden, aus den neuesten Einladungen übernommen. Bei
  nicht eindeutig auflösbaren Altbeständen bleibt das Feld leer, statt eine Adresse willkürlich
  einem Spieler zuzuordnen.
- Die ausstehende E-Mail-Änderung wird in einer kurzlebigen, serverseitig geschützten Anfrage
  gespeichert. Nur der verknüpfte Kontoinhaber darf sie bestätigen; der Trainer erhält keinen
  Auth-Token und keine direkte Änderungsmöglichkeit.
