# Feature Specification: Veo-Spieler-Statistiken

**Feature Branch**: `013-veo-player-analytics`
**Spec Directory**: `004-veo-player-analytics`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Was ich dann noch brauche, ist die Datenpräsentation der Spieler im Playerboard Dashboard. Die Veo-Seite hält ja für jedes Spiel die Daten pro Spieler vor. Wie weit ein Spieler gelaufen ist, wie viele Sprints er hatte, Torabschlüsse etc. All das hätte ich gerne in unserer DB übernommen und dann auf dem Dashboard angezeigt."

**Vorgängerfeature**: Baut auf [003-veo-analytics](../003-veo-analytics/spec.md) auf (Sync-Mechanismus, Team-Zuordnung, Veo-Zugangsdaten, `veo_matches`) und hebt dessen FR-012 ("Spieler-individuelle Statistiken sind expliziter Nicht-Teil dieses Features") für den hier beschriebenen Umfang auf.

## Clarifications

### Session 2026-09-22

- Q: Veo liefert für dieses Team aktuell keine Spielernamen (nur Trikotnummern), da die Aufstellung in Veo nicht gepflegt ist — wie damit umgehen? → A: Trikotnummer direkt gegen `players.jersey_number` desselben Playerboard-Teams matchen, kein manuelles Nachpflegen in Veo verlangen.
- Q: Wo sollen die Spieler-Statistiken angezeigt werden? → A: Kumulierte Saison-Übersicht pro Spieler auf dem Team-Dashboard; Aufschlüsselung pro einzelnem Spiel auf der bestehenden Veo-Analytics-Seite.
- Q: Welche der von Veo gelieferten Werte übernehmen? → A: Kuratierte Auswahl (zurückgelegte Distanz, Sprints, Höchst-/Durchschnittsgeschwindigkeit, hochintensive Läufe, Spielminuten, Torschüsse, Tore, Torbeteiligungen), nicht alle rohen Veo-Felder.
- Q: Komplette Historie rückwirkend importieren oder nur neue Spiele? → A: Komplette Historie, wie beim Team-Feature (FR-005 in 003-veo-analytics).
- Q: Wer darf die Spieler-Statistiken sehen? → A: Alle Team-Mitglieder (Trainer und Spieler) sehen alle Spieler des Teams — bewusste Entscheidung trotz Hinweis auf die Sensibilität personenbezogener Leistungsdaten von größtenteils minderjährigen Spielern.

### Session 2026-09-23

- Q: Ein Spieler kann in einem Spiel ausnahmsweise eine andere Trikotnummer als gewöhnlich tragen, wodurch die automatische Zuordnung fehlt oder falsch ist — wie damit umgehen? → A: Trainer können die Trikotnummer-Zuordnung pro Spiel manuell setzen oder korrigieren. Dafür werden die von Veo pro Trikotnummer gelieferten Rohstatistiken intern vorgehalten, auch ohne automatische Zuordnung — angezeigt werden sie aber weiterhin nur, wenn eine Zuordnung (automatisch oder manuell) besteht. Eine manuelle Zuordnung wird dauerhaft gespeichert und von künftigen automatischen Sync-Läufen nicht überschrieben.
- Q: Der Abruf der Spieler-Statistiken für ein Spiel schlägt fehl, während der Abruf der Team-Statistiken für dasselbe Spiel erfolgreich war — wird das Spiel trotzdem gespeichert (nur ohne Spieler-Daten) oder gar nicht? → A: Das gesamte Spiel (inkl. Team-Statistiken) wird für diesen Sync-Lauf nicht gespeichert — derselbe Fail-Closed-Ansatz wie bei einer unvollständigen Veo-Auswertung (003-veo-analytics FR-007). Der nächste automatische Sync versucht das gesamte Spiel erneut.
- Q: Kann ein Trainer denselben Kader-Spieler versehentlich zwei verschiedenen Trikotnummern im selben Spiel zuordnen? → A: Nein — pro Spiel darf jeder Kader-Spieler genau eine Trikotnummer haben. Weist ein Trainer einen Spieler einer neuen Trikotnummer zu, wird eine bestehende Zuordnung desselben Spielers zu einer anderen Trikotnummer im selben Spiel automatisch aufgehoben.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saison-Übersicht pro Spieler ansehen (Priority: P1)

