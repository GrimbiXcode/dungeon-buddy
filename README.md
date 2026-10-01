# 🎲 Dungeon Buddy

Selbst gehostete Toolbox für **D&D 5e**, kompatibel mit den Regeln von **2014** (SRD 5.1) und **2024** (SRD 5.2).
Als Web-App für Smartphone, Tablet und Desktop, installierbar als PWA.

- **Kampagnen**: Lege die Kampagnen an, in denen du spielst, mit Name, Beschreibung, Regelversion und Farbschema. Du kannst sie bearbeiten, archivieren und löschen. Jedes Tool speichert pro Kampagne getrennt.
- **Tagebuch**: Einträge pro Session und pro Tag im Spiel, mit Markdown. Ansicht nach Session oder als Zeitleiste nach Spieltag.
- **Soziales Netzwerk**: NPCs mit Rolle, Fraktion, Ort, Status, Notizen und deiner Beziehung zu ihnen. Dazu die Beziehungen der NPCs untereinander, als Liste oder als interaktiver Graph.
- **Charakterbogen**: Attribute, Rettungswürfe, Fertigkeiten, Angriffe, TP, Zustände, Erschöpfung, Ressourcen, Zauberplätze, Inventar und Rasten.
  - **Digital würfeln** oder **mit echten Würfeln**: Du tippst auf ein Attribut, im Dialog auf die gewürfelte Zahl (1–20), und die App rechnet das Ergebnis aus. Das gilt für Attributs- und Rettungswürfe, Fertigkeiten, Initiative, Angriffe mit Schaden (auch kritisch), Zauber und Todesrettungswürfe.
  - Vorteil und Nachteil werden unterstützt, ebenso die Erschöpfung nach 2014- oder 2024-Regeln.
  - **Fähigkeiten selbst konfigurieren**: Klassenmerkmale, Herkunft, Talente, Ausrüstung usw. Pro Eintrag legst du fest:
    - Kategorie und eigene Schlagworte
    - Einsatz (vor der Aktion, Aktion, Bonusaktion, Reaktion, frei, passiv)
    - wie oft einsetzbar (pro Zug, Rast, Tagesanbruch) oder welche Ressource verbraucht wird
    - Wirkung (Buff, Fluff, Schaden, Heilung …), Ziel, Nutzen, Bedingung und Dauer
    - Auslöser (beim Angriff, bei Treffer …) und für welche Waffen sie gilt, mit Treffer- und Schadensbonus oder Vorteil
    - Vorlagen für häufige Fähigkeiten helfen beim Einstieg.
  - **Waffen mit Spezialitäten**: Nah- oder Fernkampf, Reichweite, Eigenschaften (Finesse, Schwer, Vielseitig …), Zusatzschaden und Meisterschaft (2024).
  - **Kampf-Assistent**:
    - verfolgt Runden, Aktion, Bonusaktion, Reaktion, Bewegung und laufende Effekte samt Dauer und Konzentration
    - schlägt Fähigkeiten, Angriffe und Zauber vor, gruppiert nach *vor der Aktion / Aktion / Bonusaktion / Reaktion / frei* und filterbar nach Kategorie und Wirkung
    - Angriff mit einer Waffe: Der Assistent schlägt passende Fähigkeiten vor (z. B. Vorteil oder Bonus vor dem Wurf, Zusatzschaden bei Treffer) und rechnet sie in Treffer- und Schadenswurf ein.
- **Zauberbuch**: Zauber aus dem SRD übernehmen oder eigene anlegen. Zauber kannst du vorbereiten und Charakteren zuordnen. Zauberangriffe, Schaden und Heilung würfelst du direkt, inklusive Hochstufen und Zaubertrick-Skalierung. Zauberplätze lassen sich direkt verbrauchen.

Zwischen den Tools wechselst du ab Tablet-Breite über die Seitenleiste, auf dem Smartphone über die untere Navigation.

## Datenschutz

Gespeichert werden ausschliesslich Anwendungsdaten:

| Gespeichert | Nicht gespeichert |
| --- | --- |
| Telegram-ID (Zahl) zur Wiedererkennung | IP-Adressen, Zugriffsprotokolle, Tracking |
| Anzeigename (änderbar) | Telegram-Benutzername, Telefonnummer, Profilbild |
| Einstellungen (Farbschema, Würfelmodus) | Sitzungen auf dem Server (signiertes Cookie im Browser) |
| Deine Inhalte (Kampagnen, Tagebuch, NPCs, Bögen, Zauber) | Würfelverlauf |
| Login-Codes, maximal 5 Minuten lang | |

