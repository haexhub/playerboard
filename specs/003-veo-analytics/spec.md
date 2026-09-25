# Feature Specification: Veo-Kamera-Analytics

**Feature Branch**: `003-veo-analytics`
**Created**: 2026-09-18
**Status**: Draft
**Input**: User description: "Ich möchte gerne als nächstes Feature die Analytics unserer Veo-Kamera mit anzeigen. Es gibt keine offizielle, selbst nutzbare API dafür (die dokumentierte Partner-API ist invite-only). Team-Stats pro Spiel und aggregiert über die Saison sollen automatisch aus dem Veo-Account des Vereins übernommen werden, ohne manuelle Eingabe."

## Clarifications

### Session 2026-09-18

- Q: Falls der Verein mehrere Teams im Playerboard hat: wie sollen Veo-Teams den Playerboard-Teams zugeordnet werden? → A: Nur ein Team fürs Erste — Feature startet mit genau einem festen Team-Mapping, weitere Teams sind ein späterer, separater Schritt.
- Q: Sollen beim ersten Sync auch die bereits vorhandenen, älteren Spiele aus Veo importiert werden, oder nur neue Spiele ab jetzt? → A: Komplette Historie importieren — beim ersten Sync werden alle bisherigen Spiele/Statistiken übernommen, danach laufend neue.
- Q: Wie zeitnah müssen neue Match-Stats nach einem Spiel in Playerboard sichtbar sein? → A: Täglicher Batch reicht — einmal pro Nacht synchronisieren ist ausreichend.
- Q: Wer soll den Sync-Status (letzter erfolgreicher Sync / Fehler-Hinweis) aus User Story 3 sehen können? → A: Alle Team-Mitglieder (Trainer und Spieler), nicht nur Trainer/Admin — der Status selbst ist keine sensible Information.
- Q: Was passiert mit bereits übernommenen Spieldaten, wenn das zugehörige Spiel in Veo nachträglich gelöscht oder auf privat gestellt wird? → A: Sie bleiben dauerhaft sichtbar; es gibt keinen aktiven Abgleich/Löschmechanismus gegen den Veo-Bestand.
- Q: Wie wird festgelegt, welches Playerboard-Team Veo-Daten sehen darf, und wer darf das ändern? → A: Die Freischaltung ist eine Platform-Admin-Entscheidung und wird in v1 über einen geschützten direkten Datenbankeintrag des Deployment-Operators umgesetzt; die Einstellungs-Oberfläche folgt im separaten Feature "Platform-Administration". Sie wird nicht automatisch aus einer festen Konfiguration abgeleitet — kein Team hat ohne diese Freischaltung Zugriff. **Superseded 2026-09-22, siehe unten.**
- Q: Soll die Platform-Admin-Rolle (inkl. Ernennen/Entfernen weiterer Admins) Teil dieser Spec sein? → A: Nein — eigenes, vorgelagertes Feature ("Platform-Administration"); diese Spec setzt darauf auf und liefert nur die Veo-spezifische Team-Zuordnung innerhalb dieser Verwaltung. **Superseded 2026-09-22, siehe unten.**

### Session 2026-09-22

- Q: Der Platform-Admin-gebundene Freischaltungsprozess (manuelles SQL durch den Deployment-Operator) blockiert praktisch jede Nutzung durch echte Trainer. Soll das durch einen Trainer-Self-Service ersetzt werden? → A: Ja, vollständig — der Platform-Admin-Teil aus User Story 4 entfällt ersatzlos. Jeder Trainer eines Teams richtet Veo für sein eigenes Team selbst ein, ohne fremde Freigabe.
- Q: Wie sollen die Veo-Zugangsdaten erfasst werden? → A: Der Trainer gibt seine echte Veo-E-Mail/Passwort in einem Formular ein; das System loggt sich damit einmalig bei Veo ein und speichert ausschließlich das daraus resultierende Session-Cookie (wie bisher in `veo_sync_credentials`). Das Passwort selbst wird nie persistiert, nicht geloggt, nur für die Dauer des Login-Vorgangs im Speicher gehalten.
- Q: Ein Trainer kann mehrere Teams sowohl in Veo als auch in Playerboard haben — wie wird zugeordnet? → A: Nach dem Login zeigt das System die tatsächlichen Clubs/Teams des eingeloggten Veo-Accounts zur Auswahl (kein manuelles Eintippen von Kürzeln). Die Auswahl wird gegen genau das eine Playerboard-Team gespeichert, von dessen Einstellungsseite aus der Trainer den Vorgang gestartet hat. Ein Trainer mit mehreren Playerboard-Teams wiederholt den Vorgang pro Team.

