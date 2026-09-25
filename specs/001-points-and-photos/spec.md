# Feature Specification: Trainingspunkte & Trainingsfotos

**Feature Branch**: `001-points-and-photos`
**Created**: 2026-09-10
**Status**: Draft
**Input**: User description: "Für unsere Fußballmannschaft brauchen wir eine Web-App,
mit der Trainer pro Training Punkte an Spieler vergeben können, und Spieler ihre
eigene Entwicklung im Zeitverlauf sehen." (full brief captured in the feature
request)

## Clarifications

### Session 2026-09-10 (round 2 — post-analyze)

- Q: Trikotnummer-Wechsel im Kader? → A: Wechsel nur nach Deaktivierung
  des Alt-Spielers. Sobald A auf inactive gesetzt ist, kann B die
  Nummer erhalten. Edge Case wird entsprechend geschärft; Partial-
  Unique-Index bleibt (unique jetzt pro Team, da Multi-Team, siehe unten).
- Q: Trainer-Onboarding und weitere Trainer? → A: Self-Signup ist möglich;
  neue Nutzer wählen bei der Anmeldung die Rolle (Trainer oder Spieler).
  Trainer legen ihr eigenes Team an und laden weitere Nutzer via E-Mail
  ein. Eine Einladung kann als Trainer- oder Spieler-Rolle im Team
  ausgestellt werden.
- Q: Auth-Methode? → A: Passwordless via Supabase Magic-Link. Kein
  Password-Login in v1. Betrifft Trainer wie Spieler.
- Q: Kann ein Nutzer in mehreren Teams unterschiedliche Rollen haben?
  → A: Ja. Rollen sind pro Team (Team-Membership). Ein Trainer eines
  eigenen Teams kann in einem anderen Team Spieler sein.
- Q: Scope-Fork v1? → A: 1 = ja (Multi-Team-UI in v1), 2 = ja (Self-Signup
  in v1). Die NG-001-Streichung ist damit endgültig; die App wird
  multi-tenant. plan.md und tasks.md werden nach diesem Update neu
  generiert.

### Session 2026-09-10 (round 1)

- Q: Wie regelt die App DSGVO/Foto-Einwilligung für (potentiell
  minderjährige) Spieler? → A: Pro Spieler `photo_consent` (bool, Default
  `false`); Fotos von Spielern ohne Consent werden ausgeblendet/unscharf,
  Trainer sieht Warnhinweis beim Upload.
- Q: Wie ist die Beziehung zwischen Player und User-Account? → A: Player
  kann ohne Account existieren; 1:1-Beziehung wenn verknüpft; ein
  Account gehört zu genau einem Player, ein Player hat maximal einen
  Account. Einladung optional durch Trainer, nachträglich möglich.
- Q: Ist `jersey_number` eindeutig, und in welchem Scope? → A: Eindeutig
  unter aktiven Spielern. Deaktivierte Spieler blockieren keine Nummer.
- Q: Multi-Team-Umfang für v1? → A: v1 hat GENAU EIN Team (das aktuell
  betreute). Multi-Team ist bekannter zukünftiger Bedarf (im Verein
  aktuell 4 Mannschaften: 3× C-Mannschaft + 1× B-Jugend, Aufstockung
  perspektivisch möglich), wird aber bewusst NICHT in v1 implementiert
  (Constitution-Prinzip I: Simplicity First). Datenmodell und Schema
  sind so zu wählen, dass eine spätere `team_id`-Migration ohne
  Datenverlust möglich ist. Trainer-Team-Berechtigung entfällt in v1;
  alle Trainer sehen und bearbeiten das (einzige) Team.

## User Scenarios & Testing *(mandatory)*

### User Story 0 - Nutzer registriert sich, gründet oder tritt einem Team bei (Priority: P1)

Ein Nutzer öffnet die App zum ersten Mal auf dem Handy. Er gibt seine
E-Mail ein und klickt auf den Magic-Link, den er per Mail erhält. Beim
ersten Login trägt er seinen Anzeigenamen ein. Er landet auf einer
Startseite mit zwei Optionen: **Team gründen** (er wird sofort Trainer
seines neuen Teams und landet in dessen Trainer-UI) oder **auf
Einladung warten** (er sieht offene, an seine E-Mail adressierte
Einladungen und kann sie annehmen). Ein Trainer eines bestehenden
Teams lädt weitere Nutzer per E-Mail mit vorwählbarer Rolle (Trainer
oder Spieler) ein.

**Why this priority**: Ohne diesen Flow gibt es keinen ersten Nutzer
und kein Team. Alle anderen User Stories sind Team-scoped und
brauchen mindestens ein Team + eine Trainer-Membership, um überhaupt
zu starten.

**Independent Test**: Frischer Browser ohne Session. Nutzer A
registriert sich, gründet Team "Test-Team", lädt Nutzer B mit Rolle
`player` ein. Nutzer B klickt Einladung an, meldet sich per
Magic-Link an, sieht Team-Kontext "Test-Team" und hat player-Rechte.

**Acceptance Scenarios**:

1. **Given** ein neuer Besucher öffnet die App, **When** er seine
   E-Mail eingibt und den Magic-Link klickt, **Then** wird ein
   UserAccount angelegt (oder ein bestehender wiederverwendet), der
   Nutzer landet in der Onboarding-Startseite mit den Optionen "Team
   gründen" / "Einladung annehmen".
2. **Given** ein eingeloggter Nutzer ohne Membership, **When** er
   "Team gründen" wählt, Name eingibt und speichert, **Then** wird
   das Team angelegt, ein `slug` generiert, eine `trainer`-Membership
   für den Nutzer erstellt, und der Nutzer landet auf der
   Trainer-Startseite des neuen Teams (`/t/<slug>`).
3. **Given** ein Trainer eines Teams, **When** er unter "Team →
   Mitglieder" die Aktion "Einladen" wählt, eine E-Mail-Adresse
   eingibt und die Rolle wählt, **Then** wird eine Invitation erstellt
   und eine E-Mail mit einem Magic-Link zum Team versendet.
4. **Given** eine gültige Einladung, **When** der eingeladene Nutzer
   den Link klickt, sich anmeldet und "Annehmen" bestätigt, **Then**
   wird die Membership angelegt, `accepted_at` gesetzt, und der Nutzer
   landet im Team-Kontext.
