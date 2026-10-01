<script lang="ts">
  import { Check } from "@lucide/svelte";
  import Modal from "./Modal.svelte";
  import { patch, post } from "../lib/api";
  import { CAMPAIGN_THEMES, RULESETS } from "../lib/themes";
  import { toastError } from "../lib/toast.svelte";
  import type { Campaign, Ruleset } from "../lib/types";

  let {
    campaign = null,
    onclose,
    onsaved,
  }: {
    campaign?: Campaign | null;
    onclose: () => void;
    onsaved: (c: Campaign) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const initial = campaign;
  let name = $state(initial?.name ?? "");
  let description = $state(initial?.description ?? "");
  let theme = $state(initial?.theme ?? "arcane");
  let ruleset = $state<Ruleset>(initial?.ruleset ?? "2024");
  let busy = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      const body = { name, description, theme, ruleset };
      const saved = initial
        ? await patch<Campaign>(`/api/campaigns/${initial.id}`, body)
        : await post<Campaign>("/api/campaigns", body);
      onsaved(saved);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={initial ? "Kampagne bearbeiten" : "Neue Kampagne"} {onclose}>
  <form id="campaign-form" onsubmit={save}>
    <div class="field">
      <label for="c-name">Name</label>
      <input id="c-name" class="input" bind:value={name} required maxlength="120" placeholder="z. B. Fluch des Strahd" />
    </div>
    <div class="field">
      <label for="c-desc">Beschreibung</label>
      <textarea id="c-desc" class="textarea" bind:value={description} maxlength="5000" placeholder="Worum geht es? Wer ist der SL? Wann wird gespielt?"></textarea>
    </div>
    <div class="field">
      <label for="c-rules">Regelversion</label>
      <select id="c-rules" class="select" bind:value={ruleset}>
        {#each RULESETS as r (r.key)}
          <option value={r.key}>{r.name}</option>
        {/each}
      </select>
      <span class="tiny muted">Bestimmt u. a. Zauberliste (SRD 5.1 / 5.2), Erschöpfungsregeln und Begriffe.</span>
    </div>
    <div class="field">
      <span class="label">Farbschema</span>
      <div class="themes">
        {#each CAMPAIGN_THEMES as t (t.key)}
          <button
            type="button"
            class="theme"
            class:active={theme === t.key}
            onclick={() => (theme = t.key)}
            aria-pressed={theme === t.key}
          >
            <span class="swatch" style="background:{t.color}">
              {#if theme === t.key}<Check size={14} />{/if}
            </span>
            <span class="small">{t.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="campaign-form" disabled={busy || !name.trim()}>
      {initial ? "Speichern" : "Kampagne erstellen"}
    </button>
  {/snippet}
</Modal>

<style>
  .themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 0.4rem; }
  .theme {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg);
    cursor: pointer;
    text-align: left;
  }
  .theme.active { border-color: var(--accent); background: var(--accent-soft); }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    flex: none;
    display: grid;
    place-items: center;
    color: #111;
  }
</style>