Ein Mitglied (Trainer oder Spieler-Account) öffnet das Team-Dashboard und sieht dort für jeden Spieler des Kaders die über die Saison aufsummierten Werte: zurückgelegte Distanz, Anzahl Sprints, hochintensive Läufe, gespielte Minuten, Torschüsse, Tore und Torbeteiligungen — automatisch aus den Veo-Aufzeichnungen übernommen, ohne dass jemand Werte einträgt.

**Why this priority**: Das ist der eigentliche Kern der Anfrage — individuelle Leistungsdaten, die heute nur verstreut pro Einzelspiel in der separaten Veo-App einsehbar sind, gebündelt und auf einen Blick im Playerboard-Dashboard sichtbar zu machen.

**Independent Test**: Für ein Team mit mehreren synchronisierten, von Veo ausgewerteten Spielen zeigt das Dashboard pro im Kader geführtem Spieler eine Summe der kuratierten Kennzahlen über genau diese Spiele.

**Acceptance Scenarios**:

1. **Given** mehrere Spiele eines Teams wurden mit Spieler-Statistiken synchronisiert, **When** ein Mitglied das Team-Dashboard öffnet, **Then** sieht es pro Spieler die aufsummierten Werte der kuratierten Kennzahlen über alle synchronisierten Spiele.
2. **Given** ein neues Spiel wird synchronisiert, **When** das Dashboard erneut geöffnet wird, **Then** sind die aufsummierten Werte um dieses Spiel aktualisiert.
3. **Given** ein Spieler im Kader hat in keinem synchronisierten Spiel eine passende Trikotnummer-Zuordnung, **When** das Dashboard geöffnet wird, **Then** zeigt es für diesen Spieler keine erfundenen Werte, sondern erkennbar keine Daten.

---

### User Story 2 - Spieler-Statistiken eines einzelnen Spiels ansehen (Priority: P2)

Ein Mitglied öffnet die bestehende Veo-Analytics-Seite und sieht dort zusätzlich zu den bereits vorhandenen Team-Statistiken pro Spiel auch die Statistiken der einzelnen Spieler dieses Spiels.

**Why this priority**: Baut auf User Story 1 als Datengrundlage auf; die Saison-Übersicht ist der primäre Anwendungsfall, die Einzelspiel-Aufschlüsselung ist die Detailansicht dazu.

**Independent Test**: Für ein synchronisiertes Spiel mit Spieler-Statistiken zeigt die entsprechende Spielkarte auf der Analytics-Seite die kuratierten Kennzahlen pro Spieler, der in diesem Spiel eine zuordenbare Trikotnummer hatte.

**Acceptance Scenarios**:

1. **Given** ein Spiel wurde mit Spieler-Statistiken synchronisiert, **When** ein Mitglied die Analytics-Seite öffnet, **Then** sieht es zusätzlich zu den Team-Statistiken dieses Spiels eine Liste der beteiligten Spieler mit ihren kuratierten Kennzahlen für genau dieses Spiel.
2. **Given** ein Spiel wurde synchronisiert, aber für eine bestimmte Trikotnummer gibt es keinen passenden Kader-Spieler, **When** die Spielkarte angezeigt wird, **Then** taucht diese Trikotnummer nicht als Zeile auf (keine geratene Zuordnung), die übrigen zuordenbaren Spieler werden trotzdem angezeigt.

---

### User Story 3 - Trikotnummer-Zuordnung für ein Spiel korrigieren (Priority: P3)

Ein Trainer öffnet ein synchronisiertes Spiel auf der Veo-Analytics-Seite und sieht dort auch Trikotnummern, für die die automatische Zuordnung fehlt oder falsch ist (z. B. weil ein Spieler in diesem Spiel ausnahmsweise eine andere Nummer trug). Der Trainer wählt für eine Trikotnummer den passenden Kader-Spieler aus oder korrigiert eine bestehende, falsche Zuordnung.

**Why this priority**: Ergänzt User Story 1+2 um die Fehlerkorrektur für den Fall, dass die automatische Zuordnung (FR-002) im Einzelfall nicht stimmt — wichtig für Datenqualität, aber seltener als die Kernanzeige.

**Independent Test**: Für ein Spiel mit einer nicht zuordenbaren oder falsch zugeordneten Trikotnummer kann ein Trainer eine Zuordnung setzen/ändern; die Statistiken dieser Trikotnummer erscheinen danach unter dem gewählten Spieler in Saison-Übersicht und Spielansicht, und bleiben auch nach dem nächsten automatischen Sync bestehen.

