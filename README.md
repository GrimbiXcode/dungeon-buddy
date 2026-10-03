# 🎲 Dungeon Buddy

Selbst gehostete Toolbox für **D&D 5e**, kompatibel mit den Regeln von **2014** (SRD 5.1) und **2024** (SRD 5.2).
Als Web-App für Smartphone, Tablet und Desktop, installierbar als PWA.

- **Kampagnen**: Lege die Kampagnen an, in denen du spielst, mit Name, Beschreibung, Regelversion und Farbschema. Du kannst sie bearbeiten, archivieren und löschen. Jedes Tool speichert pro Kampagne getrennt.
- **Tagebuch**: Einträge pro Session und pro Tag im Spiel, mit Markdown und eingebetteten Anhängen. Ansicht nach Session oder als Zeitleiste nach Spieltag.
- **Soziales Netzwerk**: NPCs mit Rolle, Fraktion, Ort, Status, Notizen und deiner Beziehung zu ihnen. Dazu die Beziehungen der NPCs untereinander, als Liste oder als interaktiver Graph.
- **Aktiver Charakter**: Pro Kampagne gibt es einen aktiven Charakter. „Charakterbogen“ im Menü öffnet direkt seinen Bogen. Spielt nur ein Charakter mit, ist er automatisch aktiv; sonst legst du ihn in der Charakterliste oder im Bogen fest. Wird er ausgetauscht, übernimmt der Ersatz.
- **Meine Charaktere**: Charaktere gehören dir, nicht einer Kampagne.
  - Ein Charakter kann in mehreren Kampagnen spielen. Werte, Stufe und bekannte Zauber gelten überall: Steigt er in einer Kampagne auf, hat er die Stufe auch in den anderen.
  - In der Kampagne weist du Charaktere zu. Stirbt einer, lässt du ihn ausscheiden oder tauschst ihn aus; er bleibt im Verlauf der Kampagne unter „Ehemalige“.
  - Eine **Kopie (Fork)** übernimmt Bogen und Zauber, ist danach aber eigenständig. Änderungen an der Kopie wirken nicht auf das Original. Auf Wunsch ersetzt die Kopie das Original direkt in ausgewählten Kampagnen.