5. **Given** ein Trainer versucht, die letzte Trainer-Membership des
   Teams zu entfernen oder auf `player` zu wechseln, **When** er
   speichern will, **Then** wird die Aktion mit Fehler abgelehnt:
   "Ein Team muss mindestens einen Trainer haben."

---

### User Story 1 - Trainer erfasst Punkte für ein Training (Priority: P1)

Ein Trainer kommt nach dem Training vom Platz, öffnet die App auf dem Handy,
legt das heutige Training an (Datum vorbelegt), sieht den aktiven Kader in
einer Liste, trägt pro Spieler in den aktiven Punktekategorien einen Wert ein
und speichert. Optional kann er ein oder mehrere Fotos vom Training
hochladen. Das Training taucht danach in der Trainings-Historie auf und die
vergebenen Punkte fließen in Rangliste und Verlaufsauswertungen ein.

**Why this priority**: Das ist der Kern-Loop, der überhaupt Daten in das System
bringt. Ohne diesen Flow gibt es weder Rangliste noch Verlauf. Vor jedem
anderen Feature muss dieses funktionieren.

**Independent Test**: Nach initialem Seed (Kader + eine Kategorie
"Trainingsleistung" 0–5 + eine Trainer-Login) kann ein Trainer ohne weitere
Vorbereitung ein Training anlegen, für alle Kaderspieler Werte eintragen,
speichern und das gespeicherte Training in der Historie öffnen. Damit ist
die Kern-Wertschöpfung demonstrierbar.

**Acceptance Scenarios**:

1. **Given** der Trainer ist eingeloggt und mindestens ein Spieler ist im
   aktiven Kader und mindestens eine Punktekategorie ist aktiv, **When** der
   Trainer "Neues Training" wählt, das Datum bestätigt, für jeden Kaderspieler
   einen gültigen Punktwert einträgt und speichert, **Then** wird das Training
   persistiert, alle Punkteinträge sind dem Training zugeordnet, und das
   Training erscheint in der Trainings-Historie mit dem gewählten Datum.
2. **Given** ein Training ist bereits gespeichert, **When** der Trainer das
   Training erneut öffnet, einen Punktwert korrigiert und speichert, **Then**
   wird der neue Wert übernommen und der alte Wert überschrieben; ein
   Audit-Feld (last_updated_at, last_updated_by) wird aktualisiert.
3. **Given** der Trainer öffnet ein Training, **When** er ein oder mehrere
   Fotos hochlädt, **Then** sind die Fotos in der Trainingsgalerie sichtbar;
   Fotos sind für das Speichern nicht erforderlich.
4. **Given** ein Trainer trägt für einen Spieler einen Wert außerhalb des in
   der Kategorie definierten Wertebereichs ein, **When** er speichern will,
   **Then** wird der einzelne Feldwert als ungültig markiert und das Training
   nicht gespeichert.
5. **Given** ein Training ist gespeichert, **When** der Trainer das Datum
   nachträglich korrigiert und speichert, **Then** wird das neue Datum
   übernommen (sofern nicht in der Zukunft) und Historie/Rangliste zeigen
   das korrigierte Datum.
6. **Given** ein Trainer öffnet ein Training (Entwurf oder gespeichert),
   **When** er es löscht und die Sicherheitsabfrage bestätigt, **Then** ist
   das Training inklusive aller Punkteinträge und Fotos (auch der
   Bilddateien im Storage) endgültig entfernt und erscheint nicht mehr in
   der Trainings-Historie.

---

### User Story 2 - Spieler sieht Rangliste und eigenen Zeitverlauf (Priority: P1)

Ein Spieler loggt sich auf dem Handy ein. Er landet auf einem Dashboard, das
seine aktuelle Rangposition im Team über den Standardzeitraum (Saison bzw.
letzte 4 Wochen — siehe Assumptions) sowie die vollständige Rangliste zeigt
(seit 2026-09-25: kein separates Top-3-Kästchen mehr — die Top 10 Plätze sind
in der Rangliste selbst farblich hervorgehoben, Platz 1–3 markant als
Gold/Silber/Bronze, die beiden letzten Plätze rot). Von dort wechselt er zu
"Meine Punkte" und sieht einen Zeitverlauf seiner Punkte pro Training,
aufgesplittet nach Kategorie, mit einer Vergleichslinie Team-Durchschnitt und
Team-Median.

**Why this priority**: Ohne einen konsumierenden Nutzer hat die Erfassung
keinen Wert. Dieser Story macht die Erfassung für die Spieler sichtbar und
liefert die versprochene Motivation ("Ansporn").

**Independent Test**: Mit Seed-Daten (mehrere Trainings, mehrere Spieler,
Werte in einer Kategorie) kann ein Spieler-Account einloggen, seine
Rangposition im Team lesen, seinen Zeitverlauf mit Vergleichslinien
Durchschnitt/Median in derselben Kategorie sehen — ohne dass ein Trainer
gleichzeitig aktiv sein muss.

**Acceptance Scenarios**:

1. **Given** der Spieler ist eingeloggt und im Zeitraum liegen ≥1 Trainings
   mit Punkten, **When** er das Dashboard öffnet, **Then** sieht er seine
   aktuelle Rangposition, seine Gesamtwertung im Zeitraum und die vollständige
   Rangliste des Teams mit farblich hervorgehobenen Top-10-Plätzen (Platz 1–3
   als Gold/Silber/Bronze, die letzten beiden Plätze rot).
2. **Given** der Spieler wechselt auf "Meine Punkte", **When** die Seite
   lädt, **Then** sieht er pro aktiver Kategorie einen Zeitverlauf seiner
   eigenen Werte pro Training und zwei Vergleichslinien: Team-Durchschnitt
   und Team-Median über denselben Zeitraum.
3. **Given** der Spieler wählt einen anderen Zeitraum ("Letzte 4 Wochen",
   "Saison", "Benutzerdefiniert"), **When** die Auswahl bestätigt wird,
   **Then** werden Rangliste und Zeitverlauf mit den Daten des neuen
   Zeitraums aktualisiert.

---

### User Story 3 - Trainer verwaltet Punktekategorien (Priority: P2)