**Acceptance Scenarios**:

1. **Given** ein Spiel enthält eine Trikotnummer ohne passenden Kader-Spieler, **When** ein Trainer dieser Trikotnummer einen Kader-Spieler zuweist, **Then** erscheinen die Statistiken dieser Trikotnummer für dieses Spiel künftig unter dem gewählten Spieler.
2. **Given** eine Trikotnummer wurde automatisch einem falschen Kader-Spieler zugeordnet, **When** ein Trainer die Zuordnung auf den richtigen Spieler ändert, **Then** wird die neue Zuordnung übernommen und angezeigt.
3. **Given** ein Trainer hat eine Zuordnung für ein Spiel manuell gesetzt, **When** der nächste automatische Sync läuft, **Then** bleibt die manuelle Zuordnung unverändert bestehen (kein Überschreiben durch die automatische Trikotnummer-Zuordnung).
4. **Given** ein Spieler-Account (kein Trainer) öffnet dasselbe Spiel, **When** er die Seite betrachtet, **Then** hat er keine Möglichkeit, Zuordnungen zu ändern (nur Trainer dürfen korrigieren).
5. **Given** ein Kader-Spieler ist im selben Spiel bereits einer Trikotnummer zugeordnet, **When** ein Trainer denselben Spieler einer anderen Trikotnummer in diesem Spiel zuweist, **Then** wird die vorherige Zuordnung dieses Spielers automatisch aufgehoben, sodass der Spieler in diesem Spiel stets höchstens eine Trikotnummer hat.

---

### Edge Cases

