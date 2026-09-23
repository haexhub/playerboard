# Feature Specification: Öffentliches Team-Dashboard (Trainingsbewertungen & Veo-Stats)

**Feature Branch**: `014-public-veo-ranking`
**Spec Directory**: `005-public-veo-ranking`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "ich brauche noch die möglichkeit, dass die rankings der teams public verfügbar sind. allerdings dürfen diese public views KEINE persönlichen daten enthalten und nur die Trikotnummern sichtbar sein. KEINE NAMEN" — konkretisiert zu: "ich möchte die dashboard seite public sichtbar machen. auf der dashboard seite soll es einen tab für die training bewertungen geben und ein tab für die veo stats"

**Vorgängerfeatures**: Baut auf [001-points-and-photos](../001-points-and-photos/spec.md) (bestehende öffentliche, teamspezifische Rangliste, FR-060..064) und [004-veo-player-analytics](../004-veo-player-analytics/spec.md) (Saison-Übersicht pro Spieler, aktuell nur für eingeloggte Team-Mitglieder spezifiziert, dort noch nicht implementiert) auf.

## Clarifications

### Session 2026-09-23

- Q: Der Veo-Stats-Tab soll Saison-Summen zeigen, aber 004 selbst begrenzt die Summe nicht auf die aktuelle Saison (`team_settings.season_start`), sondern auf "alle synchronisierten Spiele" (potenziell mehrjährige Historie durch den vollständigen Erst-Import). Worauf soll sich die öffentliche Veo-Saison-Summe beziehen? → A: Aktuelle Saison (`season_start` bis heute) — dasselbe Saison-Konzept wie die Trainingsbewertungen-Rangliste.
- Q: Soll dieselbe `is_veo_enabled`-Freischaltung (die heute nur die teaminterne Sichtbarkeit steuert) automatisch auch die öffentliche Veröffentlichung der Veo-Stats auslösen, oder braucht es einen separaten, expliziten Schalter? → A: Separater, expliziter Public-Schalter — ein Trainer muss die öffentliche Sichtbarkeit der Veo-Stats zusätzlich zur internen Veo-Freischaltung explizit aktivieren; Standardwert ist deaktiviert.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Öffentliche Sichtbarkeit der Veo-Stats aktivieren (Priority: P1)

Ein Trainer öffnet die Team-Einstellungen und aktiviert dort explizit die öffentliche Sichtbarkeit der Veo-Saison-Statistiken für sein Team — getrennt von der bestehenden internen Veo-Freischaltung (003-veo-analytics) und standardmäßig deaktiviert. Erst nach dieser expliziten Aktivierung kann der öffentliche Veo-Stats-Tab (User Story 2) für dieses Team überhaupt Daten zeigen.

**Why this priority**: Veo-Leistungsdaten sind laut 004 bewusst als sensibel eingestuft (überwiegend minderjährige Spieler). Ohne diesen expliziten, separaten Schalter würde jedes bereits intern Veo-freigeschaltete Team automatisch und ohne eigenes Zutun öffentlich sichtbare Daten bekommen — das ist der zentrale Datenschutz-Gate dieses Features und MUSS vor jeder öffentlichen Anzeige stehen.

**Independent Test**: Für ein Veo-freigeschaltetes Team mit synchronisierten Spieler-Statistiken bleibt der öffentliche Veo-Stats-Tab ohne Daten/nicht vorhanden, bis ein Trainer den Schalter aktiviert; nach Aktivierung erscheinen die Daten, ohne dass sonst etwas geändert wurde. Ein Spieler-Account kann den Schalter nicht ändern.

**Acceptance Scenarios**:

1. **Given** ein Team ist intern für Veo freigeschaltet, die öffentliche Sichtbarkeit ist aber (Standardwert) deaktiviert, **When** ein anonymer Besucher die öffentliche Team-Seite öffnet, **Then** ist kein Veo-Stats-Tab vorhanden.
2. **Given** ein Trainer aktiviert die öffentliche Sichtbarkeit der Veo-Stats, **When** ein anonymer Besucher die öffentliche Team-Seite danach öffnet, **Then** ist der Veo-Stats-Tab vorhanden und zeigt Daten gemäß User Story 2.
3. **Given** ein Trainer deaktiviert eine zuvor aktivierte öffentliche Sichtbarkeit wieder, **When** ein anonymer Besucher die Seite danach öffnet, **Then** ist der Veo-Stats-Tab wieder nicht vorhanden.
4. **Given** ein Spieler-Account (kein Trainer) versucht, die Einstellung zu ändern, **When** die Änderung gesendet wird, **Then** wird sie abgelehnt und die bestehende Einstellung bleibt unverändert.