Ein Trainer öffnet die Kategorienverwaltung, legt eine neue Kategorie
"Fairness" mit Wertebereich 0–5 an, setzt die Reihenfolge, und speichert. Ab
diesem Moment erscheint "Fairness" im Erfassungsformular jedes neuen
Trainings als zusätzliche Eingabespalte. Eine bestehende Kategorie kann er
deaktivieren; sie verschwindet aus dem Erfassungsformular, bleibt aber in
Historien-Trainings und Auswertungen sichtbar.

**Why this priority**: Nach P1 und P2 ist die App nutzbar, aber die
Kategorien sind noch Betreiber-abhängig. Kategorien-Selfservice ist ein
Constitution-Prinzip (III), aber erst nach dem MVP-Loop wertschöpfend, da
initial mit einer Kategorie gestartet werden kann.

**Independent Test**: Ein Trainer kann eine neue Kategorie anlegen und im
folgenden neuen Training eine Spalte dafür sehen und befüllen — ohne dass ein
Deploy oder eine Code-Änderung nötig ist.

**Acceptance Scenarios**:

1. **Given** der Trainer ist auf der Kategorienseite, **When** er "Neue
   Kategorie" wählt, Name "Fairness", Wertebereich 0–5, Reihenfolge 2 setzt
   und speichert, **Then** ist die Kategorie in der Liste sichtbar, aktiv,
   und beim Anlegen eines neuen Trainings erscheint sie als zweite Spalte.
2. **Given** eine Kategorie ist aktiv und hat historische Einträge, **When**
   der Trainer sie deaktiviert, **Then** verschwindet sie aus dem
   Erfassungsformular neuer Trainings, bleibt aber in Historien-Trainings
   und in Auswertungen für den historischen Zeitraum vollständig sichtbar.
3. **Given** eine Kategorie hat historische Einträge, **When** der Trainer
   versucht sie zu löschen, **Then** ist Löschen nicht möglich; nur
   Deaktivieren wird angeboten.
4. **Given** der Trainer legt ein neues Training an, **When** er direkt im
   Formular "+ Kategorie hinzufügen" wählt, Name "Fairness", Wertebereich
   0–5 setzt und speichert, **Then** erscheint "Fairness" sofort als neue
   Spalte im aktuellen Erfassungsformular, ohne dass die Kategorienseite
   separat aufgerufen werden muss.

---

### User Story 4 - Trainer verwaltet Spielerstammdaten (Priority: P2)

Ein Trainer legt neue Spieler an (Name, optional Trikotnummer, Position),
markiert sie als aktiv/inaktiv im Kader, und korrigiert bestehende Angaben.
Spieler mit historischer Punkte-Historie werden nicht gelöscht, sondern nur
inaktiv gesetzt. Spieler ohne historische Punkte dürfen Trainer hingegen mit
Sicherheitsabfrage dauerhaft aus der Spielerliste löschen.

**Why this priority**: Ohne Spieler kein Kader, aber der initiale Kader kann
im Seed angelegt werden. Selfservice ist nötig, sobald der Kader sich
saisonal ändert.

**Independent Test**: Ein Trainer kann einen neuen Spieler anlegen; dieser
erscheint sofort im Erfassungsformular für neue Trainings. Ein deaktivierter
Spieler erscheint nicht mehr in neuen Trainings, seine historischen Punkte
sind aber in Auswertungen sichtbar.

**Acceptance Scenarios**:

1. **Given** der Trainer ist auf der Spielerseite, **When** er "Neuer
   Spieler" wählt, Name eingibt und speichert, **Then** ist der Spieler im
   aktiven Kader sichtbar und in neuen Trainings erfassbar.
2. **Given** ein Spieler hat historische Punkteinträge, **When** der Trainer
   ihn deaktiviert, **Then** taucht der Spieler in neuen Trainings nicht
   mehr auf; seine historischen Werte bleiben in Rangliste und Zeitverlauf
   für vergangene Zeiträume sichtbar.

---

### User Story 5 - Anonyme Public-Rangliste ohne Login (Priority: P3)

Ein beliebiger Besucher öffnet eine öffentliche URL des Boards, ist NICHT
eingeloggt, und sieht die aktuelle Team-Rangliste. Statt Namen erscheinen
ausschließlich Trikotnummern. Es sind keine Fotos, keine Trainingsdetails,
keine Einzelverläufe abrufbar.

**Why this priority**: Erhöht die Reichweite (Eltern, Vereinsumfeld) ohne
Klartext-Personendaten preiszugeben und ohne einen Account zu benötigen.
Setzt aber P1/P2 voraus (Daten müssen existieren, Sortierlogik muss
implementiert sein).

**Independent Test**: Ein Browser ohne Session ruft die Public-URL auf und
sieht Rangposition + Trikotnummer + Aggregate; ein Versuch, ein Foto oder
einen personalisierten Zeitverlauf über dieselbe Route zu holen, schlägt
fehl.

**Acceptance Scenarios**:

1. **Given** es liegen Trainings mit Punkten im Standardzeitraum vor,
   **When** ein nicht eingeloggter Besucher die Public-URL öffnet, **Then**
   sieht er eine Tabelle mit Rangposition, Trikotnummer und aggregierten
   Score-Werten pro aktiver Kategorie; Klartextnamen erscheinen nicht.
2. **Given** ein Spieler hat keine `jersey_number` gesetzt, **When** der
   nicht eingeloggte Besucher die Public-URL öffnet, **Then** wird der
   Spieler mit "—" statt einer Nummer angezeigt, seine Rangposition zählt
   dennoch.
3. **Given** ein nicht eingeloggter Besucher versucht via Public-Pfad auf
   Fotos, Trainings-Detaildaten oder Einzelverläufe zuzugreifen, **When**
   die Anfrage die Datenzugriffsschicht erreicht, **Then** wird sie
   abgelehnt.

---

### User Story 6 - Trainingsfoto-Galerie für alle eingeloggten Nutzer (Priority: P3)

Alle eingeloggten Nutzer (Trainer und Spieler) sehen pro Training eine
Galerie mit den zu diesem Training hochgeladenen Fotos. Öffentlicher Zugriff
ist ausgeschlossen.