- Eine von Veo gelieferte Trikotnummer passt zu keinem aktuell im Kader geführten Spieler (z. B. Probetrainer, falsch erfasste Nummer, noch nicht angelegter Spieler, oder ein Spieler trug in diesem Spiel ausnahmsweise eine andere Nummer als gewöhnlich): Für diese Trikotnummer wird zunächst keine Zuordnung angezeigt — keine geratene Zuordnung. Ein Trainer kann die Zuordnung für dieses Spiel nachträglich manuell setzen (User Story 3).
- Ein Spieler wechselt im Laufe der Saison seine Trikotnummer: Bereits synchronisierte, ältere Spiele bleiben dem damaligen Trägerspieler dieser Nummer zugeordnet (Zuordnung wird pro Spiel zum Sync-Zeitpunkt fest gespeichert, nicht bei jeder Anzeige neu anhand der aktuellen Kaderliste aufgelöst).
- Veo liefert für ein Spiel nur einen Teil der kuratierten Kennzahlen für einen Spieler (z. B. weil die Auswertung bestimmte Ereignisse nicht erkannt hat): Playerboard zeigt genau die Kennzahlen, die Veo für diesen Spieler liefert, keine erfundenen/geschätzten Werte für fehlende Kennzahlen — analog zur bestehenden Regel bei Team-Statistiken (003-veo-analytics).
- Ein Team wurde nicht für Veo freigeschaltet oder synchronisiert (siehe 003-veo-analytics): Es gibt auch keine Spieler-Statistiken für dieses Team.
- Mehrere Kader-Spieler tragen (fehlerhaft) dieselbe Trikotnummer gleichzeitig: Die Zuordnung ist in diesem Fall nicht eindeutig; welcher der beiden Spieler die Veo-Daten erhält, ist nicht deterministisch garantiert — dies ist eine bestehende Dateninkonsistenz im Kader, keine Aufgabe dieses Features, sie aufzulösen.
- Der Abruf der Spieler-Statistiken für ein Spiel schlägt fehl (z. B. Netzwerkfehler, unerwartete Veo-Antwort), während der Abruf der Team-Statistiken für dasselbe Spiel erfolgreich war: Das gesamte Spiel wird für diesen Sync-Lauf nicht gespeichert, auch nicht teilweise mit den Team-Statistiken — der nächste automatische Sync versucht das gesamte Spiel erneut (analog zur bestehenden Regel für unvollständige Veo-Auswertungen, 003-veo-analytics FR-007).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST für jeden Spieler, dessen Veo-Trikotnummer einem Kader-Spieler desselben Teams zugeordnet werden kann, automatisch folgende Kennzahlen pro Spiel aus dem Veo-Account des Vereins übernehmen: zurückgelegte Distanz, Anzahl Sprints, Höchstgeschwindigkeit, Durchschnittsgeschwindigkeit, hochintensive Läufe, gespielte Zeit, Torschüsse, Tore, Torbeteiligungen.
- **FR-002**: System MUST die von Veo gelieferte Trikotnummer beim Sync automatisch gegen `jersey_number` der aktiven Kader-Spieler desselben Playerboard-Teams matchen. Ohne passende Trikotnummer im aktiven Kader MUST für diese Trikotnummer in diesem Spiel keine geratene Zuordnung entstehen und keine Statistik angezeigt werden (kein Fehlerzustand) — siehe FR-011 zur weiteren Behandlung.
- **FR-003**: System MUST die Trikotnummer-zu-Spieler-Zuordnung pro Spiel zum Zeitpunkt des jeweiligen Sync-Laufs auflösen und dauerhaft speichern, nicht bei jeder Anzeige erneut anhand der zu diesem Zeitpunkt aktuellen Kaderliste ableiten — eine spätere Trikotnummern-Änderung im Kader darf bereits synchronisierte, ältere Spiele nicht rückwirkend falsch zuordnen.
- **FR-004**: System MUST eine kumulierte Saison-Übersicht pro Spieler (Summen der kuratierten Kennzahlen über alle synchronisierten Spiele) auf dem Team-Dashboard anzeigen.
- **FR-005**: System MUST eine Aufschlüsselung der kuratierten Kennzahlen pro Spieler und pro einzelnem Spiel auf der bestehenden Veo-Analytics-Seite anzeigen, zusätzlich zu den dort bereits vorhandenen Team-Statistiken.
- **FR-006**: System MUST beim ersten Sync dieses Features die komplette bisher in Veo vorhandene Spielhistorie des zugeordneten Teams für Spieler-Statistiken importieren, nicht nur neue Spiele ab Aktivierung (analog zu FR-005 in 003-veo-analytics).
- **FR-007**: System MUST die Spieler-Statistiken für alle Mitglieder des Teams (Trainer und Spieler-Accounts) sichtbar machen, nicht nur für Trainer.
- **FR-008**: System MUST nur die in FR-001 genannten kuratierten Kennzahlen übernehmen und anzeigen, nicht sämtliche von Veo gelieferten Rohfelder.
- **FR-009**: System MUST verhindern, dass für dasselbe Spiel und denselben Spieler bei erneutem oder überlappendem Sync doppelte oder widersprüchliche Datensätze entstehen (analog zu FR-008 in 003-veo-analytics).
- **FR-010**: System MUST die Voraussetzungen aus 003-veo-analytics (aktivierte Team-Zuordnung, gültiger Veo-Zugang) unverändert weiter voraussetzen — dieses Feature führt keine eigene, separate Freischaltung oder Zugangsverwaltung ein.
- **FR-011**: System MUST die von Veo pro Trikotnummer gelieferten kuratierten Rohstatistiken eines Spiels intern vorhalten, auch wenn beim Sync keine automatische Zuordnung zu einem Kader-Spieler möglich war, damit ein Trainer sie nachträglich zuordnen kann (User Story 3). Ohne Zuordnung bleiben diese Statistiken für reguläre Mitglieder unsichtbar (FR-002); in der Trikotnummer-Zuordnung (User Story 3) zeigt das System sie dem Trainer trotzdem an — als Hinweis auf eine noch fehlende Zuordnung, nie mit einem geratenen Spielernamen (SC-004).
- **FR-012**: System MUST es einem Trainer ermöglichen, für ein bereits synchronisiertes Spiel die Zuordnung einer Trikotnummer zu einem Kader-Spieler manuell zu setzen oder zu ändern.
- **FR-013**: System MUST eine manuell gesetzte Trikotnummer-Zuordnung dauerhaft beibehalten und darf sie bei einem späteren automatischen Sync-Lauf nicht durch die automatische Zuordnung überschreiben.
- **FR-014**: System MUST verhindern, dass Nicht-Trainer (Spieler-Accounts) Trikotnummer-Zuordnungen ändern können — nur Trainer des Teams dürfen korrigieren.
- **FR-015**: System MUST einen fehlgeschlagenen Abruf der Spieler-Statistiken für ein Spiel wie einen fehlgeschlagenen Sync dieses gesamten Spiels behandeln: Weder das Spiel noch dessen Team-Statistiken werden für diesen Sync-Lauf gespeichert; der nächste automatische Sync versucht das gesamte Spiel erneut (analog zu FR-007 in 003-veo-analytics).
- **FR-016**: System MUST sicherstellen, dass ein Kader-Spieler innerhalb eines Spiels höchstens einer Trikotnummer zugeordnet ist. Weist ein Trainer einen Spieler einer neuen Trikotnummer in einem Spiel zu, in dem dieser Spieler bereits einer anderen Trikotnummer zugeordnet ist, MUST die vorherige Zuordnung automatisch aufgehoben werden.

