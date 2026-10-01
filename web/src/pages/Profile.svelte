<script lang="ts">
  import { Download, LogOut, MonitorSmartphone, Moon, Sun, Trash2 } from "@lucide/svelte";
  import AppShell from "../components/AppShell.svelte";
  import Modal from "../components/Modal.svelte";
  import { del, patch, post } from "../lib/api";
  import { navigate } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { applyColorMode } from "../lib/themes";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { ColorMode, DiceMode, User, UserSettings } from "../lib/types";

  const user = $derived(session.user!);
  // svelte-ignore state_referenced_locally
  let displayName = $state(session.user?.displayName ?? "");
  let showDelete = $state(false);
  let deleteConfirm = $state("");
  let busy = $state(false);

  async function saveSettings(settings: UserSettings) {
    try {
      session.user = await patch<User>("/api/me", { settings });
      if (settings.colorMode) applyColorMode(settings.colorMode);
    } catch (e) {
      toastError(e);
    }
  }

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    try {
      session.user = await patch<User>("/api/me", { displayName });
      toast("Name gespeichert.", "success");
    } catch (err) {
      toastError(err);
    }
  }

  async function logout(all = false) {
    try {
      await post(all ? "/api/auth/logout-all" : "/api/auth/logout");
    } finally {
      session.user = null;
      navigate("/", { replace: true });
    }
  }

  async function deleteAccount() {
    busy = true;
    try {
      await del("/api/me", { confirm: deleteConfirm });
      session.user = null;
      try {
        localStorage.clear();
      } catch {
        /* ignorieren */
      }
      if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
      navigate("/", { replace: true });
      toast("Dein Konto und alle Daten wurden gelöscht.", "success", 6000);
    } catch (e) {
      toastError(e);
    } finally {
      busy = false;
    }
  }

  const colorModes: { key: ColorMode; label: string; icon: typeof Sun }[] = [
    { key: "system", label: "System", icon: MonitorSmartphone },
    { key: "light", label: "Hell", icon: Sun },
    { key: "dark", label: "Dunkel", icon: Moon },
  ];
  const diceModes: { key: DiceMode; label: string; text: string }[] = [
    { key: "digital", label: "Digital würfeln", text: "Die App würfelt für dich." },
    { key: "physical", label: "Echte Würfel", text: "Du würfelst selbst und tippst das Ergebnis an – die App rechnet Boni dazu." },
  ];
</script>

<AppShell>
  <div class="page-header">
    <div>
      <h1>Profil</h1>
      <p class="muted">Einstellungen für dein Konto.</p>
    </div>
  </div>

  <div class="layout">
    <section class="card">
      <h2>Anzeigename</h2>
      <form class="row" onsubmit={saveName}>
        <input class="input grow" bind:value={displayName} maxlength="80" required />
        <button class="btn btn-primary" disabled={!displayName.trim() || displayName === user.displayName}>Speichern</button>
      </form>
      <p class="tiny muted">Angemeldet über Telegram (ID {user.telegramId}).</p>
    </section>

    <section class="card">
      <h2>Darstellung</h2>
      <div class="segmented" role="group" aria-label="Farbschema">
        {#each colorModes as m (m.key)}
          <button
            aria-pressed={(user.settings.colorMode ?? "system") === m.key}
            onclick={() => saveSettings({ colorMode: m.key })}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        {/each}
      </div>
      <p class="tiny muted">Die Akzentfarbe legst du pro Kampagne fest.</p>
    </section>

    <section class="card">
      <h2>Einheiten</h2>
      <div class="segmented" role="group" aria-label="Einheitensystem">
        <button aria-pressed={(user.settings.units ?? "imperial") === "imperial"} onclick={() => saveSettings({ units: "imperial" })}>
          Imperial (ft, lb)
        </button>
        <button aria-pressed={user.settings.units === "metric"} onclick={() => saveSettings({ units: "metric" })}>
          Metrisch (m, kg)
        </button>
      </div>
      <p class="tiny muted">
        Bewegungsrate, Reichweiten und Flächen werden in dieser Einheit angezeigt und eingegeben (Umrechnung wie in den
        deutschen Regelwerken: 5 ft = 1.5 m). Gespeichert wird intern weiterhin in Fuss.
      </p>
      <label class="checkbox calc-toggle">
        <input
          type="checkbox"
          checked={user.settings.unitCalculator !== false}
          onchange={e => saveSettings({ unitCalculator: (e.currentTarget as HTMLInputElement).checked })}
        />
        Einheitenrechner am Bildschirmrand anzeigen
      </label>
    </section>

    <section class="card">
      <h2>Würfeln</h2>
      <p class="small muted">Standard für alle Charakterbögen. Jeder Bogen kann das überschreiben.</p>
      <div class="stack">
        {#each diceModes as m (m.key)}
          <label class="option" class:active={(user.settings.diceMode ?? "digital") === m.key}>
            <input
              type="radio"
              name="dice"
              checked={(user.settings.diceMode ?? "digital") === m.key}
              onchange={() => saveSettings({ diceMode: m.key })}
            />
            <span><strong>{m.label}</strong><span class="block small muted">{m.text}</span></span>
          </label>
        {/each}
      </div>
    </section>

    <section class="card">
      <h2>Sitzungen</h2>
      <div class="row">
        <button class="btn" onclick={() => logout(false)}><LogOut size={16} /> Abmelden</button>
        <button class="btn" onclick={() => logout(true)}><LogOut size={16} /> Auf allen Geräten abmelden</button>
      </div>
    </section>

    <section class="card danger-zone">
      <h2>Deine Daten</h2>
      <p class="small muted">
        Gespeichert werden nur deine Telegram-ID, dein Anzeigename, deine Einstellungen und die Inhalte deiner
        Kampagnen. Keine IP-Adressen, keine Nutzungsprotokolle.
      </p>
      <div class="row">
        <a class="btn" href="/api/me/export" download><Download size={16} /> Alle Daten exportieren (JSON)</a>
        <button class="btn btn-danger" onclick={() => (showDelete = true)}><Trash2 size={16} /> Konto löschen</button>
      </div>
    </section>
  </div>
</AppShell>

{#if showDelete}
  <Modal title="Konto endgültig löschen" size="sm" onclose={() => (showDelete = false)}>
    <p>
      Dein Konto, alle Kampagnen, Tagebücher, NPCs, Charakterbögen und Zauber werden <strong>sofort und
      unwiderruflich</strong> gelöscht. Es bleibt nichts zurück.
    </p>
    <div class="field">
      <label for="del-confirm">Zur Bestätigung LÖSCHEN eingeben</label>
      <input id="del-confirm" class="input" bind:value={deleteConfirm} autocomplete="off" />
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (showDelete = false)}>Abbrechen</button>
      <button class="btn btn-danger" disabled={busy || deleteConfirm !== "LÖSCHEN"} onclick={deleteAccount}>
        <Trash2 size={16} /> Alles löschen
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .layout { display: grid; gap: 1rem; max-width: 720px; }
  section h2 { font-size: 1.05rem; }
  .segmented button { display: inline-flex; align-items: center; gap: 0.35rem; }
  .option {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .option.active { border-color: var(--accent); background: var(--accent-soft); }
  .option input { margin-top: 0.25rem; accent-color: var(--accent-strong); }
  .block { display: block; }
  .calc-toggle { margin-top: 0.4rem; }
  .danger-zone { border-color: color-mix(in oklab, var(--danger) 35%, var(--border)); }
</style>