**Why this priority**: Das Motiv "kleine Ansporn/Erinnerungsfunktion" wird
durch Fotos verstärkt, aber Punkte sind das primäre Bewertungskriterium.

**Independent Test**: Ein Spieler-Account kann ein vergangenes Training
öffnen und die Fotos anzeigen. Ein nicht eingeloggter Zugriff auf die
Foto-URLs schlägt fehl.

**Acceptance Scenarios**:

1. **Given** ein Training hat 3 Fotos, **When** ein eingeloggter Spieler das
   Training öffnet, **Then** sieht er alle 3 Fotos in einer scrollbaren
   Galerie, optimiert für Handy-Anzeige.
2. **Given** ein nicht eingeloggter Nutzer versucht die direkte Foto-URL
   aufzurufen, **When** die Anfrage die Speicherschicht erreicht, **Then**
   wird der Zugriff abgelehnt (kein authentifizierter Zugang, keine
   Auslieferung).

---

### Edge Cases

- **Kein aktiver Kader**: Wenn kein Spieler aktiv ist, blockt "Neues Training"
  mit dem Hinweis, dass zuerst mindestens ein Spieler angelegt werden muss.
- **Keine aktive Kategorie**: Wenn keine Kategorie aktiv ist, zeigt "Neues
  Training" einen Hinweis und bietet direkt im Formular eine Aktion an, um
  eine Kategorie anzulegen — ohne dass die Kategorienseite separat
  aufgerufen werden muss.
- **Spieler nicht anwesend**: Wenn der Trainer für einen Spieler keinen Wert
  einträgt, wird das als "nicht bewertet" gespeichert (kein Nullpunkt).
  Solche Trainings zählen für diesen Spieler nicht in Durchschnitt/Median.
- **Trainings-Datum in der Zukunft**: Der Trainer kann kein Training mit
  einem Datum in der Zukunft anlegen.
- **Zwei Trainings am selben Tag**: Erlaubt (Doppel-Training möglich); beide
  werden als separate Datensätze geführt.
- **Wertebereich einer Kategorie ändert sich**: Ändert ein Trainer den
  Wertebereich einer bestehenden Kategorie, gelten neue Grenzen nur für
  neue Einträge; historische Werte bleiben unverändert, auch wenn sie
  außerhalb des neuen Bereichs liegen.
- **Foto-Upload schlägt fehl** (Netz weg, zu groß, Format nicht
  unterstützt): Klare Fehlermeldung, Training bleibt im ungespeicherten
  Zustand; teilweise eingetragene Punkte gehen nicht verloren, solange die
  Seite offen bleibt.
- **Spieler wurde deaktiviert, ist aber in historischem Training bewertet**:
  Seine historischen Werte sind sichtbar und werden in Auswertungen für
  Zeiträume, in denen er aktiv war, gezählt.
- **Trikotnummer-Wechsel im Kader** (Nummer geht auf Nachfolger über):
  Der Trainer MUSS den Alt-Spieler zuerst auf `active = false` setzen;
  danach kann der Nachfolger dieselbe Nummer erhalten. Ein Versuch,
  einer aktiven Person die Nummer eines anderen aktiven Spielers zu
  geben, wird durch den Partial-Unique-Index abgewiesen. Zwei Spieler
  mit derselben aktuellen Nummer im aktiven Kader sind NIE zulässig.
  In der Historie kann eine Nummer wiederholt auftauchen (Alt-Spieler
  inaktiv, Nachfolger aktiv).
- **Kein Spieler hat Punkte im gewählten Zeitraum**: Rangliste zeigt eine
  leere Tabelle mit klarer Meldung ("Keine Punkte im gewählten Zeitraum").
- **Alle aktiven Kategorien führen zu Gleichstand zwischen zwei Spielern**:
  Beide erhalten dieselbe Rangposition, die nächste Rangposition zählt um
  die Anzahl der Gleichstandsplätze weiter (Standard-Sportranking, z. B.
  1, 2, 2, 4).
- **Letzter Trainer verlässt ein Team**: Die Aktion wird blockiert
  (FR-072). Der Trainer muss zuerst einen anderen Nutzer zum
  Trainer-Rang erheben.
- **Einladung an eine bereits gemitgliedete E-Mail**: Wenn die
  Zieladresse bereits eine Membership im Team hat, wird die Einladung
  mit Hinweis abgelehnt. Wenn die Adresse eine Einladung mit anderer
  Rolle bereits offen hat, wird die alte widerrufen und die neue
  ausgestellt.
- **Nutzer klickt abgelaufene Einladung**: Klarer Hinweis "Einladung
  abgelaufen"; der Nutzer bleibt eingeloggt, aber ohne neue Membership.
- **Nutzer mit Membership in mehreren Teams**: Team-Selector oben in
  der App-Nav; letzter aktiver Team-Kontext wird in `localStorage`
  persistiert und beim Login wiederhergestellt. Direkte URLs
  (`/t/<slug>/…`) wechseln den Kontext ohne extra Aktion.
- **Slug-Kollision beim Team-Anlegen**: Automatisch abgeleiteter Slug
  wird bei Kollision mit einem Zähler suffigiert (z. B. `sv-c1`,
  `sv-c1-2`). Manuell eingegebener Slug wird bei Kollision im Form-
  Fehler abgelehnt.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts, Auth & Rollen (per Team)**

- **FR-001**: Das System MUSS zwei Rollen pro Team unterstützen: `trainer`
  und `player`. Rollen sind an eine Team-Membership gebunden, nicht an den
  Nutzer selbst. Ein Nutzer kann in Team A Trainer und in Team B Spieler
  sein.
- **FR-002**: Ein Nutzer mit `trainer`-Membership in Team X MUSS Schreib-
  und Leserechte auf ALLE team-scoped Ressourcen von X haben (Trainings,
  Spieler, Kategorien, Punkteinträge, Fotos, Team-Einstellungen,
  Memberships). Er hat KEINE Rechte in Teams, in denen er nicht
  Trainer-Membership hat.
- **FR-003**: Ein Nutzer mit `player`-Membership in Team X MUSS Leserechte
  in X haben: Rangliste, eigenes Detail-Profil, aggregierte Team-Statistik,
  Trainingsübersicht, Fotos. Analog: keine Rechte in fremden Teams.