---

### User Story 2 - Öffentliche Veo-Saison-Statistiken ansehen (Priority: P1)

Ein anonymer Besucher (kein Login) öffnet die öffentliche Team-Seite und wechselt dort zum Tab "Veo-Stats". Sofern das Team für Veo freigeschaltet ist UND ein Trainer die öffentliche Sichtbarkeit der Veo-Stats explizit aktiviert hat (User Story 1), sieht er dort pro Trikotnummer die seit `season_start` der aktuellen Saison aufsummierten kuratierten Veo-Kennzahlen (zurückgelegte Distanz, Sprints, Höchst-/Durchschnittsgeschwindigkeit, hochintensive Läufe, Spielminuten, Torschüsse, Tore, Torbeteiligungen) — ohne Namen, ohne Login.

**Why this priority**: Das ist der eigentliche neue Anforderungskern — Veo-Leistungsdaten, die bisher nur teaminternen, eingeloggten Mitgliedern vorbehalten sind (004), sollen zusätzlich öffentlich einsehbar sein, streng anonymisiert auf Trikotnummer-Ebene, sobald ein Trainer dies aktiviert hat.

**Independent Test**: Für ein Veo-freigeschaltetes Team mit aktivierter öffentlicher Sichtbarkeit und synchronisierten, Spielern zugeordneten Veo-Statistiken zeigt der Veo-Stats-Tab der öffentlichen Seite pro Trikotnummer die korrekten Saison-Summen, ohne dass ein Login stattfindet.

**Acceptance Scenarios**:

1. **Given** ein Team ist für Veo freigeschaltet, hat die öffentliche Sichtbarkeit aktiviert und hat synchronisierte, Trikotnummern zugeordnete Spieler-Statistiken innerhalb der aktuellen Saison, **When** ein anonymer Besucher die öffentliche Team-Seite öffnet und den Tab "Veo-Stats" wählt, **Then** sieht er pro Trikotnummer die seit `season_start` aufsummierten kuratierten Kennzahlen; Spiele vor `season_start` fließen nicht ein.
2. **Given** eine Trikotnummer aus den Veo-Rohdaten hat keine aufgelöste Zuordnung zu einem Kader-Spieler, **When** der Veo-Stats-Tab angezeigt wird, **Then** taucht diese Trikotnummer nicht als Zeile auf.
3. **Given** für eine angezeigte Trikotnummer liefert Veo eine bestimmte Kennzahl nicht, **When** die Zeile dieser Trikotnummer angezeigt wird, **Then** erscheint für diese Kennzahl kein erfundener Wert, sondern erkennbar keine Angabe.

---

### User Story 3 - Öffentliche Trainingsbewertungen weiterhin ansehen (Priority: P2)

Ein anonymer Besucher öffnet dieselbe öffentliche Team-Seite und sieht im Tab "Trainingsbewertungen" die bereits heute öffentlich verfügbare Punkte-Rangliste (Platzierung, Trikotnummer, Kategorie-Summen) — inhaltlich unverändert zur bisherigen alleinstehenden öffentlichen Rangliste, jetzt eingebettet in die neue Tab-Struktur.

**Why this priority**: Stellt sicher, dass die bereits produktive, öffentlich genutzte Funktionalität durch die Einführung der Tabs nicht regressiert. Kein neuer fachlicher Wert, aber Voraussetzung dafür, dass die Umstellung sicher ist.

**Independent Test**: Für ein Team mit bestehenden Punkte-Einträgen zeigt der Tab "Trainingsbewertungen" exakt dieselben Zeilen, Platzierungen und Summen wie die heutige öffentliche Rangliste vor der Tab-Einführung.

**Acceptance Scenarios**:

1. **Given** ein Team hat Punkte-Einträge im gewählten Zeitraum, **When** ein anonymer Besucher die öffentliche Team-Seite öffnet, **Then** ist der Tab "Trainingsbewertungen" standardmäßig aktiv und zeigt die bestehende Rangliste (Platzierung, Trikotnummer, Kategorie-Summen).
2. **Given** ein Besucher befindet sich im Tab "Veo-Stats", **When** er zum Tab "Trainingsbewertungen" wechselt, **Then** sieht er dieselbe Rangliste wie in Szenario 1, inklusive bestehender Zeitraum-Auswahl.