**Diese Session hebt den Platform-Admin-Teil von User Story 4 sowie FR-010/FR-011/FR-013 in ihrer bisherigen Form auf — Details in den entsprechenden Abschnitten unten.**

### Session 2026-09-25

- Q: Die Sieg/Unentschieden/Niederlage-Bilanz (FR-004) wurde abgekürzt dargestellt ("5S 1U 0N") — beim Test unklar, wofür die Buchstaben stehen. Wie stattdessen? → A: Ausgeschrieben anzeigen ("5 Siege, 1 Unentschieden, 0 Niederlagen").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team-Statistiken eines Spiels ansehen (Priority: P1)

Ein Mitglied (Trainer oder Spieler-Account) öffnet die Seite eines Spiels, das
mit der Veo-Kamera aufgezeichnet und bereits von Veo ausgewertet wurde, und
sieht dort automatisch die Team-Statistiken dieses Spiels — Ergebnis, Tore,
Schüsse, Ecken, Freistöße, Fouls, Tacklings, Dribblings, Interceptions und
Paraden, jeweils für das eigene und das gegnerische Team, mit Aufschlüsselung
nach Halbzeit. Niemand muss diese Werte händisch eintragen.

**Why this priority**: Das ist der eigentliche Kern der Anfrage — Daten, die
heute nur in der separaten Veo-App einsehbar sind, direkt in Playerboard
sichtbar zu machen, ohne dass jemand sie abtippt.

**Independent Test**: Für ein Team mit mindestens einem von Veo bereits
ausgewerteten Spiel erscheinen nach dem nächsten automatischen Sync-Lauf
Ergebnis und alle Statistik-Kategorien für dieses Spiel auf der
entsprechenden Seite in Playerboard.

**Acceptance Scenarios**:

1. **Given** ein Spiel wurde mit der Veo-Kamera aufgezeichnet und die
   Veo-Auswertung ist abgeschlossen, **When** der nächste automatische
   Sync-Lauf läuft, **Then** erscheinen Ergebnis und alle Statistik-Kategorien
   dieses Spiels (eigenes Team vs. Gegner, je Halbzeit) in Playerboard.
2. **Given** ein Spiel ist in Veo aufgezeichnet, aber die Auswertung dort noch
   nicht abgeschlossen, **When** der Sync-Lauf läuft, **Then** wird dieses
   Spiel ohne Statistik-Daten übersprungen (kein Fehlerzustand, kein Absturz)
   und beim nächsten Lauf erneut geprüft.
3. **Given** ein Spiel wurde bereits einmal synchronisiert, **When** der
   Sync-Lauf erneut läuft, **Then** entstehen keine doppelten Einträge für
   dasselbe Spiel.

---

### User Story 2 - Saison-Übersicht der Team-Statistiken ansehen (Priority: P2)

Ein Mitglied öffnet eine Team-Übersichtsseite und sieht dort die über alle
synchronisierten Spiele der Saison aggregierten Werte — u. a. Sieg-Niederlage-
Unentschieden-Bilanz und Summen der Statistik-Kategorien aus User Story 1.

**Why this priority**: Der ursprüngliche Wunsch war explizit eine
Team-Stats-Übersicht wie im Veo Analytics Studio, nicht nur Einzelspiel-Daten
— setzt aber User Story 1 als Datengrundlage voraus.

**Independent Test**: Nach dem Sync mehrerer Spiele eines Teams zeigt die
Team-Übersichtsseite plausible Summen/Bilanzen über genau diese Spiele.

**Acceptance Scenarios**:

1. **Given** mehrere Spiele eines Teams wurden synchronisiert, **When** die
   Team-Übersichtsseite geöffnet wird, **Then** zeigt sie Sieg/Unentschieden/
   Niederlage-Bilanz und Summen je Statistik-Kategorie über genau diese
   Spiele.
2. **Given** ein neues Spiel wird synchronisiert, **When** die
   Team-Übersichtsseite erneut geöffnet wird, **Then** sind die aggregierten
   Werte um dieses Spiel aktualisiert.

---

### User Story 3 - Sync-Status ist für alle Mitglieder nachvollziehbar (Priority: P3)