- **FR-004**: Auth erfolgt via **Magic-Link** (One-Time-Password per
  E-Mail). Es gibt kein Password-Login in v1. Registrierung und Login
  laufen über denselben Magic-Link-Flow; beim ersten Login trägt der
  Nutzer seinen Anzeigenamen ein.
- **FR-005**: Self-Signup ist offen: ein neuer Nutzer registriert sich mit
  seiner E-Mail via Magic-Link. Danach hat der Nutzer noch keine
  Team-Membership. Er MUSS wählen: entweder (a) ein neues Team gründen
  (er wird `trainer`-Membership des neuen Teams) oder (b) eine
  Einladung eines bestehenden Trainers annehmen (er wird `trainer`- oder
  `player`-Membership des einladenden Teams, je nach Einladungs-Rolle).
  Ohne Team-Membership sieht der Nutzer nur die Startseite mit den
  beiden Optionen.
- **FR-006**: Nicht authentifizierte Anfragen MÜSSEN abgelehnt werden für
  alle Daten, ausgenommen die anonymen öffentlichen Ranglisten pro Team
  (siehe FR-060 ff.). Foto-Assets sind IMMER auf authentifizierte Nutzer
  mit passender Team-Membership beschränkt.
- **FR-007**: Trainer eines Teams MÜSSEN weitere Nutzer per E-Mail zum Team
  einladen können. Beim Ausstellen der Einladung wählt der Trainer die
  Rolle (`trainer` oder `player`). Der Einladungslink führt beim Klick
  zum Magic-Link-Login und legt bei Annahme die Membership an.
- **FR-008**: Eine Einladung MUSS folgende Attribute tragen: `team_id`,
  `email`, `role`, `invited_by`, `expires_at` (z. B. 14 Tage),
  `accepted_at` (nullbar). Nicht akzeptierte Einladungen sind abrufbar
  und widerrufbar durch die Trainer des Teams.

**Team-Management**

- **FR-070**: Ein Nutzer MUSS ein neues Team anlegen können. Beim Anlegen
  gibt er `name` (Pflicht) und optional `slug` (falls leer: automatisch
  aus `name` abgeleitet) an. Der anlegende Nutzer erhält automatisch
  eine `trainer`-Membership.
- **FR-071**: Jedes Team hat einen eindeutigen, URL-tauglichen `slug`
  (z. B. `sv-musterstadt-c1`). Der Slug ist ab dem Zeitpunkt der Vergabe
  stabil und wird für öffentliche Routen (FR-060 ff.) verwendet.