---

### Edge Cases

- Unbekannter/ungültiger Team-Slug: Die Seite verhält sich wie heute (kein Team gefunden), unabhängig vom gewählten Tab.
- Team ist nicht für Veo freigeschaltet (003-veo-analytics): Der Tab "Veo-Stats" wird gar nicht erst angeboten — nur "Trainingsbewertungen" ist sichtbar, kein Fehlerzustand, kein leerer/toter Tab. Die öffentliche Sichtbarkeits-Einstellung aus User Story 1 ist in diesem Fall irrelevant (kein Effekt ohne interne Freischaltung).
- Team ist für Veo freigeschaltet, aber die öffentliche Sichtbarkeit (User Story 1) ist nicht aktiviert (Standardwert): Verhält sich identisch zum vorigen Fall — kein Veo-Tab, kein Fehlerzustand.
- Team ist für Veo freigeschaltet und die öffentliche Sichtbarkeit ist aktiviert, aber es liegen noch keine synchronisierten bzw. zugeordneten Spieler-Statistiken vor: Der Tab "Veo-Stats" ist sichtbar, zeigt aber einen klaren Leer-Zustand ("noch keine Daten"), keine erfundenen Nullwerte.
- Team ist für Veo freigeschaltet, öffentliche Sichtbarkeit aktiviert und hat synchronisierte Spieler-Statistiken, aber ausschließlich aus Spielen vor `season_start` der laufenden Saison (z. B. kurz nach Saisonwechsel): Der Tab "Veo-Stats" ist sichtbar, zeigt aber denselben Leer-Zustand wie oben — Alt-Saison-Daten fließen nicht in die Summe ein.
- Ein Trainer deaktiviert die interne Veo-Freischaltung (003-veo-analytics) komplett, während die öffentliche Sichtbarkeit (User Story 1) noch aktiviert ist: Der Veo-Tab verschwindet trotzdem von der öffentlichen Seite — die interne Freischaltung bleibt Voraussetzung, unabhängig vom Stand des öffentlichen Schalters.
- Ein Spieler hat im Laufe der Saison seine Trikotnummer gewechselt: Trainingsbewertungen und Veo-Stats gruppieren nach `player_id` und zeigen jeweils die aktuelle Trikotnummer aus `players.jersey_number`; historische Trikotnummern pro Spiel werden im öffentlichen Veo-Stats-Tab nicht angezeigt.
- Mehrere Kader-Spieler tragen fehlerhaft dieselbe Trikotnummer: bestehende Dateninkonsistenz, nicht Aufgabe dieses Features (analog 004 Edge Cases).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST unter der bestehenden öffentlichen, teamspezifischen Adresse eine Seite mit zwei wählbaren Tabs anbieten: "Trainingsbewertungen" und "Veo-Stats".
- **FR-002**: Der Tab "Trainingsbewertungen" MUST exakt die Daten zeigen, die die bestehende öffentliche Rangliste (001-points-and-photos) heute liefert (Platzierung, Trikotnummer, Kategorie-Summen, Zeitraum-Auswahl) — keine Änderung an der zugrundeliegenden Berechnung.
- **FR-003**: System MUST eine pro Team separate, von der internen Veo-Freischaltung (`is_veo_enabled`, 003-veo-analytics) unabhängige Einstellung anbieten, die steuert, ob der Veo-Stats-Tab öffentlich sichtbar ist. Diese Einstellung MUST standardmäßig deaktiviert sein.
- **FR-004**: Nur ein Trainer des jeweiligen Teams MUST die Einstellung aus FR-003 ändern können; ein Spieler-Account MUST daran gehindert werden (analog zum bestehenden Trainer-only-Muster für Team-Einstellungen und für 004 User Story 3).
- **FR-005**: Der Tab "Veo-Stats" MUST nur dann angeboten werden, wenn sowohl die interne Veo-Freischaltung (`is_veo_enabled`) als auch die öffentliche Sichtbarkeits-Einstellung (FR-003) aktiv sind. Fehlt eine der beiden Bedingungen, MUST die Seite sich verhalten wie heute — nur der Tab "Trainingsbewertungen", kein Veo-Tab, kein Fehlerzustand.
- **FR-006**: Der Tab "Veo-Stats" MUST für Teams, die beide Bedingungen aus FR-005 erfüllen, pro Trikotnummer die innerhalb der aktuellen Saison (`season_start` bis heute, dasselbe Saison-Konzept wie die Trainingsbewertungen-Rangliste) aufsummierten kuratierten Veo-Kennzahlen zeigen (Distanz, Sprints, Höchst-/Durchschnittsgeschwindigkeit, hochintensive Läufe, Spielminuten, Torschüsse, Tore, Torbeteiligungen — dieselbe kuratierte Auswahl wie 004-veo-player-analytics FR-001/FR-008). Spiele vor `season_start` MÜSSEN aus dieser Summe ausgeschlossen bleiben, auch wenn sie synchronisiert sind.
- **FR-007**: Weder der Tab "Trainingsbewertungen" noch der Tab "Veo-Stats" MUST personenbezogene Daten enthalten — keine Spielernamen, keine internen Spieler-/Team-/User-IDs, keine Links auf login-geschützte Seiten. Einziger Zeilen-Identifikator ist die Trikotnummer.
- **FR-008**: Für Teams, die FR-005 erfüllen, aber ohne bisher aufgelöste Spieler-Statistiken innerhalb der aktuellen Saison MUST der Tab "Veo-Stats" sichtbar sein und einen Leer-Zustand zeigen statt erfundener oder Null-Werte.
- **FR-009**: Eine Trikotnummer ohne aufgelöste Spieler-Zuordnung MUST im Veo-Stats-Tab nicht als Zeile erscheinen (analog 004 FR-002).
- **FR-010**: Eine für eine angezeigte Trikotnummer fehlende einzelne Kennzahl MUST als fehlend erkennbar sein, niemals als erfundener oder Null-Wert (analog 003/004).
- **FR-011**: Der Veo-Stats-Tab MUST ausschließlich die (saisongebundene) Summe zeigen, keine Einzelspiel-Aufschlüsselung (bewusst einfacher als die künftige login-geschützte Ansicht aus 004).
- **FR-012**: Das Aufrufen der öffentlichen Seite bzw. eines ihrer Tabs MUST keinen Veo-Sync auslösen; es werden ausschließlich bereits synchronisierte Daten verwendet.
- **FR-013**: Beide Tabs MUST ohne Authentifizierung erreichbar sein und dürfen keine schreibende Operation auslösen.
- **FR-014**: Beim Öffnen der Seite MUST standardmäßig der Tab "Trainingsbewertungen" aktiv sein (Kontinuität zur bisherigen alleinstehenden öffentlichen Rangliste).
- **FR-015**: Alle angezeigten Daten MUST strikt auf das eine, über den URL-Slug identifizierte Team beschränkt bleiben — keine teamübergreifende Datenvermischung (analog 001 public-ranking-Contract).