- **Charakterbogen**: Attribute, Rettungswürfe, Fertigkeiten, Angriffe, TP, Zustände, Erschöpfung, Ressourcen, Zauberplätze, Inventar und Rasten. Mit Anhängen auch ein Porträt; es erscheint auf der Charakterkarte und wird bei einer Kopie des Charakters mitkopiert.
  - **Digital würfeln** oder **mit echten Würfeln**: Du tippst auf ein Attribut, im Dialog auf die gewürfelte Zahl (1–20), und die App rechnet das Ergebnis aus. Das gilt für Attributs- und Rettungswürfe, Fertigkeiten, Initiative, Angriffe mit Schaden (auch kritisch), Zauber und Todesrettungswürfe.
  - Vorteil und Nachteil werden unterstützt, ebenso die Erschöpfung nach 2014- oder 2024-Regeln.
  - **Fähigkeiten selbst konfigurieren**: Klassenmerkmale, Herkunft, Talente, Ausrüstung usw. Pro Eintrag legst du fest:
    - Kategorie und eigene Schlagworte
    - Einsatz (vor der Aktion, Aktion, Bonusaktion, Reaktion, frei, passiv)
    - wie oft einsetzbar (pro Zug, Rast, Tagesanbruch) oder welche Ressource verbraucht wird
    - Wirkung (Buff, Fluff, Schaden, Heilung …), Ziel, Nutzen, Bedingung und Dauer
    - Auslöser (beim Angriff, bei Treffer …) und für welche Waffen sie gilt
    - Schaden mit fester Schadensart oder **wie der auslösende Angriff** (Waffe oder Zauber), als Zuschlag auf den Angriffsschaden oder als **eigener Wurf gegen ein weiteres Ziel**. Beispiel: Weit ausholender Angriff macht 1W8 gegen eine zweite Kreatur, mit der Schadensart der Waffe.
    - **Würfe verändern**: Angriffs-, Schadens-, Attributs-, Fertigkeits-, Rettungs-, Initiative- und Todesrettungswürfe, mit Zahl oder Würfel (z. B. +2, 1W4, −1W4) und Vorteil/Nachteil, optional nur für ein Attribut oder eine Fertigkeit. Passive und aktive Fähigkeiten wirken automatisch; Fähigkeiten ohne Dauer (frei, vor der Aktion, Reaktion) wählst du im Würfeldialog dazu, auch nach dem Wurf.
    - **Abhängigkeiten**: Eine Fähigkeit kann Nutzungen einer anderen verbrauchen, beim Einsetzen oder erst „wenn es gelingt“. Beispiel: Taktisches Verständnis zeigt die Verknüpfung zu Durchschnaufen und verbraucht dessen Nutzung erst, wenn du „Gelungen“ antippst.
    - **Rüstungsklasse**: z. B. +5 (Schild), Grund-RK + GES (Magierrüstung) oder Mindest-RK (Rindenhaut), solange die Fähigkeit wirkt.
    - Vorlagen für häufige Fähigkeiten helfen beim Einstieg.
  - **Waffen mit Spezialitäten**: Nah- oder Fernkampf, Reichweite, Eigenschaften (Finesse, Schwer, Vielseitig …), Zusatzschaden und Meisterschaft (2024). Angriffe erscheinen als Karten wie die Fähigkeiten; Löschen steckt in den aufgeklappten Details.
    - Finesse: Beim Angriff wählst du STR oder GES, vorgeschlagen wird der bessere Wert.
    - Leichte Waffen: Nach einem Angriff mit einer leichten Waffe bietet der Assistent den Zusatzangriff mit einer zweiten leichten Waffe an (Bonusaktion, 2024 mit Einkerben als Teil der Angriffsaktion), ohne positiven Attributsmodifikator beim Schaden. Mit dem Kampfstil Zwei-Waffen-Kampf zählt er doch. 2014 nur mit leichten Nahkampfwaffen.
  - **Rüstung & Schilde**: Rüstungen (leicht, mittelschwer, schwer) und Schilde aus Vorlagen oder selbst erfasst. Die RK wird berechnet: angelegte Rüstung mit GES-Grenze, Schild, ungerüstete Verteidigung (Barbar, Mönch), sonstiger Bonus und aktive Effekte. Den Schild nimmst du im Kampf auf oder legst ihn ab. Zauber wie Magierrüstung, Schild oder Schild des Glaubens wirken nach dem Wirken auf die RK. Temporäre Boni von Mitspielern trägst du über die RK-Anzeige ein. Ältere Bögen behalten ihre feste RK, bis du auf „berechnet“ umstellst.
  - **Kampf-Assistent**:
    - verfolgt Runden, Aktion, Bonusaktion, Reaktion, Bewegung und laufende Effekte samt Dauer und Konzentration
    - schlägt Fähigkeiten, Angriffe und Zauber vor, gruppiert nach *vor der Aktion / Aktion / Bonusaktion / Reaktion / frei* und filterbar nach Kategorie und Wirkung
    - Angriff mit einer Waffe: Der Assistent schlägt passende Fähigkeiten vor (z. B. Vorteil oder Bonus vor dem Wurf, Zusatzschaden bei Treffer) und rechnet sie in Treffer- und Schadenswurf ein.
- **Bibliothek & Freunde**: Fähigkeiten, Angriffe, Rüstungen und Zauber nimmst du per „In Bibliothek“ in deine eigene Bibliothek auf und übernimmst sie bei anderen Charakteren mit „Aus Bibliothek“. Einträge sind Kopien; Verweise auf Ressourcen, verknüpfte Fähigkeiten und bestimmte Waffen werden über den Namen wieder zugeordnet.
  - Freunde fügst du über einen persönlichen Freundescode oder Einladungslink hinzu; die Freundschaft gilt, wenn die andere Person annimmt. Eine Suche über alle Benutzer gibt es nicht.
  - Teilst du deine Bibliothek, können alle Freunde sie durchsuchen und Einträge mit „In eigene Bibliothek aufnehmen“ kopieren.
