# Feature Specification: Spieler-Stammdaten aus der Detailansicht bearbeiten

**Feature Branch**: `014-player-detail-edit`
**Spec Directory**: `006-player-detail-edit`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "ich möchte als trainer in der spieler ansicht dort ebenfalls
die settings zu diesem spieler bearbeiten können (name, trikotnummer, foto einwilligung etc.),
z.B. auf /t/c1/players/72b15d25-9c2a-471b-ab60-214bfc4d2534"

## Clarifications

### Session 2026-09-25

- Q: Nach Einführung von `players.email` und der Direkt-einladen-Fähigkeit
  (015-unify-player-invite-dialog) auf dem Spielerstamm-Dialog: Trägt ein
  Trainer einem bestehenden Spieler auf dieser Detailseite nachträglich eine
  E-Mail ein oder ändert eine vorhandene, soll er den Spieler auch von hier aus
  direkt einladen können, statt dafür zum Spielerstamm wechseln zu müssen? →
  A: Ja. Das ersetzt die ursprüngliche Annahme dieser Spec ("Konto-Verknüpfung/
  Einladung bleibt ausschließlich im Spielerstamm"), die vor der Einführung von
  `players.email` getroffen wurde. Siehe FR-008.

## Background

Trainer können Spieler-Stammdaten (Name, Trikotnummer, Position, Foto-Einwilligung,
Aktiv-Status) bereits im Spielerstamm (`/t/{slug}/players`) bearbeiten
(spezifiziert in [specs/001-points-and-photos](../001-points-and-photos/spec.md),
User Story 4 / FR-030–FR-033 / FR-044). Diese Funktion fehlt bislang auf der
Spieler-Detailansicht (`/t/{slug}/players/{id}`), die aktuell rein lesbar ist
(Name, Trikotnummer, Position, Fortschritts-Chart). Diese Spec ergänzt einen
zusätzlichen Einstiegspunkt für dieselbe, bereits bestehende Bearbeitungsfähigkeit —
sie führt keine neuen Felder oder Geschäftsregeln ein.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trainer bearbeitet Spieler-Stammdaten in der Detailansicht (Priority: P1)

Ein Trainer öffnet die Detailseite eines Spielers seines Teams und möchte Name,
Trikotnummer, Position, Foto-Einwilligung oder Aktiv-Status ändern, ohne dafür
zurück zum Spielerstamm navigieren zu müssen.

**Why this priority**: Kernanliegen der Anfrage — Trainer stehen oft schon auf der
Detailseite (z. B. nach dem Antippen eines Spielers in der Rangliste) und sollen
Korrekturen direkt dort vornehmen können, statt den Kontext zu wechseln.

**Independent Test**: Als Trainer die Detailseite eines eigenen Spielers öffnen, ein
Feld in den stets sichtbaren Einstellungen ändern — die Änderung wird automatisch
gespeichert (bei Textfeldern debounced) und ist sofort auf derselben Seite sichtbar
sowie im Spielerstamm konsistent.

**Acceptance Scenarios**:

1. **Given** ein Trainer betrachtet die Detailseite eines Spielers seines Teams,
   **Then** werden Name, Trikotnummer, Position, Foto-Einwilligung und Aktiv-Status
   sofort als editierbare Felder mit den aktuellen Werten angezeigt — ohne einen
   separaten Bearbeiten-Modus aktivieren zu müssen.
2. **Given** der Trainer ändert ein Feld, **When** die Eingabe gültig ist, **Then**
   wird die Änderung automatisch gespeichert (Textfelder debounced, Checkboxen
   sofort), ein kurzer Inline-Speicherstatus ("Speichert…" / "Gespeichert") erscheint,
   und die neuen Werte werden angezeigt (u. a. in der Überschrift mit Trikotnummer
   und Name) — ohne Speichern- oder Abbrechen-Button.
3. **Given** der Trainer vergibt eine Trikotnummer, die bereits ein anderer aktiver
   Spieler desselben Teams trägt, **When** die automatische Speicherung ausgelöst
   wird, **Then** erscheint dieselbe Fehlermeldung wie im Spielerstamm, und die
   eingegebenen Werte bleiben im Formular erhalten, ohne gespeichert zu werden.
4. **Given** ein Teammitglied ohne Trainer-Rolle (Spieler) betrachtet dieselbe
   Detailseite, **Then** ist der Einstellungen-Bereich (Name/Trikotnummer/Position/
   Foto-Einwilligung/Aktiv-Status) nicht sichtbar — die Seite verhält sich wie heute
   rein lesend.

---

### Edge Cases

- Ungültige Eingabe (z. B. leerer Name, negative Trikotnummer): Inline-Validierungsfehler
  wie im bestehenden Formular; die automatische Speicherung wird verhindert, bis der
  Fehler behoben ist.
- Trikotnummer-Konflikt mit einem anderen aktiven Spieler: gleiche Fehlermeldung wie
  im Spielerstamm ("Trikotnummer ist im aktiven Kader bereits vergeben...").
- Speichervorgang läuft noch: Ein Inline-Statustext zeigt "Speichert…"; es gibt keinen
  expliziten Speichern-Button und damit keinen Doppel-Submit.
- Rollenwechsel des Nutzers zwischen Laden der Seite und Speichern (z. B. Rolle wurde
  zwischenzeitlich auf "Spieler" geändert): Der Schreibzugriff wird durch die
  bestehende RLS-Policy ohnehin abgelehnt; die Seite zeigt die generische
  Fehlermeldung aus dem bestehenden Speicherpfad.
- Tippen im Namens-, Trikotnummer- oder Positionsfeld: Die Speicherung ist debounced,
  sodass nicht bei jedem Tastenanschlag ein Request ausgelöst wird, sondern erst nach
  einer kurzen Pause ohne weitere Eingabe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trainer MÜSSEN Name, Trikotnummer, Position, Foto-Einwilligung und
  Aktiv-Status eines Spielers direkt auf dessen Detailseite
  (`/t/{slug}/players/{id}`) als stets sichtbare, automatisch speichernde
  Einstellungen bearbeiten können — ohne zum Spielerstamm zu navigieren, einen
  separaten Bearbeiten-Modus zu aktivieren oder einen expliziten
  Speichern-/Abbrechen-Button zu benutzen.
- **FR-002**: Der Einstellungen-Bereich MUSS ausschließlich für Nutzer mit
  Trainer-Rolle im jeweiligen Team sichtbar sein; Teammitglieder ohne Trainer-Rolle
  sehen weiterhin nur die bestehende rein lesbare Ansicht.
- **FR-003**: Feldset, Validierungsregeln und Trikotnummer-Konflikt-Behandlung
  MÜSSEN identisch zu den bereits in
  [specs/001-points-and-photos](../001-points-and-photos/spec.md) (FR-030–FR-033,
  FR-044) spezifizierten Regeln der Spielerverwaltung sein — keine neuen Felder,
  keine neuen Geschäftsregeln.
- **FR-004**: Ein Speichervorgang auf der Detailseite MUSS denselben Spieler-Datensatz
  aktualisieren, der auch im Spielerstamm angezeigt wird (eine einzige
  Datenquelle), und die aktualisierten Werte MÜSSEN unmittelbar danach auf der
  Detailseite sichtbar sein.
- **FR-005**: Die Detailseite MUSS zusätzlich zu den bereits geladenen Feldern
  (Name, Trikotnummer, Position) auch `photo_consent` und `active` laden, damit
  der Einstellungen-Bereich mit den aktuellen Werten vorbefüllt werden kann.
- **FR-006**: Für diese Fähigkeit DÜRFEN keine neuen Datenbanktabellen, -spalten
  oder RLS-Policies eingeführt werden; die Schreibautorisierung MUSS weiterhin
  ausschließlich über die bestehende trainer-write-RLS-Policy auf `players`
  erfolgen.
- **FR-007**: Änderungen an Name, Trikotnummer und Position MÜSSEN debounced
  automatisch gespeichert werden (kein Request pro Tastenanschlag); Änderungen an
  Foto-Einwilligung und Aktiv-Status (Checkboxen) MÜSSEN sofort automatisch
  gespeichert werden. Es gibt keinen expliziten Speichern- oder Abbrechen-Button.
- **FR-008**: Für einen nicht verknüpften Spieler (`linked_user_id` ist `null`)
  MUSS der Einstellungen-Bereich einen "Einladen"-Button zeigen, der eine
  Einladung direkt an die aktuell **gespeicherte** `players.email` verschickt
  (analog zum bestehenden Einladen-Button im Spielerstamm,
  015-unify-player-invite-dialog FR-008/FR-009) — ohne dass dafür der
  Spielerstamm besucht werden muss. Der Button MUSS deaktiviert sein, solange
  keine E-Mail gespeichert ist (auch wenn im Feld bereits ein noch nicht
  gespeicherter Wert eingetragen wurde) oder solange der Spieler bereits
  verknüpft ist. Für verknüpfte Spieler entfällt der Button vollständig, da bei
  ihnen keine Einladung mehr sinnvoll ist.

### Key Entities

- **Player** (bestehend, aus specs/001-points-and-photos): keine neuen Attribute,
  keine neue Entität — diese Spec fügt lediglich einen weiteren UI-Einstiegspunkt
  zum Bearbeiten bereits bestehender Attribute hinzu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Trainer kann Name, Trikotnummer, Position, Foto-Einwilligung
  oder Aktiv-Status eines Spielers direkt von dessen Detailseite aus ändern, ohne
  die Seite zu verlassen.
- **SC-002**: Nutzer ohne Trainer-Rolle sehen zu keinem Zeitpunkt den
  Einstellungen-Bereich auf der Detailseite.
- **SC-003**: Trikotnummer-Konflikte werden auf der Detailseite mit derselben
  Fehlermeldung abgefangen wie im Spielerstamm, in 100 % der Fälle.
- **SC-004**: Nach einem erfolgreichen Speichern auf der Detailseite zeigen sowohl
  die Detailseite als auch der Spielerstamm konsistent dieselben, aktualisierten
  Werte.
- **SC-005**: Ein Trainer kann einem bestehenden, nicht verknüpften Spieler auf
  dessen Detailseite eine E-Mail hinzufügen oder ändern und ihn im Anschluss,
  ohne den Spielerstamm zu besuchen, direkt einladen.

## Assumptions

- Wiederverwendung der bestehenden Bearbeiten-Logik (Formularfelder, Validierung,
  Speichern über `usePlayers().update()`) statt einer zweiten, parallelen
  Implementierung — gemäß Simplicity-Prinzip der Constitution.
- "etc." in der Nutzeranfrage bezieht sich auf das bereits im Spielerstamm
  editierbare Feldset (Name, Trikotnummer, Position, Foto-Einwilligung,
  Aktiv-Status) — keine zusätzlichen Felder über das hinaus, was `PlayerForm`
  heute bereits abdeckt.
- Konto-**Verknüpfung** (Auswahl eines bestehenden Kontos für einen Spieler)
  bleibt ausschließlich im Spielerstamm; die Detailseite bearbeitet stets nur
  einen bereits existierenden Spieler. Das direkte **Einladen** eines bereits
  vorhandenen, noch nicht verknüpften Spielers ist davon ausgenommen (siehe
  Clarifications, FR-008) — diese ursprüngliche Annahme galt vor Einführung von
  `players.email`.
- Keine RLS-Änderung erforderlich: Die bestehende Policy `players_write_trainer`
  erlaubt Schreibzugriff bereits jedem Trainer des jeweiligen Teams.