### Key Entities

- **Öffentliche Team-Seite**: Eine über den Team-Slug erreichbare, nicht-authentifizierte Seite mit zwei Tab-Ansichten.
- **Trainingsbewertungen-Ansicht**: Je Zeile eine Trikotnummer mit Platzierung und Kategorie-Summen (unverändert zur bestehenden öffentlichen Rangliste aus 001).
- **Veo-Stats-Ansicht**: Je Zeile eine Trikotnummer mit den kuratierten, auf die aktuelle Saison (`season_start` bis heute) begrenzten Summen der Veo-Kennzahlen aus 004, ohne Namen.
- **Öffentliche Veo-Sichtbarkeits-Einstellung**: Ein pro Team gespeicherter, trainer-verwaltbarer Schalter (Standardwert deaktiviert), unabhängig von der internen Veo-Freischaltung aus 003-veo-analytics; steuert ausschließlich, ob der Veo-Stats-Tab auf der öffentlichen Seite erscheint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein anonymer Besucher kann ohne Login sowohl die Trainingsbewertungen als auch — sofern für das Team verfügbar und von einem Trainer aktiviert — die Veo-Saison-Statistiken über zwei getrennt anwählbare Tabs auf derselben öffentlichen Seite einsehen.
- **SC-002**: In keinem der beiden Tabs erscheint jemals ein Spielername, eine interne Spieler-/Team-ID oder ein Link auf eine login-geschützte Seite (stichprobenartige Prüfung über mehrere Teams: 0 Treffer).
- **SC-003**: Für Teams ohne Veo-Freischaltung oder ohne aktivierte öffentliche Veo-Sichtbarkeit bleibt die öffentliche Seite inhaltlich unverändert zum heutigen Stand (identischer Trainingsbewertungen-Tab, kein Veo-Tab) — bei keinem Stichproben-Team mit deaktivierter Einstellung erscheint jemals eine Veo-Kennzahl.
- **SC-004**: Die im Veo-Stats-Tab gezeigten Saisonwerte entsprechen bei stichprobenartiger Nachrechnung exakt der fachlich passenden Aggregation aller synchronisierten, einer Trikotnummer zugeordneten Veo-Werte seit `season_start` desselben Teams: Summe für additive Kennzahlen, Maximum für Höchstgeschwindigkeit und Durchschnitt der Matchwerte für Durchschnittsgeschwindigkeit (0 Abweichungen) — unabhängig davon, ob die login-geschützte Saison-Übersicht aus 004 zum jeweiligen Zeitpunkt bereits denselben Saison-Zuschnitt anwendet.
- **SC-005**: Für Trikotnummern ohne aufgelöste Spieler-Zuordnung erscheinen im Veo-Stats-Tab zu keinem Zeitpunkt erfundene Werte.
- **SC-006**: Nur Trainer-Accounts können die öffentliche Veo-Sichtbarkeits-Einstellung ändern; jeder Änderungsversuch durch einen Spieler-Account wird zu 100% abgelehnt.

