<script lang="ts">
  import { BookOpen, KeyRound, ScrollText, Send, ShieldCheck, Sparkles, Users, Wand } from "@lucide/svelte";
  import Logo from "../components/Logo.svelte";
  import { post } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { toastError } from "../lib/toast.svelte";
  import type { User } from "../lib/types";

  const WIDGET_CONSENT_KEY = "db-telegram-widget-consent";
  const FRAME_SOURCE = "dungeon-buddy-telegram-login";

  let code = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let widgetConsent = $state(readConsent());
  let frame: HTMLIFrameElement | undefined = $state();
  let frameSize = $state({ width: 240, height: 40 });

  const info = $derived(session.info);
  const bot = $derived(info?.botUsername);
  const dark = $derived(document.documentElement.dataset.mode === "dark");

  function readConsent() {
    try {
      return localStorage.getItem(WIDGET_CONSENT_KEY) === "1";
    } catch {
      return false;
    }
  }

  async function finish(promise: Promise<User>) {
    busy = true;
    error = null;
    try {
      session.user = await promise;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function submitCode(e: SubmitEvent) {
    e.preventDefault();
    void finish(post<User>("/api/auth/code", { code: code.trim() }));
  }

  function acceptWidget() {
    try {
      localStorage.setItem(WIDGET_CONSENT_KEY, "1");
    } catch {
      /* ignorieren */
    }
    widgetConsent = true;
  }

  // Nachrichten aus dem Telegram-Rahmen (public/telegram-login.js)
  $effect(() => {
    if (!widgetConsent) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
      const data = event.data as { source?: string; kind?: string; width?: number; height?: number; user?: unknown };
      if (data?.source !== FRAME_SOURCE) return;
      if (data.kind === "size" && data.width && data.height) {
        frameSize = { width: Math.ceil(data.width), height: Math.ceil(data.height) };
      } else if (data.kind === "auth" && data.user) {
        void finish(post<User>("/api/auth/widget", data.user));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const tools = [
    { icon: ScrollText, title: "Tagebuch", text: "Halte fest, was in jeder Session und an jedem Tag im Spiel passiert ist." },
    { icon: Users, title: "Soziales Netzwerk", text: "NPCs, Fraktionen und wer mit wem – inklusive Beziehungsgraph." },
    { icon: BookOpen, title: "Charakterbogen", text: "Komplett digital oder als Würfelhilfe: Tippe dein Würfelergebnis, die App rechnet." },
    { icon: Wand, title: "Zauberbuch", text: "Zauber aus dem SRD 5.1 & 5.2 übernehmen, vorbereiten und direkt würfeln." },
  ];

  function devLogin() {
    void finish(post<User>("/api/auth/dev")).catch(toastError);
  }
</script>

<div class="landing">
  <header class="row-between">
    <Logo size={32} />
    <a href="/datenschutz" class="small muted">Datenschutz</a>
  </header>

  <section class="hero">
    <div class="intro">
      <span class="badge badge-accent"><Sparkles size={13} /> D&amp;D 5e · 2014 &amp; 2024</span>
      <h1>Deine Toolbox für den Spieltisch.</h1>
      <p class="lead muted">
        Tagebuch, NPC-Netzwerk, Charakterbogen und Zauberbuch – pro Kampagne getrennt, selbst gehostet und ohne
        Datensammelei.
      </p>
      <ul class="facts small muted">
        <li><ShieldCheck size={15} /> Nur deine Spieldaten werden gespeichert – Konto löschen heisst: alles weg.</li>
        <li><Send size={15} /> Anmeldung über Telegram, kein Passwort.</li>
      </ul>
    </div>

    <div class="card login">
      <h2>Anmelden</h2>
      {#if !info}
        <p class="muted small">Server nicht erreichbar.</p>
      {:else if !info.botConfigured}
        <p class="muted small">
          Auf dieser Instanz ist noch kein Telegram-Bot eingerichtet. Der Betreiber muss
          <code>TELEGRAM_BOT_TOKEN</code> und <code>TELEGRAM_BOT_USERNAME</code> setzen.
        </p>
      {:else}
        <ol class="steps small">
          <li>
            Öffne <a href="https://t.me/{bot}" target="_blank" rel="noreferrer">@{bot}</a> in Telegram und sende
            <code>/login</code>.
          </li>
          <li>Gib den 6-stelligen Code hier ein:</li>
        </ol>
        <form onsubmit={submitCode} class="code-form">
          <input
            class="input code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="123456"
            aria-label="Login-Code"
            bind:value={code}
          />
          <button class="btn btn-primary" disabled={busy || code.trim().length !== 6}>
            <KeyRound size={16} /> Anmelden
          </button>
        </form>

        <div class="or small muted"><span>oder</span></div>

        {#if widgetConsent}
          <iframe
            bind:this={frame}
            title="Mit Telegram anmelden"
            src="/telegram-login.html?bot={encodeURIComponent(bot ?? '')}&theme={dark ? 'dark' : 'light'}"
            style="width:{frameSize.width}px;height:{frameSize.height}px"
          ></iframe>
        {:else}
          <div class="consent">
            <p class="tiny muted">
              Der Telegram-Login-Button wird von telegram.org geladen. Dabei erfährt Telegram deine IP-Adresse. Der
              Weg über den Bot-Code oben kommt ohne aus.
            </p>
            <button class="btn" onclick={acceptWidget}><Send size={16} /> Telegram-Button laden</button>
          </div>
        {/if}
      {/if}

      {#if info?.devLogin}
        <button class="btn btn-ghost dev" onclick={devLogin}>Entwicklungs-Login (ohne Telegram)</button>
      {/if}
      {#if error}<p class="error small">{error}</p>{/if}
    </div>
  </section>

  <section class="tools">
    {#each tools as tool (tool.title)}
      <div class="card tool">
        <tool.icon size={22} />
        <h3>{tool.title}</h3>
        <p class="muted small">{tool.text}</p>
      </div>
    {/each}
  </section>

  <footer class="tiny faint center">
    Enthält Material aus dem System Reference Document 5.1 und 5.2 von Wizards of the Coast LLC, lizenziert unter
    CC-BY-4.0. Dungeon Buddy ist ein Fanprojekt und steht in keiner Verbindung zu Wizards of the Coast.
  </footer>
</div>

<style>
  .landing {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.2rem 1rem 2rem;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }
  .hero {
    display: grid;
    gap: 2rem;
    align-items: center;
    grid-template-columns: 1fr;
    padding-top: 1rem;
  }
  @media (min-width: 860px) {
    .hero { grid-template-columns: 1.2fr 1fr; padding-top: 3rem; }
  }
  h1 { font-size: clamp(2rem, 5vw, 3.1rem); margin: 0.8rem 0; }
  .lead { font-size: 1.1rem; max-width: 34rem; }
  .facts { list-style: none; padding: 0; margin: 1.2rem 0 0; display: grid; gap: 0.45rem; }
  .facts li { display: flex; gap: 0.5rem; align-items: center; }
  .login { padding: 1.4rem; box-shadow: var(--shadow); }
  .steps { padding-left: 1.2rem; margin: 0 0 0.8rem; display: grid; gap: 0.3rem; }
  .code-form { display: flex; gap: 0.5rem; }
  .code { font-size: 1.3rem; letter-spacing: 0.3em; text-align: center; font-variant-numeric: tabular-nums; }
  .or { display: flex; align-items: center; gap: 0.7rem; margin: 1.1rem 0; }
  .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  iframe { display: block; margin: 0 auto; border: 0; max-width: 100%; }
  .consent { display: grid; gap: 0.5rem; padding: 0.8rem; border: 1px dashed var(--border); border-radius: var(--radius-sm); }
  .dev { width: 100%; margin-top: 1rem; }
  .error { color: var(--danger); margin: 0.8rem 0 0; }
  code { background: var(--surface-2); padding: 0.05em 0.35em; border-radius: 4px; }
  .tools { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .tool { color: var(--accent-text); }
  .tool h3 { color: var(--text); margin-top: 0.6rem; }
  footer { margin-top: auto; max-width: 46rem; align-self: center; }
</style>