Löschst du dein Konto im Profil, entfernt die Datenbank sofort alle zugehörigen Zeilen (`ON DELETE CASCADE`). Es bleibt nichts zurück. Im Profil kannst du ausserdem alle deine Daten als JSON exportieren.

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

## Telegram-Bot einrichten

Die Anmeldung funktioniert wie bei [filahub](https://github.com/GrimbiXcode/filahub):

1. Schreibe [@BotFather](https://t.me/BotFather) `/newbot` und trage Token und Benutzernamen in `.env` ein (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
2. Starte die App und schreibe deinem Bot `/id`. Er antwortet mit deiner Telegram-ID. Trage sie in `TELEGRAM_ALLOWED_IDS` ein und starte neu. Mehrere IDs trennst du mit Kommas.
3. **Anmelden mit Login-Code (Standard):** Schreibe dem Bot `/login`. Er schickt einen 6-stelligen Code, der 5 Minuten gilt. Diesen Code gibst du auf der Startseite ein. Die App fragt den Bot per Long-Polling ab und braucht dafür keinen Webhook und keine öffentliche Adresse.
4. **Optional: Telegram-Login-Button.** Der offizielle Button lädt erst nach Zustimmung, weil dabei Daten an telegram.org fliessen. Dafür braucht der Bot bei BotFather die Domain: `/setdomain` → `dnd.example.org`.

Ohne Freigabeliste und ohne `TELEGRAM_OPEN_REGISTRATION=1` kann sich niemand anmelden. So entsteht keine offene Instanz, nur weil eine Variable fehlt.

## Konfiguration

Alle Variablen sind in [`.env.example`](.env.example) beschrieben.

| Variable | Bedeutung |
| --- | --- |
| `APP_SECRET` | Secret für die Sitzungs-Cookies (Pflicht in Produktion, mind. 32 Zeichen) |
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Telegram-Bot |
| `TELEGRAM_ALLOWED_IDS` | Freigegebene Telegram-IDs |
| `TELEGRAM_OPEN_REGISTRATION` | Anmeldung für alle öffnen |
| `PORT`, `SECURE_COOKIES`, `TRUST_PROXY`, `APP_NAME` | Betrieb |
| `DEV_LOGIN` | Nur Entwicklung: Anmeldung ohne Telegram |

## Entwicklung

Voraussetzungen: Node.js ≥ 22 und PostgreSQL.

```bash
npm install
# Datenbank, z. B.: createdb dungeonbuddy (Standard-URL: postgres://dnd:dnd@localhost:5432/dungeonbuddy)
echo "DEV_LOGIN=1" >> .env
PORT=3100 npm run dev:server   # API auf :3100, Migrationen laufen automatisch
npm run dev:web                # Vite auf :5173 mit Proxy auf /api
```

| Befehl | |
| --- | --- |
| `npm run build` | Frontend und Backend bauen |
| `npm run check` | TypeScript- und Svelte-Prüfung |
| `npm test` | Tests (Backend-Integrationstests brauchen eine Test-DB, siehe `server/vitest.config.ts`) |
| `npm run srd -- /pfad/zu/5e-database` | SRD-Zauberlisten neu erzeugen |

### Aufbau

```
server/   Node.js (Fastify, postgres.js, zod, jose)
  migrations/     SQL-Migrationen (beim Start automatisch)
  data/srd/       Zauberlisten SRD 5.1 (2014) und SRD 5.2 (2024)
  src/auth/       Telegram-Bot (Long-Polling), Login-Widget, Sitzungen
  src/routes/     Konto, Kampagnen, Tools, SRD
web/      Svelte 5 + Vite, PWA (vite-plugin-pwa)
  src/lib/        API, Router, D&D-Regeln, Würfel, Charaktermodell
  src/pages/      Landing, Dashboard, Profil, Kampagnen-Layout
  src/tools/      Tagebuch, Netzwerk, Charakterbogen, Zauberbuch
```

Das Backend liefert das gebaute Frontend aus. Image und Container sind deshalb jeweils nur einer. Die Content-Security-Policy erlaubt keine Inline-Skripte und kein `eval`. Die einzige Ausnahme ist das Rahmendokument für den Telegram-Login-Button (`web/public/telegram-login.html`).

## Lizenz der Spielinhalte

Dieses Projekt enthält Material aus dem System Reference Document 5.1 und 5.2 von Wizards of the Coast LLC, verfügbar unter https://www.dndbeyond.com/srd und lizenziert unter der [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode). Die Zauberdaten stammen aufbereitet aus [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT). Die Zaubertexte sind daher englisch.

Dungeon Buddy ist ein inoffizielles Fanprojekt und steht in keiner Verbindung zu Wizards of the Coast.
