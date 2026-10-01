<script lang="ts">
  import { onMount } from "svelte";
  import { Heart, Plus, Shield, Trash2 } from "@lucide/svelte";
  import Modal from "../components/Modal.svelte";
  import { campaignApi, del, get, post } from "../lib/api";
  import { classSummary, newCharacterData, normalizeCharacter, totalLevel } from "../lib/character";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { CLASSES, rulesTerms } from "../lib/dnd";
  import { uid } from "../lib/format";
  import { navigate } from "../lib/router.svelte";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign, CharacterRecord } from "../lib/types";

  let { campaign }: { campaign: Campaign } = $props();

  let characters = $state<CharacterRecord[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let name = $state("");
  let species = $state("");
  let className = $state("");
  let level = $state(1);

  const terms = $derived(rulesTerms(campaign.ruleset));
  const base = $derived(campaignApi(campaign.id, "characters"));

  onMount(async () => {
    try {
      characters = await get<CharacterRecord[]>(base);
    } catch (e) {
      toastError(e);
    } finally {
      loading = false;
    }
  });

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const data = newCharacterData();
    data.species = species;
    const cls = CLASSES.find(c => c.name === className);
    data.classes = [{ id: uid(), name: className, subclass: "", level, hitDie: cls?.hitDie ?? 8 }];
    data.spellcasting.ability = cls?.spellAbility ?? null;
    const hp = (cls?.hitDie ?? 8) + Math.max(0, level - 1) * ((cls?.hitDie ?? 8) / 2 + 1);
    data.hp = { max: hp, current: hp, temp: 0 };
    try {
      const created = await post<CharacterRecord>(base, { name, data });
      navigate(`/k/${campaign.id}/charaktere/${created.id}?bearbeiten=1`);
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(c: CharacterRecord) {
    const ok = await confirmDialog(`Charakterbogen „${c.name}“ endgültig löschen? Zugeordnete Zauber bleiben im Zauberbuch erhalten.`, {
      title: "Charakter löschen",
    });
    if (!ok) return;
    try {
      await del(`${base}/${c.id}`);
      characters = characters.filter(x => x.id !== c.id);
      toast("Charakter gelöscht.", "success");
    } catch (e) {
      toastError(e);
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Charakterbögen</h1>
    <p class="muted">Deine Charaktere in dieser Kampagne – digital würfeln oder mit echten Würfeln rechnen lassen.</p>
  </div>
  <button class="btn btn-primary" onclick={() => (creating = true)}><Plus size={16} /> Neuer Charakter</button>
</div>

{#if loading}
  <div class="spinner"></div>
{:else if characters.length === 0}
  <div class="empty">
    <h3>Noch kein Charakter</h3>
    <p>Lege deinen Charakter an. Du kannst alles digital würfeln oder deine echten Würfel benutzen und dir nur die Ergebnisse ausrechnen lassen.</p>
    <button class="btn btn-primary" onclick={() => (creating = true)}><Plus size={16} /> Charakter erstellen</button>
  </div>
{:else}
  <div class="grid-auto">
    {#each characters as c (c.id)}
      {@const d = normalizeCharacter(c.data)}
      <div class="card char">
        <a href="/k/{campaign.id}/charaktere/{c.id}" class="main">
          <span class="level" title="Stufe">{totalLevel(d)}</span>
          <span class="grow">
            <strong class="block truncate">{c.name}</strong>
            <span class="small muted block truncate">{[d.species, classSummary(d)].filter(Boolean).join(" · ") || "–"}</span>
          </span>
        </a>
        <div class="row-between foot">
          <span class="row small muted">
            <span class="row stat"><Heart size={14} /> {d.hp.current}/{d.hp.max}</span>
            <span class="row stat"><Shield size={14} /> {d.ac}</span>
          </span>
          <button class="btn btn-ghost btn-sm btn-icon" aria-label="{c.name} löschen" onclick={() => remove(c)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if creating}
  <Modal title="Neuer Charakter" size="sm" onclose={() => (creating = false)}>
    <form id="new-char" onsubmit={create}>
      <div class="field">
        <label for="nc-name">Name</label>
        <input id="nc-name" class="input" bind:value={name} required maxlength="200" />
      </div>
      <div class="field">
        <label for="nc-species">{terms.species}</label>
        <input id="nc-species" class="input" bind:value={species} placeholder="z. B. Zwerg" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="nc-class">Klasse</label>
          <input id="nc-class" class="input" list="class-list" bind:value={className} placeholder="z. B. Magier" />
          <datalist id="class-list">
            {#each CLASSES as k (k.name)}<option value={k.name}></option>{/each}
          </datalist>
        </div>
        <div class="field">
          <label for="nc-level">Stufe</label>
          <input id="nc-level" class="input" type="number" min="1" max="20" bind:value={level} />
        </div>
      </div>
      <p class="tiny muted">Alles Weitere stellst du im Bogen ein. Trefferpunkte werden mit dem Durchschnitt vorbelegt.</p>
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (creating = false)}>Abbrechen</button>
      <button class="btn btn-primary" type="submit" form="new-char" disabled={!name.trim()}>Erstellen</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .char { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem; }
  .main { display: flex; gap: 0.8rem; align-items: center; color: inherit; }
  .main:hover { text-decoration: none; }
  .main:hover strong { color: var(--accent-text); }
  .level {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.2rem;
    background: var(--accent-soft);
    color: var(--accent-text);
    border: 2px solid var(--accent);
  }
  .block { display: block; }
  .foot { border-top: 1px solid var(--border); padding-top: 0.5rem; }
  .stat { gap: 0.3rem; }
</style>