- **Zauberbuch**: Zauber aus dem SRD übernehmen oder eigene anlegen. Zauber eines Charakters wandern mit ihm in jede Kampagne; Zauber ohne Charakter bleiben Notizen der Kampagne. Zauber kannst du vorbereiten und Charakteren zuordnen. Zauberangriffe, Schaden und Heilung würfelst du direkt, inklusive Hochstufen und Zaubertrick-Skalierung. Zauberplätze lassen sich direkt verbrauchen.
- **Anhänge**: Bilder und PDFs pro Kampagne, etwa Karten, Szenenbilder, Fotos von Notizen und vom Spieltisch, Regel- und Abenteuer-PDFs. Auf dem Smartphone direkt mit der Kamera. Fotos werden beim Hochladen gedreht, verkleinert und von Metadaten (GPS, Kamera) befreit. PDFs bekommen ein Vorschaubild der ersten Seite, das der Browser mit pdf.js erzeugt (der Server rendert keine PDFs). In Tagebuch- und NPC-Texten fügt „Datei einfügen“ Bilder (`![Titel](attachment:<id>)`) und Links auf PDFs (`[Titel](attachment:<id>)`) ein. Bilder von fremden Servern werden in Texten nicht geladen. NPCs können ein Bild haben, das in Liste und Graph erscheint. Vor dem Löschen eines Anhangs warnt die App, wenn er noch verwendet wird. Braucht einen S3-Bucket, siehe [Anhänge](#anhänge-s3-speicher).

- **Einheiten**: Im Profil wählst du imperial (ft, lb) oder metrisch (m, kg). Metrisch rechnet die App nach der Konvention der deutschen Regelwerke um (5 ft = 1.5 m). Das betrifft Bewegung, Reichweiten, Zaubertexte und Fähigkeiten.
- **Einheitenrechner**: über eine Lasche am Bildschirmrand als Overlay. Er rechnet Länge, Strecke, Gewicht, Volumen, Felder, Runden/Minuten, Temperatur und Münzen um, wahlweise mit Spieltisch-Werten oder exakt. Im Profil lässt er sich komplett ausblenden.

Zwischen den Tools wechselst du ab Tablet-Breite über die Seitenleiste, auf dem Smartphone über die untere Navigation.

## Datenschutz

Gespeichert werden ausschliesslich Anwendungsdaten:

| Gespeichert | Nicht gespeichert |
| --- | --- |
| Telegram-ID (Zahl) zur Wiedererkennung | IP-Adressen, Zugriffsprotokolle, Tracking |
| Anzeigename (änderbar) | Telegram-Benutzername, Telefonnummer, Profilbild |
| Einstellungen (Farbschema, Würfelmodus, Einheiten) | Sitzungen auf dem Server (signiertes Cookie im Browser) |
| Deine Inhalte (Kampagnen, Tagebuch, NPCs, Bögen, Zauber) | Würfelverlauf |
| Anhänge im S3-Bucket (Bilder ohne Metadaten, PDFs unverändert) | Dateinamen im Speicher (nur in der Datenbank) |
| Login-Codes, maximal 5 Minuten lang | |
| Freundescode, Freundschaften und Bibliothek (inkl. Freigabe) | Wer wessen Bibliothek angesehen hat |
| Missbrauchs-Ereignisse, nur wenn ein Limit greift (90 Tage) | IP-Adressen auch dort nicht |
| Sperrstatus und Entsperr-Anträge | |

Löschst du dein Konto im Profil, entfernt die Datenbank sofort alle zugehörigen Zeilen (`ON DELETE CASCADE`). Es bleibt nichts zurück. Dateien im S3-Bucket merkt ein Trigger beim Löschen vor; ein Hintergrundjob entfernt sie innerhalb weniger Minuten. Im Profil kannst du ausserdem alle deine Daten als JSON exportieren, mit Anhängen auch als ZIP (`daten.json` und die Dateien, geordnet nach Kampagne und Charakter).

## Schnellstart mit Docker

```bash
cp .env.example .env
# APP_SECRET setzen (openssl rand -hex 32), Telegram-Bot eintragen,
# eigene Telegram-ID in TELEGRAM_ALLOWED_IDS
# In docker-compose.yml das DB-Passwort "change-me" an beiden Stellen ändern
docker compose up -d --build
```

Die App läuft danach auf Port 3000. Datenbank-Migrationen spielt sie beim Start automatisch ein.
Stelle einen Reverse Proxy mit HTTPS davor, z. B. Caddy:

```
dnd.example.org {
  reverse_proxy localhost:3000
}
```

> In Produktion wird das Sitzungs-Cookie nur über HTTPS gesendet. Für einen reinen HTTP-Test im LAN setzt du `SECURE_COOKIES=0`.

### Deployment auf Coolify (oder einer ähnlichen PaaS)

1. PostgreSQL als eigene Ressource anlegen (nicht öffentlich).
2. Die App aus dem Repo anlegen: Build-Pack **Dockerfile**, Port **3000**, Domain mit `https://`.
3. Umgebungsvariablen setzen: `APP_SECRET` (`openssl rand -hex 32`), `DATABASE_URL` (die *interne* URL der Datenbank) und die Telegram-Variablen.
4. Health-Check: Pfad `/api/health`. Das Dockerfile bringt einen eigenen Check mit; ein Plattform-Check auf `localhost` funktioniert ebenfalls, weil der Server standardmäßig auf IPv4 und IPv6 lauscht.
5. Deployen. Migrationen laufen beim Start automatisch.

Betreibst du mehrere Instanzen (z. B. Test und Produktion), braucht jede ihren eigenen Bot, siehe unten. Die Test-Instanz deployt den Branch `test`, die Produktion den Branch `main` (siehe [Branches und Releases](#branches-und-releases)).

### Anhänge (S3-Speicher)

Anhänge liegen in einem S3-kompatiblen Object Storage. Ohne `S3_BUCKET` ist die Funktion aus und das Tool erscheint nicht.

- **Hetzner Object Storage**: In der Hetzner-Konsole einen Bucket anlegen, am Standort des Servers (z. B. `fsn1`) und **privat**. CORS braucht es nicht, die App liefert die Dateien selbst aus. Unter *Security → S3 Credentials* Zugangsdaten erzeugen. Sie gelten für das ganze Hetzner-Projekt, Test und Produktion deshalb in getrennten Projekten anlegen. Dann `S3_ENDPOINT=https://fsn1.your-objectstorage.com`, `S3_REGION=fsn1`, `S3_BUCKET` und die beiden Schlüssel setzen.
- **Empfohlen**: im Bucket eine Lifecycle-Regel, die abgebrochene Multipart-Uploads nach einem Tag löscht. Hetzner sichert den Bucket nicht. Für ein Backup ihn z. B. mit `rclone sync` an einen zweiten Standort spiegeln.
- **Selbst betrieben**: `docker-compose.yml` bringt SeaweedFS mit (MinIO wird nicht mehr gepflegt).

Beim Start prüft die App den Bucket und meldet im Log, wenn er nicht erreichbar ist. Verwaiste Objekte (z. B. nach einem Absturz beim Hochladen) räumt sie täglich auf.

## Telegram-Bot einrichten

Die Anmeldung funktioniert wie bei [filahub](https://github.com/GrimbiXcode/filahub):

1. Schreibe [@BotFather](https://t.me/BotFather) `/newbot` und trage Token und Benutzernamen in `.env` ein (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
2. Starte die App und schreibe deinem Bot `/id`. Er antwortet mit deiner Telegram-ID. Trage sie in `TELEGRAM_ALLOWED_IDS` ein und starte neu. Mehrere IDs trennst du mit Kommas.
3. **Anmelden mit Login-Code (Standard):** Schreibe dem Bot `/login`. Er schickt einen 6-stelligen Code, der 5 Minuten gilt. Diesen Code gibst du auf der Startseite ein. Die App fragt den Bot per Long-Polling ab und braucht dafür keinen Webhook und keine öffentliche Adresse.
4. **Optional: Telegram-Login-Button.** Der offizielle Button lädt erst nach Zustimmung, weil dabei Daten an telegram.org fliessen. Dafür braucht der Bot bei BotFather die Domain: `/setdomain` → `dnd.example.org`.

Ohne Freigabeliste und ohne `TELEGRAM_OPEN_REGISTRATION=1` kann sich niemand anmelden. So entsteht keine offene Instanz, nur weil eine Variable fehlt. Ist `TELEGRAM_ALLOWED_IDS` gesetzt, gilt nur die Liste – `TELEGRAM_OPEN_REGISTRATION` wird dann ignoriert.

> **Ein Bot pro Instanz.** Die App holt Nachrichten per Long-Polling ab; zwei Instanzen mit demselben Token nehmen sich die Updates gegenseitig weg (Telegram antwortet mit 409). Ausserdem kennt ein Bot nur eine Domain für den Login-Button. Für Test und Produktion legst du also zwei Bots an.

## Verwaltung und Missbrauchsschutz

### Wer Admin ist

- `OWNER_TELEGRAM_ID` gesetzt: Dieses Konto wird bei jeder Anmeldung Admin.
- Sonst, mit Freigabeliste (`TELEGRAM_ALLOWED_IDS`): der allererste Benutzer.
- Bei offener Registrierung ohne `OWNER_TELEGRAM_ID` wird **niemand** automatisch Admin – sonst wäre es der erste Fremde. Der Server warnt beim Start.

Rechte vergeben oder entziehen lässt sich nur in der Datenbank (`users.role`). Admins sehen in der Navigation **Verwaltung** (`/verwaltung`):

- **Nutzer**: Konten mit Anzeigename, Erstellungsdatum, Anzahl Kampagnen/Charaktere und Status; sperren (mit Grund) und freischalten. Telegram-IDs und Inhalte sind dort nicht sichtbar. Sich selbst und andere Admins kann man nicht sperren.
- **Entsperr-Anträge**: annehmen (entsperrt sofort) oder ablehnen (mit Begründung, geht per Telegram an die Person).
- **Missbrauch**: Kennzahlen mit Alarmschwellen, Rate-Limit- und Obergrenzen-Treffer, neue Konten pro Tag, auffälligste Konten.
- **System**: Versionen, Datenbankgrösse, Tabellen, Migrationen, Obergrenzen, Anhänge (Anzahl, Speicher, offene Löschungen).

### Sperren

Eine Sperre meldet das Konto sofort überall ab. Danach kann sich die Person zwar anmelden, sieht aber nur eine Sperrseite: Daten exportieren (auch als ZIP mit Anhängen), Konto löschen, Entsperrung beantragen (höchstens ein offener Antrag, drei pro Tag). Über Sperre, Freischaltung und abgelehnte Anträge informiert der Bot.

### Limits

| Was | Grenze |
| --- | --- |
| Anfragen pro Konto | 600 / Minute |
| Änderungen (POST/PUT/PATCH/DELETE) | 120 / Minute |
| Neue Einträge (POST) | 300 / Stunde |
| ZIP-Export mit Anhängen | 5 / Stunde |
| Neue Konten pro IP | 3 / Tag (nur im Arbeitsspeicher gezählt) |
| Neue Konten insgesamt bei offener Registrierung | 20 / Tag |
| Kampagnen / Charaktere pro Konto | 100 / 300 |
| Tagebucheinträge / NPCs / Beziehungen / Zauber pro Kampagne | 5000 / 2000 / 5000 / 2000 |
| Zauber pro Charakter | 1000 |
| Anhänge pro Kampagne / pro Charakter | 1000 / 200 |
| Speicher für Anhänge pro Konto | 2 GB |
| Grösse pro Datei | Bilder 25 MB, PDFs 100 MB |

Die Grenzen stehen in `server/src/lib/abuse.ts` und sind so gewählt, dass normale Runden sie nie erreichen. Die Rate-Limits zählen im Arbeitsspeicher, also pro laufender Instanz.

### Alarm

Alle 15 Minuten (nur in Produktion) prüft der Server die Schwellen: 100 Rate-Limit-Treffer pro Stunde, 50 erreichte Obergrenzen pro Tag, 10 abgewiesene Registrierungen pro Tag, 5 offene Entsperr-Anträge. Wird eine erreicht, schickt der Bot allen Admins eine Nachricht – pro Schwelle höchstens alle 6 Stunden. Mit `APP_BASE_URL` enthält sie einen Link zur Verwaltung.

## Konfiguration

Alle Variablen sind in [`.env.example`](.env.example) beschrieben.

| Variable | Bedeutung |
| --- | --- |
| `APP_SECRET` | Secret für die Sitzungs-Cookies (Pflicht in Produktion, mind. 32 Zeichen) |
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Telegram-Bot |
| `TELEGRAM_ALLOWED_IDS` | Freigegebene Telegram-IDs (hat Vorrang vor der offenen Registrierung) |
| `TELEGRAM_OPEN_REGISTRATION` | Anmeldung für alle öffnen; wirkt nur bei leerer Freigabeliste |
| `OWNER_TELEGRAM_ID` | Telegram-ID des Betreibers, wird Admin (bei offener Registrierung nötig) |
| `APP_BASE_URL` | Öffentliche Adresse, z. B. `https://dnd.example.org`, für Links in Bot-Nachrichten |
| `HOST` | Lauschadresse, Standard `::` (IPv4 + IPv6), ohne IPv6 automatisch `0.0.0.0` |
| `PORT`, `SECURE_COOKIES`, `TRUST_PROXY`, `APP_NAME` | Betrieb |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3-Speicher für Anhänge (ohne Bucket: Anhänge aus) |
| `S3_FORCE_PATH_STYLE`, `S3_CREATE_BUCKET` | Für SeaweedFS: Pfad-Adressierung, Bucket beim Start anlegen |
| `DEV_LOGIN` | Nur Entwicklung: Anmeldung ohne Telegram |

## Entwicklung

Voraussetzungen: Node.js ≥ 22 und PostgreSQL.

```bash
npm install
# Datenbank, z. B.: createdb dungeonbuddy (Standard-URL: postgres://dnd:dnd@localhost:5432/dungeonbuddy)
echo "DEV_LOGIN=1" >> .env
# Optional, für Anhänge: SeaweedFS starten und die S3_*-Werte aus .env.example übernehmen
docker compose up -d s3
PORT=3100 npm run dev:server   # API auf :3100, Migrationen laufen automatisch
npm run dev:web                # Vite auf :5173 mit Proxy auf /api
```

| Befehl | |
| --- | --- |
| `npm run build` | Frontend und Backend bauen |
| `npm run check` | TypeScript- und Svelte-Prüfung |
| `npm test` | Tests (Backend-Integrationstests brauchen eine Test-DB, siehe `server/vitest.config.ts`) |
| `npm run srd -- /pfad/zu/5e-database` | SRD-Zauberlisten neu erzeugen |

### Branches und Releases

| Branch | Zweck | Deployt auf |
| --- | --- | --- |
| `main` | Freigegebener Stand | Produktion |
| `test` | Staging, sammelt fertige Features | Test-System |
| Feature-Branches | Einzelne Änderungen | – |

1. Feature-Branches werden **ab `test`** erstellt und per Pull Request **wieder in `test`** gemergt.
2. Der Merge löst das Deployment auf dem Test-System aus. Dort wird die Änderung geprüft.
3. Erst nach der Freigabe wird `test` per Pull Request in `main` gemergt und damit in Produktion deployt.

Auf `main` und `test` wird nie direkt gepusht, Feature-Branches gehen nie direkt nach `main`.

### Aufbau

```
server/   Node.js (Fastify, postgres.js, zod, jose)
  migrations/     SQL-Migrationen (beim Start automatisch)
  data/srd/       Zauberlisten SRD 5.1 (2014) und SRD 5.2 (2024)
  src/auth/       Telegram-Bot (Long-Polling), Login-Widget, Sitzungen
  src/routes/     Konto, Kampagnen, Tools, Anhänge, SRD
web/      Svelte 5 + Vite, PWA (vite-plugin-pwa)
  src/lib/        API, Router, D&D-Regeln, Würfel, Charaktermodell
  src/pages/      Landing, Dashboard, Profil, Kampagnen-Layout
  src/tools/      Tagebuch, Netzwerk, Charakterbogen, Zauberbuch, Anhänge
```

Das Backend liefert das gebaute Frontend aus. Image und Container sind deshalb jeweils nur einer. Die Content-Security-Policy erlaubt keine Inline-Skripte und kein `eval`. Die einzige Ausnahme ist das Rahmendokument für den Telegram-Login-Button (`web/public/telegram-login.html`).

## Lizenz der Spielinhalte

Dieses Projekt enthält Material aus dem System Reference Document 5.1 und 5.2 von Wizards of the Coast LLC, verfügbar unter https://www.dndbeyond.com/srd und lizenziert unter der [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode). Die Zauberdaten stammen aufbereitet aus [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT). Die Zaubertexte sind daher englisch.

Die Icons im Adventurer-Modus stammen von [game-icons.net](https://game-icons.net) (Lorc, Delapouite und weitere) und stehen unter der [Creative Commons Attribution 3.0 License](https://creativecommons.org/licenses/by/3.0/). Sie liegen als Pfaddaten in `web/src/lib/icons/gameIcons.ts`.

Dungeon Buddy ist ein inoffizielles Fanprojekt und steht in keiner Verbindung zu Wizards of the Coast.
