# Feature Specification: Spieler-Stammdaten aus der Detailansicht bearbeiten

**Feature Branch**: `014-player-detail-edit`
**Spec Directory**: `006-player-detail-edit`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "ich möchte als trainer in der spieler ansicht dort ebenfalls
die settings zu diesem spieler bearbeiten können (name, trikotnummer, foto einwilligung etc.),
z.B. auf /t/c1/players/72b15d25-9c2a-471b-ab60-214bfc4d2534"

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

**Independent Test**: Als Trainer die Detailseite eines eigenen Spielers öffnen,
Bearbeiten-Modus aktivieren, ein Feld ändern, speichern — die Änderung ist sofort
auf derselben Seite sichtbar und im Spielerstamm konsistent.

**Acceptance Scenarios**:

1. **Given** ein Trainer betrachtet die Detailseite eines Spielers seines Teams,
   **When** er den Bearbeiten-Modus aktiviert, **Then** werden Name, Trikotnummer,
   Position, Foto-Einwilligung und Aktiv-Status als editierbare Felder mit den
   aktuellen Werten angezeigt.
2. **Given** der Trainer hat Felder geändert und klickt "Speichern", **When** das
   Speichern erfolgreich ist, **Then** werden die neuen Werte inline angezeigt
   (u. a. in der Überschrift mit Trikotnummer und Name) und der Bearbeiten-Modus
   wird geschlossen.
3. **Given** der Trainer vergibt eine Trikotnummer, die bereits ein anderer aktiver
   Spieler desselben Teams trägt, **When** er speichert, **Then** erscheint dieselbe
   Fehlermeldung wie im Spielerstamm, und die eingegebenen Werte bleiben erhalten.
4. **Given** ein Teammitglied ohne Trainer-Rolle (Spieler) betrachtet dieselbe
   Detailseite, **Then** ist keinerlei Bearbeiten-Steuerelement sichtbar — die Seite
   verhält sich wie heute rein lesend.

---

### Edge Cases

- Ungültige Eingabe (z. B. leerer Name, negative Trikotnummer): Inline-Validierungsfehler
  wie im bestehenden Formular, Speichern wird verhindert.
- Trikotnummer-Konflikt mit einem anderen aktiven Spieler: gleiche Fehlermeldung wie
  im Spielerstamm ("Trikotnummer ist im aktiven Kader bereits vergeben...").
- Speichervorgang läuft noch: Speichern-Button ist deaktiviert und zeigt einen
  Ladezustand, Doppel-Submits werden verhindert.
- Rollenwechsel des Nutzers zwischen Laden der Seite und Speichern (z. B. Rolle wurde
  zwischenzeitlich auf "Spieler" geändert): Der Schreibzugriff wird durch die
  bestehende RLS-Policy ohnehin abgelehnt; die Seite zeigt die generische
  Fehlermeldung aus dem bestehenden Speicherpfad.
- Abbrechen im Bearbeiten-Modus verwirft ungespeicherte Änderungen und zeigt wieder
  die zuletzt gespeicherten Werte.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trainer MÜSSEN Name, Trikotnummer, Position, Foto-Einwilligung und
  Aktiv-Status eines Spielers direkt auf dessen Detailseite
  (`/t/{slug}/players/{id}`) bearbeiten können, ohne zum Spielerstamm navigieren
  zu müssen.
- **FR-002**: Das Bearbeiten-Steuerelement MUSS ausschließlich für Nutzer mit
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
  der Bearbeiten-Modus mit den aktuellen Werten vorbefüllt werden kann.
- **FR-006**: Für diese Fähigkeit DÜRFEN keine neuen Datenbanktabellen, -spalten
  oder RLS-Policies eingeführt werden; die Schreibautorisierung MUSS weiterhin
  ausschließlich über die bestehende trainer-write-RLS-Policy auf `players`
  erfolgen.

### Key Entities

- **Player** (bestehend, aus specs/001-points-and-photos): keine neuen Attribute,
  keine neue Entität — diese Spec fügt lediglich einen weiteren UI-Einstiegspunkt
  zum Bearbeiten bereits bestehender Attribute hinzu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Trainer kann Name, Trikotnummer, Position, Foto-Einwilligung
  oder Aktiv-Status eines Spielers direkt von dessen Detailseite aus ändern, ohne
  die Seite zu verlassen.
- **SC-002**: Nutzer ohne Trainer-Rolle sehen zu keinem Zeitpunkt ein
  Bearbeiten-Steuerelement auf der Detailseite.
- **SC-003**: Trikotnummer-Konflikte werden auf der Detailseite mit derselben
  Fehlermeldung abgefangen wie im Spielerstamm, in 100 % der Fälle.
- **SC-004**: Nach einem erfolgreichen Speichern auf der Detailseite zeigen sowohl
  die Detailseite als auch der Spielerstamm konsistent dieselben, aktualisierten
  Werte.

## Assumptions

- Wiederverwendung der bestehenden Bearbeiten-Logik (Formularfelder, Validierung,
  Speichern über `usePlayers().update()`) statt einer zweiten, parallelen
  Implementierung — gemäß Simplicity-Prinzip der Constitution.
- "etc." in der Nutzeranfrage bezieht sich auf das bereits im Spielerstamm
  editierbare Feldset (Name, Trikotnummer, Position, Foto-Einwilligung,
  Aktiv-Status) — keine zusätzlichen Felder über das hinaus, was `PlayerForm`
  heute bereits abdeckt.
- Konto-Verknüpfung/Einladung (nur relevant beim Anlegen neuer Spieler) bleibt
  ausschließlich im Spielerstamm; die Detailseite bearbeitet stets nur einen
  bereits existierenden Spieler.
- Keine RLS-Änderung erforderlich: Die bestehende Policy `players_write_trainer`
  erlaubt Schreibzugriff bereits jedem Trainer des jeweiligen Teams.