Ein Mitglied (Trainer oder Spieler-Account) sieht, wann die Veo-Daten zuletzt
erfolgreich aktualisiert wurden, und erhält einen sichtbaren Hinweis, wenn
die automatische Aktualisierung fehlschlägt oder seit längerem nicht mehr
gelaufen ist. Der Status ist für alle Team-Mitglieder sichtbar, nicht nur für
Trainer — er enthält keine sensiblen Informationen.

**Why this priority**: Der Sync hängt an einem Zugang, der jederzeit ungültig
werden kann (z. B. wenn die Vereins-Session bei Veo abläuft). Ohne
Sichtbarkeit merkt niemand, dass die angezeigten Daten seit Wochen veraltet
sind.

**Independent Test**: Wird ein fehlgeschlagener Sync-Lauf simuliert, zeigt die
App jedem Team-Mitglied einen sichtbaren Hinweis auf den fehlgeschlagenen
bzw. veralteten Sync, ohne falsche oder widersprüchliche Daten anzuzeigen.

**Acceptance Scenarios**:

1. **Given** der letzte Sync-Lauf war erfolgreich, **When** ein Mitglied die
   entsprechende Ansicht öffnet, **Then** sieht es den Zeitpunkt des letzten
   erfolgreichen Syncs.
2. **Given** mehrere Sync-Läufe in Folge sind fehlgeschlagen, **When** ein
   Mitglied die entsprechende Ansicht öffnet, **Then** sieht es einen klaren
   Hinweis, dass die Aktualisierung nicht mehr funktioniert.

---

### User Story 4 - Trainer verknüpft sein Team selbst mit Veo (Priority: P1)

*(Ersetzt seit 2026-09-22 die ursprüngliche, Platform-Admin-gebundene Fassung
dieser User Story — siehe Clarifications.)*

Ein Trainer öffnet die Veo-Einstellungsseite seines Teams, gibt seine
Veo-E-Mail-Adresse und sein Veo-Passwort ein, wählt aus seinen tatsächlichen
Veo-Clubs/-Teams das passende aus und bestätigt. Ab diesem Moment ist genau
dieses Playerboard-Team für den Veo-Sync freigeschaltet und dem gewählten
Veo-Team zugeordnet. Kein Platform-Admin, kein Deployment-Operator und keine
manuelle Datenbank-Aktion sind dafür nötig. Ein Trainer mit mehreren
Playerboard-Teams wiederholt den Vorgang für jedes Team einzeln.

**Why this priority**: User Story 1-3 setzen voraus, dass ein Team überhaupt
Veo-Daten sehen darf — ohne diesen Selbstbedienungs-Weg bleibt das Feature für
echte Trainer unbenutzbar. Gleichzeitig bleibt die Kernanforderung aus der
Vorgängerfassung erhalten: kein Team bekommt automatisch oder versehentlich
Zugriff — die Freischaltung erfordert weiterhin eine explizite,
authentifizierte Aktion, nur jetzt durch den Trainer selbst statt durch einen
Platform-Admin.

**Independent Test**: Ein Trainer durchläuft den Verknüpfungs-Dialog für sein
Team mit echten Veo-Zugangsdaten; danach zeigt `/t/[slug]/analytics` Daten für
das gewählte Veo-Team. Ein anderes Team, dessen Trainer den Dialog nie
durchlaufen hat, sieht weiterhin nichts.

**Acceptance Scenarios**:

1. **Given** ein Trainer ist bei seinem Team angemeldet, **When** er im
   Verknüpfungs-Dialog gültige Veo-Zugangsdaten eingibt, **Then** zeigt das
   System die tatsächlichen Clubs/Teams seines Veo-Accounts zur Auswahl.
2. **Given** der Trainer hat ein Veo-Team aus der Liste ausgewählt und
   bestätigt, **When** der nächste Sync-Lauf läuft, **Then** kann dieses
   Playerboard-Team ab sofort Veo-Daten für das gewählte Veo-Team sehen.
3. **Given** für ein Team wurde der Verknüpfungs-Dialog nie durchlaufen,
   **When** ein Mitglied dieses Teams die Analytics-Seite öffnet, **Then**
   sieht es keine Veo-Daten.
4. **Given** ein Trainer gibt falsche Veo-Zugangsdaten ein, **When** der Login
   fehlschlägt, **Then** zeigt das System einen klaren Fehlerhinweis und
   speichert nichts.