### Key Entities

- **Spieler-Statistik**: Ein einzelner kuratierter Kennzahlwert für ein Spiel, eine Trikotnummer und eine Kategorie (z. B. "Distanz" für Trikotnummer 7 in Spiel Y). Wird unabhängig davon gespeichert, ob bereits eine Zuordnung zu einem Kader-Spieler besteht; regulären Mitgliedern wird sie nur mit bestehender Zuordnung angezeigt, dem Trainer auch ohne Zuordnung in der Trikotnummer-Zuordnung (User Story 3).
- **Saison-Übersicht pro Spieler**: Die über alle synchronisierten Spiele aufsummierten, einem Kader-Spieler zugeordneten Spieler-Statistiken.
- **Trikotnummer-Zuordnung**: Die pro Spiel gespeicherte Verknüpfung zwischen einer von Veo gelieferten Trikotnummer und einem Kader-Spieler desselben Teams — entweder automatisch beim Sync aufgelöst, oder von einem Trainer manuell gesetzt/korrigiert (User Story 3). Eine manuelle Zuordnung hat Vorrang vor der automatischen und wird von künftigen Sync-Läufen nicht verändert. Pro Spiel ist ein Kader-Spieler höchstens einer Trikotnummer zugeordnet (FR-016).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Für jedes Spiel, dessen Veo-Auswertung abgeschlossen ist und dessen Spieler-Trikotnummern einem Kader-Spieler zugeordnet werden können, erscheinen die kuratierten Kennzahlen dieses Spielers spätestens 24 Stunden später auf dem Team-Dashboard und der Analytics-Seite, ohne dass jemand Daten einträgt.
- **SC-002**: Die Saison-Übersicht pro Spieler auf dem Dashboard entspricht zu jedem Zeitpunkt exakt der Summe der bis dahin synchronisierten Einzelspiel-Werte dieses Spielers (0 Abweichungen bei stichprobenhafter Nachrechnung).
- **SC-003**: Kein Spieler-Datensatz erscheint nach wiederholten Sync-Läufen doppelt oder mit widersprüchlichen Werten.
- **SC-004**: Für Trikotnummern ohne zuordenbaren Kader-Spieler erscheint niemals ein erfundener oder geratener Spielername in der Anzeige.
- **SC-005**: Für ein Spiel, bei dem ein Trainer eine Trikotnummer-Zuordnung manuell gesetzt oder korrigiert hat, zeigen Saison-Übersicht und Spielansicht danach durchgehend genau diese Zuordnung — auch nach beliebig vielen weiteren automatischen Sync-Läufen.

## Assumptions

- Das zugrundeliegende Team ist bereits per 003-veo-analytics für Veo-Sync freigeschaltet und hat gültige Veo-Zugangsdaten; dieses Feature ändert daran nichts.
- Kader-Spieler in Playerboard haben eine gepflegte, im jeweiligen Spielzeitraum korrekte Trikotnummer (`players.jersey_number`); Datenqualität des Kaders selbst ist nicht Teil dieses Features.
- Veo liefert für dieses Team aktuell keine Spielernamen (nur Trikotnummern), da die Aufstellung im Veo-eigenen Interface nicht gepflegt ist; sollte sich das künftig ändern, ist die Trikotnummer-Zuordnung weiterhin die primäre Verknüpfung, ein Namensabgleich ist nicht Teil dieses Features.
- Die Sichtbarkeit aller Spieler-Statistiken für alle Team-Mitglieder ist eine bewusste Entscheidung des Vereins/Anforderers, keine technische Notwendigkeit.
