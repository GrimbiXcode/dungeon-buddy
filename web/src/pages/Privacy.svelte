<script lang="ts">
  import Logo from "../components/Logo.svelte";
  import { session } from "../lib/session.svelte";
</script>

<div class="page">
  <a href="/"><Logo /></a>
  <h1>Datenschutz</h1>
  <p>
    Dungeon Buddy ist eine selbst gehostete Anwendung. Verantwortlich für die Daten ist, wer diese Instanz
    betreibt.
  </p>
  <h2>Was gespeichert wird</h2>
  <ul>
    <li>Deine <strong>Telegram-ID</strong> (Zahl), um dich bei der nächsten Anmeldung wiederzuerkennen.</li>
    <li>Dein <strong>Anzeigename</strong> (bei der ersten Anmeldung aus Telegram übernommen, jederzeit änderbar).</li>
    <li>Deine <strong>Einstellungen</strong> (Farbschema, Würfelmodus, Einheiten, zuletzt geöffnete Kampagne).</li>
    <li>Die <strong>Inhalte</strong>, die du selbst anlegst: Kampagnen, Tagebucheinträge, NPCs, Charakterbögen, Zauber.</li>
    <li>
      Kurzlebige <strong>Login-Codes</strong> des Telegram-Bots (max. 5 Minuten, danach oder beim Einlösen gelöscht).
    </li>
  </ul>
  <h2>Was nicht gespeichert wird</h2>
  <ul>
    <li>Keine IP-Adressen, keine Zugriffsprotokolle, kein Tracking, keine Analyse-Tools.</li>
    <li>Kein Telegram-Benutzername, keine Telefonnummer, kein Profilbild.</li>
    <li>Keine Sitzungsdaten auf dem Server – die Anmeldung steckt in einem signierten Cookie in deinem Browser.</li>
  </ul>
  <h2>Löschen &amp; Auskunft</h2>
  <p>
    Im Profil kannst du alle deine Daten als JSON exportieren und dein Konto löschen. Beim Löschen werden alle
    zugehörigen Daten sofort aus der Datenbank entfernt.
  </p>
  <h2>Telegram</h2>
  <p>
    Für die Anmeldung schreibst du dem Bot über Telegram. Optional kann der offizielle Telegram-Login-Button
    geladen werden – erst nach deiner Zustimmung, da dabei Daten (z. B. IP-Adresse) an Telegram übertragen werden.
  </p>
  <p><a href="/">← {session.user ? "Zur Übersicht" : "Zur Startseite"}</a></p>
</div>

<style>
  .page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { margin-top: 1.5rem; }
  h2 { margin-top: 1.5rem; font-size: 1.1rem; }
  li { margin-bottom: 0.35rem; }
</style>