5. **Given** ein Trainer verwaltet mehrere Playerboard-Teams, **When** er den
   Dialog für Team A durchläuft, **Then** bleibt Team B unverändert — die
   Verknüpfung gilt immer nur für das Team, von dessen Einstellungsseite aus
   der Trainer den Vorgang gestartet hat.

---

### Edge Cases

- Ein Spiel, das bereits synchronisiert wurde, wird in Veo nachträglich
  gelöscht oder auf privat gestellt: Playerboard zeigt die zuletzt
  synchronisierten Daten dauerhaft weiter an; es gibt keinen aktiven
  Abgleich, der Spiele wieder entfernt, die in Veo verschwunden sind.
- Ein Team wurde nicht für Veo freigeschaltet (der Trainer hat den
  Verknüpfungs-Dialog nie durchlaufen): Playerboard zeigt für dieses Team
  keine Veo-Daten und keinen Sync-Status an, nicht die Daten eines anderen
  Teams.
- Der Veo-Zugang des Trainers läuft ab (z. B. Session ungültig): Sync-Läufe
  schlagen fehl, bestehende Daten bleiben unverändert sichtbar, der Hinweis
  aus User Story 3 macht den Zustand sichtbar; der Trainer durchläuft den
  Verknüpfungs-Dialog erneut, um die Session zu erneuern.
- Ein Spiel hat in Veo keine oder nur unvollständige Statistik-Kategorien
  (z. B. weil die KI-Auswertung bestimmte Ereignisse nicht erkannt hat):
  Playerboard zeigt genau die Kategorien, die Veo liefert, keine
  erfundenen/geschätzten Werte für fehlende Kategorien.
- Zwei Sync-Läufe überlappen sich zeitlich: Es darf nicht zu doppelten oder
  widersprüchlichen Einträgen für dasselbe Spiel kommen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatisch Ergebnis und Team-Statistiken für
  Spiele aus dem Veo-Account des Vereins übernehmen, sobald deren
  Veo-Auswertung abgeschlossen ist — ohne manuelle Dateneingabe durch
  Trainer oder Spieler.
- **FR-002**: System MUST pro Spiel mindestens folgende Statistik-Kategorien
  anzeigen, jeweils für eigenes Team und Gegner getrennt: Tore, Schüsse,
  Ecken, Freistöße, Fouls, Tacklings, Dribblings, Interceptions, Paraden.
- **FR-003**: System MUST diese Statistiken zusätzlich pro Halbzeit
  aufschlüsseln, sofern Veo diese Aufschlüsselung liefert.
- **FR-004**: System MUST die synchronisierten Einzelspiel-Statistiken zu
  einer Saison-Übersicht pro Team aggregieren (u. a. Sieg/Unentschieden/
  Niederlage-Bilanz, Summen je Kategorie).
- **FR-005**: System MUST beim ersten Sync die komplette bisher in Veo
  vorhandene Spielhistorie des zugeordneten Teams importieren, nicht nur
  neue Spiele ab Aktivierung.
- **FR-006**: System MUST neue oder aktualisierte Spiele mindestens einmal
  täglich automatisch synchronisieren, ohne dass ein Mensch den Sync manuell
  anstoßen muss.
- **FR-007**: System MUST ein Spiel, dessen Veo-Auswertung noch nicht
  abgeschlossen ist, beim Sync überspringen und beim nächsten Lauf erneut
  prüfen, statt einen Fehler auszulösen.
- **FR-008**: System MUST verhindern, dass ein bereits synchronisiertes Spiel
  bei erneutem oder überlappendem Sync doppelt oder widersprüchlich
  gespeichert wird.
- **FR-009**: System MUST für alle Team-Mitglieder (Trainer und Spieler)
  sichtbar machen, wann der letzte erfolgreiche Sync stattgefunden hat, und
  MUST erkennbar machen, wenn mehrere Sync-Läufe in Folge fehlgeschlagen
  sind.
- **FR-010**: System MUST das Ergebnis des Veo-Logins (das Session-Cookie) so
  speichern, dass es ausschließlich dem automatischen Sync zur Verfügung
  steht — niemals für irgendeinen authentifizierten Client, auch nicht den
  Trainer selbst, auslesbar. Das Veo-Passwort selbst MUST System nie
  persistieren oder loggen; es MUST nur für die Dauer des einmaligen
  Login-Vorgangs im Arbeitsspeicher gehalten werden.