## Assumptions

- Die bestehende öffentliche Adresse bleibt die eine öffentliche URL pro Team; sie wird inhaltlich um die Tab-Struktur erweitert statt eine zweite öffentliche URL einzuführen (Simplicity First, Principle I).
- Der Tab "Trainingsbewertungen" entspricht 1:1 der bereits produktiven öffentlichen Rangliste aus 001-points-and-photos (inkl. Zeitraum-Auswahl); es wird keine neue Berechnungslogik eingeführt.
- Der Tab "Veo-Stats" nutzt dieselbe kuratierte Kennzahlen-Auswahl und Zuordnungslogik wie die (spezifizierte, aber noch nicht implementierte) login-geschützte Saison-Übersicht aus 004-veo-player-analytics, begrenzt die Summe aber zusätzlich auf die aktuelle Saison (`season_start` bis heute) — eine Einschränkung, die 004 in seiner bisherigen Fassung nicht kennt. Wird 004 künftig ebenfalls saisongebunden, sollten beide Ansichten übereinstimmen; bis dahin ist eine Abweichung zur (dann noch ungebundenen) login-geschützten Ansicht erwartbar und kein Fehler dieses Features.
- Der Veo-Stats-Tab zeigt ausschließlich die (saisongebundene) Summe ohne weitere Zeitraum-Filterung und ohne Einzelspiel-Aufschlüsselung — bewusst einfacher als eine mögliche künftige login-geschützte Detailansicht.
- Die login-geschützte Team-Dashboard-Seite selbst (inkl. ihrer eigenen, noch ausstehenden Umsetzung von 004) wird durch dieses Feature nicht verändert; Scope ist ausschließlich die öffentliche Seite.
- Öffentliche Sichtbarkeit von Veo-Leistungsdaten — auch vollständig anonymisiert auf Trikotnummer-Ebene — ist eine bewusste, pro Team vom Trainer zu treffende Entscheidung (separater Schalter, Standardwert deaktiviert), nicht automatisch an die interne Veo-Freischaltung gekoppelt. Dies greift die Sensibilität auf, die 004 bereits für die teaminterne Sichtbarkeit dokumentiert hat ("Hinweis auf die Sensibilität personenbezogener Leistungsdaten von größtenteils minderjährigen Spielern"), und übersetzt sie für die öffentliche Erweiterung in ein explizites Opt-in statt einer automatischen Übernahme.
- Die Einstellung aus FR-003 lebt vermutlich auf derselben Team-Einstellungsseite, auf der auch `season_start` und die Veo-Verknüpfung verwaltet werden (bestehendes UI-Muster); die genaue Platzierung ist eine Plan-Entscheidung, keine Spec-Entscheidung.
- Trikotnummer gilt in diesem Kontext weiterhin als nicht-personenbezogenes Datum (bestehender Präzedenzfall aus 001).
