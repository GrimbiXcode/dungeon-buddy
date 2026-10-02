<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeftRight, LogOut, Plus, RotateCcw, Trash2, UserPlus, Users } from "@lucide/svelte";
  import CharacterCard from "../components/CharacterCard.svelte";
  import Modal from "../components/Modal.svelte";
  import NewCharacterModal from "../components/NewCharacterModal.svelte";
  import { campaignApi, del, get, patch, post } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { formatDate } from "../lib/format";
  import { navigate } from "../lib/router.svelte";
  import { rulesetLabel } from "../lib/themes";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign, CampaignCharacter, CharacterRecord } from "../lib/types";

  let { campaign }: { campaign: Campaign } = $props();

  const LEAVE_REASONS = ["Gestorben", "Abgereist", "Ruhestand", "Charakterwechsel"];

  let roster = $state<CampaignCharacter[]>([]);
  let mine = $state<CharacterRecord[]>([]);
  let loading = $state(true);

  /** Offene Dialoge */
  let assigning = $state(false);
  let creating = $state<null | "assign" | "replace">(null);
  let replacing = $state<CampaignCharacter | null>(null);
  let leaving = $state<CampaignCharacter | null>(null);
  let reason = $state("Gestorben");
  let markDead = $state(true);
  let replacementId = $state<string | null>(null);

  const base = $derived(campaignApi(campaign.id, "characters"));
  const active = $derived(roster.filter(c => c.active));
  const former = $derived(roster.filter(c => !c.active));
  /** Eigene Charaktere, die hier nicht aktiv sind (für Zuweisen/Austauschen) */
  const available = $derived(mine.filter(m => !active.some(a => a.id === m.id)));

  onMount(load);

  async function load() {
    try {
      [roster, mine] = await Promise.all([get<CampaignCharacter[]>(base), get<CharacterRecord[]>("/api/characters")]);
    } catch (e) {
      toastError(e);
    } finally {
      loading = false;
    }
  }

  async function assign(characterId: string) {
    try {
      await post(base, { characterId });
      assigning = false;
      await load();
      toast("Charakter zugewiesen.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  function openReplace(c: CampaignCharacter) {
    replacing = c;
    reason = "Gestorben";
    markDead = true;
    replacementId = null;
  }

  async function replace(newId: string) {
    if (!replacing) return;
    try {
      await post(`${base}/${replacing.id}/replace`, { replacementId: newId, reason, markDead: markDead && reason === "Gestorben" });
      toast(`${replacing.name} wurde ausgetauscht.`, "success");
      replacing = null;
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  function openLeave(c: CampaignCharacter) {
    leaving = c;
    reason = "Gestorben";
    markDead = true;
  }

  async function leave() {
    if (!leaving) return;
    try {
      await patch(`${base}/${leaving.id}`, { active: false, leftReason: reason });
      if (markDead && reason === "Gestorben") await patch(`/api/characters/${leaving.id}`, { status: "dead" });
      leaving = null;
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function reactivate(c: CampaignCharacter) {
    try {
      await patch(`${base}/${c.id}`, { active: true });
      if (c.status === "dead" && (await confirmDialog(`${c.name} ist als verstorben markiert. Wiederbeleben?`, { title: "Wiederbelebung", confirmLabel: "Wiederbeleben", danger: false }))) {
        await patch(`/api/characters/${c.id}`, { status: "active" });
      }
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function removeFromHistory(c: CampaignCharacter) {
    const ok = await confirmDialog(`${c.name} komplett aus dieser Kampagne entfernen (auch aus dem Verlauf)? Der Charakter selbst bleibt erhalten.`, {
      title: "Aus Kampagne entfernen",
      confirmLabel: "Entfernen",
    });
    if (!ok) return;
    try {
      await del(`${base}/${c.id}`);
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function createdNew(c: CharacterRecord) {
    const mode = creating;
    creating = null;
    if (mode === "replace") await replace(c.id);
    else {
      await assign(c.id);
      navigate(`/k/${campaign.id}/charaktere/${c.id}?bearbeiten=1`);
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Charaktere</h1>
    <p class="muted">Wer in dieser Kampagne mitspielt. Werte und Zauber gehören dem Charakter und gelten in allen seinen Kampagnen.</p>
  </div>
  <div class="row">
    <a class="btn" href="/charaktere"><Users size={16} /> Alle Charaktere</a>
    <button class="btn btn-primary" onclick={() => (assigning = true)}><UserPlus size={16} /> Charakter zuweisen</button>
  </div>
</div>

{#if loading}
  <div class="spinner"></div>
{:else}
  {#if active.length === 0}
    <div class="empty">
      <h3>Noch kein Charakter in dieser Kampagne</h3>
      <p>Weise einen deiner Charaktere zu oder erstelle einen neuen. Ein Charakter kann in mehreren Kampagnen mitspielen.</p>
      <div class="row center">
        {#if available.length}<button class="btn" onclick={() => (assigning = true)}><UserPlus size={16} /> Vorhandenen zuweisen</button>{/if}
        <button class="btn btn-primary" onclick={() => (creating = "assign")}><Plus size={16} /> Neuen Charakter erstellen</button>
      </div>
    </div>
  {:else}
    <div class="grid-auto">
      {#each active as c (c.id)}
        <CharacterCard character={c} href="/k/{campaign.id}/charaktere/{c.id}">
          {#snippet meta()}
            <span class="faint">Dabei seit {formatDate(c.joinedAt)}</span>
            {#if c.ruleset !== campaign.ruleset}<span class="warn"> · {rulesetLabel(c.ruleset)} (Kampagne: {rulesetLabel(campaign.ruleset)})</span>{/if}
          {/snippet}
          {#snippet actions()}
            <button class="btn btn-sm" onclick={() => openReplace(c)}><ArrowLeftRight size={14} /> Austauschen</button>
            <button class="btn btn-sm btn-ghost" onclick={() => openLeave(c)}><LogOut size={14} /> Ausscheiden</button>
          {/snippet}
        </CharacterCard>
      {/each}
    </div>
  {/if}

  {#if former.length}
    <h2 class="section">Ehemalige</h2>
    <div class="stack">
      {#each former as c (c.id)}
        <div class="card former">
          <div class="grow">
            <a href="/k/{campaign.id}/charaktere/{c.id}"><strong>{c.name}</strong></a>
            {#if c.status === "dead"}<span class="badge badge-danger">Verstorben</span>{/if}
            <span class="small muted block">
              {[c.leftReason || "Ausgeschieden", c.leftAt ? formatDate(c.leftAt) : "", `dabei seit ${formatDate(c.joinedAt)}`].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div class="row">
            <button class="btn btn-sm" onclick={() => reactivate(c)}><RotateCcw size={14} /> Wieder aufnehmen</button>
            <button class="btn btn-sm btn-ghost btn-icon" aria-label="{c.name} aus Verlauf entfernen" onclick={() => removeFromHistory(c)}><Trash2 size={14} /></button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

{#if assigning}
  <Modal title="Charakter zuweisen" onclose={() => (assigning = false)}>
    {#if available.length === 0}
      <p class="muted small">Alle deine Charaktere spielen bereits mit.</p>
    {:else}
      <div class="stack">
        {#each available as c (c.id)}
          <div class="pick">
            <div class="grow">
              <strong>{c.name}</strong>
              <span class="tiny muted block">
                {rulesetLabel(c.ruleset)}{#if c.status === "dead"} · verstorben{/if}{#if c.campaigns?.length} · auch in {c.campaigns.filter(x => x.active).map(x => x.name).join(", ") || "–"}{/if}
              </span>
            </div>
            <button class="btn btn-sm btn-primary" onclick={() => assign(c.id)}>Zuweisen</button>
          </div>
        {/each}
      </div>
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => { assigning = false; creating = "assign"; }}><Plus size={16} /> Neuen Charakter erstellen</button>
    {/snippet}
  </Modal>
{/if}

{#if replacing}
  {@const old = replacing}
  <Modal title="{old.name} austauschen" onclose={() => (replacing = null)}>
    <p class="small muted">{old.name} scheidet aus der Kampagne aus und bleibt im Verlauf. Ein anderer Charakter übernimmt.</p>
    <div class="field">
      <span class="label">Grund</span>
      <div class="chip-row">
        {#each LEAVE_REASONS as r (r)}
          <button class="chip" aria-pressed={reason === r} onclick={() => (reason = r)}>{r}</button>
        {/each}
      </div>
      <input class="input" bind:value={reason} aria-label="Grund" />
    </div>
    {#if reason === "Gestorben"}
      <label class="checkbox small"><input type="checkbox" bind:checked={markDead} /> {old.name} als verstorben markieren (in allen Kampagnen sichtbar)</label>
    {/if}
    <h3 class="sub">Ersatz</h3>
    <div class="stack">
      {#each available.filter(c => c.id !== old.id) as c (c.id)}
        <label class="pick selectable" class:selected={replacementId === c.id}>
          <input type="radio" name="replacement" value={c.id} bind:group={replacementId} />
          <span class="grow"><strong>{c.name}</strong> <span class="tiny muted">{rulesetLabel(c.ruleset)}{#if c.status === "dead"} · verstorben{/if}</span></span>
        </label>
      {:else}
        <p class="small muted">Keine weiteren Charaktere vorhanden – erstelle einen neuen.</p>
      {/each}
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (creating = "replace")}><Plus size={16} /> Neuen Charakter erstellen</button>
      <button class="btn btn-primary" disabled={!replacementId} onclick={() => replacementId && replace(replacementId)}>
        <ArrowLeftRight size={16} /> Austauschen
      </button>
    {/snippet}
  </Modal>
{/if}

{#if leaving}
  {@const c = leaving}
  <Modal title="{c.name} scheidet aus" size="sm" onclose={() => (leaving = null)}>
    <div class="field">
      <span class="label">Grund</span>
      <div class="chip-row">
        {#each LEAVE_REASONS as r (r)}
          <button class="chip" aria-pressed={reason === r} onclick={() => (reason = r)}>{r}</button>
        {/each}
      </div>
      <input class="input" bind:value={reason} aria-label="Grund" />
    </div>
    {#if reason === "Gestorben"}
      <label class="checkbox small"><input type="checkbox" bind:checked={markDead} /> Als verstorben markieren</label>
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => (leaving = null)}>Abbrechen</button>
      <button class="btn btn-primary" onclick={leave}>Ausscheiden lassen</button>
    {/snippet}
  </Modal>
{/if}

{#if creating}
  <NewCharacterModal
    defaultRuleset={campaign.ruleset}
    submitLabel={creating === "replace" ? "Erstellen & austauschen" : "Erstellen & zuweisen"}
    onclose={() => (creating = null)}
    oncreated={createdNew}
  />
{/if}

<style>
  .center { justify-content: center; }
  .warn { color: var(--warning); }
  .section { font-size: 1.05rem; margin: 2rem 0 0.7rem; }
  .former { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; padding: 0.7rem 0.9rem; opacity: 0.85; }
  .block { display: block; }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .selectable { cursor: pointer; }
  .selectable.selected { border-color: var(--accent); background: var(--accent-soft); }
  .selectable input { accent-color: var(--accent-strong); }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .field .chip-row { margin-bottom: 0.4rem; }
  .sub { font-size: 1rem; margin: 1rem 0 0.5rem; }
</style>