- **FR-011**: System MUST es dem Trainer eines Teams ermöglichen, sein Team
  selbst für Veo-Sync freizuschalten: Login mit eigenen Veo-Zugangsdaten,
  Auswahl aus den tatsächlichen Clubs/Teams seines Veo-Accounts, Speicherung
  der Zuordnung für genau das Playerboard-Team, von dem aus der Vorgang
  gestartet wurde. Keine Platform-Admin- oder Deployment-Operator-Aktion MUST
  dafür nötig sein. Ein Team MUST erst nach einer erfolgreich abgeschlossenen
  Verknüpfung Veo-Daten synchronisieren oder anzeigen können; ohne
  abgeschlossene Verknüpfung darf ein Team keinerlei Veo-Daten sehen.
- **FR-012**: Spieler-individuelle Statistiken (pro Person statt pro Team)
  sind expliziter Nicht-Teil dieses Features.
- **FR-013**: *(entfällt seit 2026-09-22 — es gibt keine Platform-Admin-Rolle
  mehr, gegen die die Veo-Team-Zuordnung geprüft werden müsste; FR-011 regelt
  die Berechtigung jetzt direkt als "Trainer des betroffenen Teams".)*

### Key Entities

- **Team-Zuordnung**: Verknüpft ein Playerboard-Team mit dem entsprechenden
  Team im Veo-Account des Trainers (Club-/Team-Kürzel); vom Trainer des
  betroffenen Teams selbst über den Verknüpfungs-Dialog angelegt oder
  geändert. Grundlage dafür, ob und welche Spiele für ein Team synchronisiert
  und gelesen werden — ohne abgeschlossene Verknüpfung kein Zugriff.
- **Spiel (Match)**: Ein einzelnes, von Veo aufgezeichnetes und ausgewertetes
  Spiel mit Ergebnis, Datum/Gegner und den zugehörigen Statistik-Kategorien
  für eigenes Team und Gegner.
- **Statistik-Kategorie**: Ein einzelner Wert (z. B. "Ecken") für ein Spiel,
  eine Halbzeit und eine Mannschaftszuordnung (eigenes Team/Gegner).
- **Sync-Status**: Zeitpunkt und Ergebnis (erfolgreich/fehlgeschlagen) des
  letzten und der jüngsten automatischen Aktualisierungsläufe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Für jedes Spiel, dessen Veo-Auswertung abgeschlossen ist,
  erscheinen Ergebnis und alle verfügbaren Statistik-Kategorien spätestens
  24 Stunden später in Playerboard, ohne dass jemand Daten eintippt.
- **SC-002**: Eine Team-Übersichtsseite zeigt zu jedem Zeitpunkt eine
  Saison-Bilanz, die exakt der Summe der bis dahin synchronisierten Spiele
  entspricht (0 Abweichungen bei stichprobenhafter Nachrechnung).
- **SC-003**: Bricht die automatische Aktualisierung ab (z. B. abgelaufener
  Veo-Zugang), wird das spätestens nach einem Tag für jedes Mitglied des
  betroffenen Teams sichtbar, ohne dass zuvor unbemerkt veraltete oder
  falsche Daten als aktuell ausgegeben werden.
- **SC-004**: Kein Spiel erscheint nach wiederholten Sync-Läufen doppelt oder
  mit widersprüchlichen Werten in der Übersicht.

## Assumptions

- Trainer haben einen eigenen, aktiven Veo-Account mit mindestens einem Team,
  dessen Spiele mit aktivierter Analyse aufgezeichnet werden.
- Ein Trainer kann mehrere Playerboard-Teams und mehrere Veo-Teams verwalten;
  das System schränkt die Anzahl möglicher Zuordnungen nicht künstlich ein —
  der Verknüpfungs-Dialog wird pro Playerboard-Team einzeln durchlaufen.
- Täglicher Sync ist ausreichend zeitnah; ein Bedarf an Beinahe-Echtzeit-
  Updates direkt nach Spielende besteht nicht.
- Das erneute Herstellen des Veo-Zugangs, falls dieser abläuft oder ungültig
  wird, ist ein manueller, seltener administrativer Schritt außerhalb der
  normalen Nutzung durch Trainer/Spieler.
- Welche konkreten Statistik-Kategorien tatsächlich pro Spiel angezeigt
  werden, richtet sich danach, was Veo für dieses Spiel liefert; fehlen
  einzelne Kategorien bei Veo, fehlen sie auch in Playerboard, statt
  geschätzt zu werden.