- **FR-072**: Ein Nutzer mit Trainer-Membership MUSS in seinen Teams
  Trainer- und Player-Memberships anderer Nutzer sehen, ändern (Rolle
  wechseln) und entfernen können. Er DARF nicht die letzte verbleibende
  Trainer-Membership eines Teams entfernen (Guard gegen "Team
  verwaist").
- **FR-073**: Ein Nutzer MUSS sich selbst aus einem Team entfernen können
  (Membership löschen), außer er ist der letzte verbleibende Trainer
  (siehe FR-072).
- **FR-074**: Der aktuelle Team-Kontext MUSS in der URL erkennbar sein
  (z. B. `/t/<slug>/…`). Nach dem Login wird der zuletzt aktive
  Team-Kontext wiederhergestellt; hat der Nutzer keine Membership,
  landet er auf einer Startseite mit den Optionen "Team gründen" und
  "auf Einladung warten".

**Trainings**

- **FR-010**: Ein Trainer MUSS ein Training anlegen können mit Pflichtfeld
  `date` und optionalem `title`/`note`.
- **FR-011**: Das System MUSS `date` in der Vergangenheit oder auf heute
  beschränken (kein zukünftiges Trainingsdatum).
- **FR-012**: Ein Trainer MUSS bei einem Training pro aktivem Kaderspieler
  und pro aktiver Kategorie einen Punktwert eintragen können, oder das Feld
  leer lassen (Interpretation: nicht bewertet).
- **FR-013**: *(entfällt seit 2026-09-11 — Fotos sind für ein Training in
  jedem Status optional, der Speichern-Guard wurde in
  `20260911130000_drop_photo_requirement.sql` entfernt; siehe Acceptance
  Scenario 3 unter User Story 1.)*
- **FR-014**: Ein Trainer MUSS ein gespeichertes Training nachträglich
  editieren können (Punkte korrigieren, Fotos ergänzen, Fotos löschen,
  Datum korrigieren).
- **FR-015**: Das System MUSS pro Punkteintrag `last_updated_at` und
  `last_updated_by` mitführen.
- **FR-016**: Ein Trainer MUSS ein Training (Entwurf oder gespeichert)
  vollständig löschen können. Beim Löschen MÜSSEN die zugehörigen
  Punkteinträge und Fotos mitgelöscht werden, einschließlich der
  Bilddateien im Storage-Bucket (keine verwaisten Fotodateien).

**Kategorien**

- **FR-020**: Punktekategorien MÜSSEN als Daten in der Datenbank liegen und
  von Trainern über die App verwaltbar sein.
- **FR-021**: Eine Kategorie MUSS mindestens Attribute `name`, `active` (bool),
  `sort_order` (int), `value_min` (int), `value_max` (int) haben.
- **FR-022**: Beim Punkteeintrag MUSS das System sicherstellen, dass Werte
  im Bereich [`value_min`, `value_max`] der Kategorie zum Erfassungs-
  zeitpunkt liegen.
- **FR-023**: Deaktivierte Kategorien MÜSSEN in Historien-Trainings und in
  Auswertungen sichtbar bleiben, aber im Erfassungsformular neuer Trainings
  NICHT mehr erscheinen.
- **FR-024**: Kategorien mit mindestens einem historischen Eintrag DÜRFEN
  NICHT löschbar sein. Deaktivieren muss angeboten werden.
- **FR-025**: Beim Systemstart MUSS mindestens eine Kategorie
  "Trainingsleistung" (Wertebereich 0–5, aktiv) vorhanden sein (Seed).

**Spielerstammdaten**

- **FR-030**: Spieler MÜSSEN mindestens `name` (Pflicht), `active` (bool),
  `jersey_number` (optional), `position` (optional) haben.
- **FR-031**: Trainer MÜSSEN Spieler anlegen, editieren und aktiv/inaktiv
  setzen können. Aktiv/Inaktiv wird seit 2026-09-25 direkt in der
  Spielerliste per Checkbox in beide Richtungen umgeschaltet (kein separater
  Aktivieren-/Deaktivieren-Button mehr); Bearbeiten (Name, Trikotnummer,
  Position, E-Mail, Foto-Einwilligung) erfolgt ausschließlich über die
  Spieler-Detailseite, zu der der Name in der Liste verlinkt.
- **FR-032**: Spieler mit historischen Punkteinträgen DÜRFEN NICHT gelöscht
  werden. Deaktivieren muss angeboten werden. Ein Trainer MUSS einen Spieler
  OHNE historische Punkteinträge über die Spielerliste dauerhaft löschen
  können (Sicherheitsabfrage erforderlich); der Versuch, einen Spieler MIT
  Punkteinträgen zu löschen, MUSS mit einem Hinweis auf Deaktivieren
  abgelehnt werden (seit 2026-09-25).
- **FR-033**: Nur aktive Spieler MÜSSEN im Erfassungsformular neuer
  Trainings erscheinen; inaktive Spieler bleiben in Historie sichtbar.

**Fotos**

- **FR-040**: Fotos MÜSSEN einem konkreten Training zugeordnet gespeichert
  werden.
- **FR-041**: Fotos MÜSSEN nur für authentifizierte Nutzer (Trainer und
  Spieler) abrufbar sein. Öffentlicher URL-Zugriff MUSS abgelehnt werden.
- **FR-042**: Das System MUSS Fotos ≤10 MB pro Datei akzeptieren
  (Assumption A2); größere Dateien werden mit klarer Fehlermeldung
  abgelehnt.
- **FR-043**: Unterstützte Formate: JPEG, PNG, HEIC/HEIF, WebP (Assumption
  A3).
- **FR-044**: Jeder Spieler hat ein Attribut `photo_consent` (bool,
  Default `false`). Trainer MÜSSEN `photo_consent` pro Spieler in der
  Spielerverwaltung setzen können.
- **FR-045**: Beim Anzeigen von Fotos MUSS das System für jeden erkennbaren
  Spieler ohne `photo_consent = true` das Foto entweder ausblenden oder
  eine Consent-Blur-Overlay-Darstellung liefern. Die konkrete
  Standardstrategie ist: Foto komplett ausblenden, sobald mindestens ein
  Spieler ohne Consent im Foto markiert ist ODER kein Consent-Status
  vermerkt ist. (Eine gezielte Gesichts-/Personenerkennung ist NICHT Teil
  von v1 — siehe A12.)
- **FR-046**: Im Trainings-Punkte-Raster MUSS jeder aktive Kaderspieler
  ohne `photo_consent = true` durch ein rot eingefärbtes Warnsymbol neben
  seinem Namen gekennzeichnet sein; ein Tooltip weist darauf hin, dass
  Fotos mit diesem Spieler für andere ausgeblendet werden.

**Auswertungen**

- **FR-050**: Das System MUSS pro Team eine Rangliste über einen wählbaren
  Zeitraum anzeigen. Zeitraum-Optionen: "Letzte 4 Wochen", "Saison",
  "Benutzerdefiniert (von–bis)". Standard: "Saison" (Assumption A4).
  Ranglisten sind IMMER team-intern; es gibt keine team-übergreifende
  Rangliste in v1.
- **FR-051**: Die Rangposition MUSS lexikographisch nach der Reihenfolge der
  Kategorien (aufsteigend nach `sort_order`) berechnet werden. Innerhalb
  jeder Kategorie wird nach `SUM(value)` über den gewählten Zeitraum
  absteigend sortiert. Die Kategorie mit der niedrigsten `sort_order` ist
  die primäre Sortierung; die nächste Kategorie bricht Gleichstand; und so
  weiter. Deaktivierte Kategorien werden für neue Rangliste-Berechnungen
  ignoriert, bleiben aber in Zeitverlauf-Auswertungen sichtbar.
  Bleibt nach allen aktiven Kategorien immer noch Gleichstand, gilt die
  gleiche Rangposition für die betroffenen Spieler.
- **FR-052**: Für jeden Spieler MUSS ein Zeitverlauf pro Kategorie
  darstellbar sein (Punktwert vs. Trainingsdatum), inklusive
  Vergleichslinien Team-Durchschnitt und Team-Median über denselben
  Zeitraum.
- **FR-053**: Auswertungen MÜSSEN Spieler ausklammern, die zum Trainings-
  zeitpunkt nicht bewertet wurden (leere Einträge zählen nicht als 0).
- **FR-054**: Trainer MÜSSEN alle Auswertungen für alle Spieler sehen.
  Spieler MÜSSEN vollen Zugriff auf die Detail-Auswertungen ALLER Spieler
  des Teams haben (voll transparent): Zeitverlauf pro Kategorie pro Spieler,
  Rangliste mit Namen, aggregierte Statistik. Die Team-Kultur ist
  transparent-vergleichend; individuelle Bewertungen sind bewusst offen im
  Team.

**Anonyme öffentliche Rangliste**

- **FR-060**: Das System MUSS pro Team eine anonyme öffentliche Rangliste
  bereitstellen, die OHNE Login abrufbar ist. Die Route enthält den
  Team-`slug` (z. B. `/public/<slug>/ranking`).
- **FR-061**: In der anonymen Ansicht werden Spieler ausschließlich über ihre
  `jersey_number` identifiziert. Klartext-Namen, `position`,
  `linked_user_id` und alle sonstigen personenidentifizierenden Attribute
  DÜRFEN NICHT übertragen oder angezeigt werden.
- **FR-062**: Die anonyme Ansicht MUSS ausschließlich anzeigen:
  Rangposition, `jersey_number`, aggregierte Score-Werte pro aktiver
  Kategorie im Zeitraum. Alle anderen Daten (Trainings-Historie,
  Foto-Galerien, Einzelwerte pro Training, Detail-Zeitverläufe, Spieler-
  stammdaten) DÜRFEN in der anonymen Ansicht NICHT abrufbar sein.
- **FR-063**: Spieler ohne `jersey_number` MÜSSEN in der anonymen Ansicht
  als "—" (kein Identifier) angezeigt werden; ihre Rangposition zählt
  trotzdem.
- **FR-064**: Der öffentliche Zugriff MUSS über eine dedizierte Route bzw.
  einen dedizierten Datenzugriffspfad (View/RPC mit Public-Policy) laufen,
  der ausschließlich das Datenschema aus FR-062 preisgibt.

**Nicht-Ziele (v1)**

- ~~**NG-001**~~ (endgültig gestrichen in Clarify Round 2): Multi-Team ist
  ausdrücklich Bestandteil von v1. Das System ist multi-tenant:
  beliebig viele Teams; jedes Team hat einen unabhängigen Kader,
  Kategorien, Trainings und Auswertungen; Nutzer haben Team-scoped
  Rollen via Memberships.
- **NG-002**: Push-Notifications, In-App-Chat und Kommentare auf Trainings
  sind ausgeschlossen.
- **NG-003**: Trainingsplanung/Kalender ist ausgeschlossen.
- **NG-004**: Öffentliches Sharing individueller Klartextnamen, Fotos oder
  Detaildaten ist ausgeschlossen. (Öffentlich sichtbar ist ausschließlich
  die anonyme Rangliste nach FR-060 ff.)
- **NG-005**: Video-Upload ist ausgeschlossen.
- **NG-006**: Erfassung/Statistik zu Ligaspielen ist ausgeschlossen.

### Key Entities

- **Team**: Eine Mannschaft. Attribute: `id`, `name` (Pflicht, z. B.
  "SV Musterstadt C1"), `slug` (Pflicht, eindeutig, URL-tauglich),
  `created_by` (Nutzer, der das Team gegründet hat), `created_at`.
- **UserAccount**: Ein Auth-Konto (Supabase `auth.users`). Attribute:
  `id`, `email` (aus Supabase), `display_name` (aus User-Metadata bzw.
  Onboarding). Keine globale Rolle — Rollen entstehen über Memberships.
- **Membership**: Eine Team-Rolle-Zuordnung. Attribute: `user_id`,
  `team_id`, `role` (`trainer` | `player`), `created_at`. Primärschlüssel
  (`user_id`, `team_id`) — ein Nutzer hat pro Team höchstens eine
  Membership. Guard: ein Team MUSS mindestens eine `trainer`-Membership
  behalten (FR-072).
- **Invitation**: Eine ausgestellte Team-Einladung. Attribute:
  `team_id`, `email`, `role` (`trainer` | `player`), `invited_by`,
  `created_at`, `expires_at`, `accepted_at` (nullbar), `token`
  (URL-tauglich, eindeutig).
- **Player**: Ein Kadermitglied EINES Teams. Attribute: `team_id`
  (Pflicht), `name` (Pflicht), `active`, `jersey_number` (optional,
  eindeutig unter aktiven Spielern desselben Teams), `position`
  (optional), `linked_user_id` (optional, 1:1 zu UserAccount),
  `photo_consent` (bool, Default `false`). Der verknüpfte Nutzer MUSS
  eine `player`-Membership im selben Team haben, damit die Verknüpfung
  gültig ist.
- **PointCategory**: Ein Bewertungskriterium EINES Teams. Attribute:
  `team_id`, `name`, `active`, `sort_order`, `value_min`, `value_max`.
  Kategorien werden pro Team gepflegt.
- **Training**: Eine Trainingseinheit EINES Teams. Attribute: `team_id`
  (Pflicht), `date` (Pflicht), `title` (optional), `note` (optional),
  `status` (`draft` | `saved`), `created_by`, `created_at`,
  `last_updated_at`, `last_updated_by`.
- **PointEntry**: Ein Punktwert eines Spielers in einer Kategorie für
  ein Training. Attribute: `training_id`, `player_id`, `category_id`,
  `value`, `last_updated_at`, `last_updated_by`. Fehlender Eintrag
  bedeutet "nicht bewertet". Konsistenz-Constraint: `training.team_id`
  = `player.team_id` = `category.team_id`.
- **TrainingPhoto**: Ein Foto zu einem Training. Attribute: `training_id`,
  `storage_path` (im Bucket team-präfigiert, z. B.
  `<team_id>/<training_id>/<uuid>.jpg`), `content_type`, `size_bytes`,
  `uploaded_by`, `uploaded_at`. Mindestens 1 pro Training.
- **AuditFields** (Konvention): `created_at`, `created_by`,
  `last_updated_at`, `last_updated_by` auf jeder mutierbaren Entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Trainer erfasst in ≤2 Minuten auf dem Handy für 15
  Spieler in zwei Kategorien alle Punkte plus ein Foto und speichert
  erfolgreich.
- **SC-002**: Ein Spieler öffnet die App auf dem Handy und sieht in ≤5
  Sekunden nach dem Login seine Rangposition und den Einstieg in seinen
  Punkte-Zeitverlauf.
- **SC-003**: 100 % der Datenzugriffe respektieren die Rollen: ein
  Spieler-Konto erhält bei einem direkten API-Zugriff auf ein
  Trainer-only-Endpoint bzw. auf Detaildaten außerhalb seines Scopes eine
  Ablehnung (verifiziert durch mindestens einen negativen Testfall pro
  Rolle-Ressource-Kombination).
- **SC-004**: 100 % der Trainings enthalten ≥1 Foto (Speichern ohne Foto
  ist strukturell ausgeschlossen).
- **SC-005**: Punkteintragswerte außerhalb des zum Erfassungszeitpunkt
  definierten Wertebereichs einer Kategorie werden in 100 % der Fälle
  abgelehnt.
- **SC-006**: Eine neue Punktekategorie kann von einem Trainer in ≤60
  Sekunden angelegt werden und ist im nächsten neuen Training als Eingabe-
  spalte verfügbar, ohne Code-Änderung oder Deploy.
- **SC-007**: Historische Auswertungen für einen deaktivierten Spieler
  bleiben sichtbar und unverändert nach seiner Deaktivierung.
- **SC-008**: 100 % der Anfragen an den öffentlichen Rangliste-Pfad
  (`/public/<slug>/ranking`) ohne Session liefern ausschließlich das in
  FR-062 definierte Datenschema; jeder Versuch, personenidentifizierende
  Attribute (Namen, Fotos, Detail-Zeitverläufe) über diesen Pfad zu
  beziehen, wird abgelehnt (verifiziert durch mindestens einen negativen
  Testfall pro geschützter Ressource).
- **SC-009**: 100 % der Cross-Team-Zugriffe werden abgelehnt: ein Nutzer
  mit Membership nur in Team A darf per direktem API-Zugriff KEINE Daten
  (Trainings, Player, Entries, Photos, Kategorien, Memberships,
  Einstellungen) von Team B lesen oder schreiben. Verifiziert durch eine
  Test-Matrix "Team A ↔ Team B, Rolle × Ressource".
- **SC-010**: Ein neu registrierter Nutzer kann von "E-Mail eingeben"
  bis "Team gegründet und Trainer-UI sichtbar" in ≤3 Minuten (inklusive
  Magic-Link-Empfang) auf dem Handy durchlaufen.

## Assumptions

- **A1**: (überholt in Round 2) Kein Bootstrap-Trainer nötig. Jeder
  Nutzer registriert sich per Magic-Link und gründet bei Bedarf ein
  eigenes Team; damit wird er automatisch dessen Trainer. Weitere
  Trainer und Spieler werden per Team-Einladung geladen.
- **A2**: Einzel-Foto-Limit 10 MB. Rationale: bequemer Upload vom Handy
  ohne aufwändige Client-Kompression; genug für Handy-Aufnahmen.
- **A3**: Zulässige Foto-Formate: JPEG, PNG, HEIC/HEIF, WebP. Rationale:
  Abdeckung iPhone (HEIC) + Android (JPEG/WebP) + Legacy (PNG).
- **A4**: Standardzeitraum für Rangliste und Auswertungen ist "Saison"
  (Saison-Startdatum konfigurierbar durch Trainer; Fallback: Jahresbeginn
  des aktuellen Jahres, falls nichts gesetzt). Rationale: bezugsstärkster
  Zeitraum für Nutzer im Vereinsalltag.
- **A5**: Anwesenheit wird nicht als eigenes Feld erfasst. Ein leerer
  Punktwert bedeutet "nicht bewertet" (typischerweise: nicht anwesend
  oder nicht bewertbar) und zählt nicht in Statistiken. Rationale:
  einfachstes Datenmodell; explizite Anwesenheit wäre YAGNI.
- **A6**: v1 hat kein "zweiter Spieler vergleichen"-Feature; wird in einem
  späteren Feature-Cycle erwogen.
- **A7**: Alle Fotos werden dauerhaft aufbewahrt; kein Auto-Cleanup in v1.
- **A8**: Die App wird als Web-App bereitgestellt (kein nativer App-Store-
  Release), ist aber Mobile-First und "Add to Home Screen"-tauglich.
- **A9**: Innerhalb einer Kategorie wird nach `SUM(value)` im gewählten
  Zeitraum sortiert (nicht Durchschnitt). Rationale: einfachste
  Interpretation von "Punkte"; belohnt Anwesenheit + Leistung.
  Durchschnitts- oder gewichtete Varianten sind explizit YAGNI für v1.
- **A10**: Die Team-Kultur akzeptiert vollständige innerbetriebliche
  Transparenz: jeder Spieler sieht die Detail-Bewertungen jedes anderen
  Spielers. Trainer sind sich bewusst, dass individuelle Bewertungen
  team-öffentlich sind. Dies ist eine bewusste Design-Entscheidung, keine
  Beschränkung des Datenmodells.
- **A11**: Die öffentliche Rangliste ist über eine feste, nicht geratene
  URL erreichbar (keine Signatur, keine Zeitbegrenzung); die Anonymität
  wird über das übertragene Datenschema (nur Trikotnummer, keine Namen)
  hergestellt, nicht über Zugriffsgeheimhaltung.
- **A12**: `photo_consent` wird pro Spieler als Flag gepflegt. Die
  Consent-Enforcement in v1 arbeitet auf Foto-Ebene ("Foto komplett
  ausblenden, wenn Consent unklar"), NICHT auf Gesichts-/Ausschnitts-
  Ebene. Automatische Gesichtserkennung ist YAGNI und ausgeschlossen für
  v1. Die dokumentierte schriftliche Einwilligung wird außerhalb der App
  (Elternabend, Vereinsantrag) erfasst; der Trainer überträgt sie als
  Flag in die App.
- **A13**: `jersey_number` ist eindeutig unter aktiven Spielern desselben
  Teams. Team-übergreifende Kollisionen sind zulässig (Nummer 7 in
  Team A und Team B können unterschiedliche Personen sein). Deaktivierte
  Spieler blockieren keine Nummer. Wechsel innerhalb eines Teams erst
  nach Deaktivierung des Alt-Spielers.
- **A14**: Auth ist **passwordless via Magic-Link** (Supabase OTP per
  E-Mail). Kein Passwortfeld in v1. Rationale: einfacher für gemischtes
  Alters-Publikum, kein Password-Reset-Support-Kanal nötig, Registrierung
  und Login teilen denselben Flow.
- **A15**: Rollen sind pro Team (Membership-Modell). Ein Nutzer kann in
  Team X Trainer und in Team Y Spieler sein. RLS-Policies joinen über
  `memberships` (nicht mehr über eine globale `role`-Spalte). Ein Team
  MUSS jederzeit mindestens eine Trainer-Membership behalten.
- **A16**: Self-Signup ist offen (jeder mit E-Mail kann sich anmelden).
  Missbrauchs-Schutz erfolgt via Supabase-eingebautem Rate-Limiting auf
  Magic-Link-Requests (kein separater App-Level-Limiter in v1). Ein
  frisch angelegter Nutzer OHNE Membership sieht nur die Startseite
  ("Team gründen" oder "Einladung annehmen"); er hat weder Lese- noch
  Schreibrechte auf existierende Team-Daten.
- **A17**: Einladungen laufen nach 14 Tagen ab. Trainer eines Teams
  können ausstehende Einladungen einsehen und widerrufen. Nach Annahme
  wird die Einladung als `accepted_at` markiert und die Membership
  angelegt; wiederholte Klicks auf denselben Link nach Annahme führen
  zum normalen Team-Kontext, nicht zu einer neuen Membership.
