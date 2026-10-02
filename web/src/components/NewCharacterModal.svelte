<script lang="ts">
  import Modal from "./Modal.svelte";
  import { post } from "../lib/api";
  import { newCharacterData } from "../lib/character";
  import { CLASSES, rulesTerms } from "../lib/dnd";
  import { uid } from "../lib/format";
  import { RULESETS } from "../lib/themes";
  import { toastError } from "../lib/toast.svelte";
  import type { CharacterRecord, Ruleset } from "../lib/types";

  let {
    defaultRuleset = "2024",
    title = "Neuer Charakter",
    submitLabel = "Erstellen",
    onclose,
    oncreated,
  }: {
    defaultRuleset?: Ruleset;
    title?: string;
    submitLabel?: string;
    onclose: () => void;
    oncreated: (c: CharacterRecord) => void | Promise<void>;
  } = $props();

  let name = $state("");
  let species = $state("");
  let className = $state("");
  let level = $state(1);
  // svelte-ignore state_referenced_locally
  let ruleset = $state<Ruleset>(defaultRuleset);
  let busy = $state(false);

  const terms = $derived(rulesTerms(ruleset));

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const data = newCharacterData();
    data.species = species;
    const cls = CLASSES.find(c => c.name === className);
    data.classes = [{ id: uid(), name: className, subclass: "", level, hitDie: cls?.hitDie ?? 8 }];
    data.spellcasting.ability = cls?.spellAbility ?? null;
    // Trefferpunkte mit dem Durchschnitt vorbelegen
    const hp = (cls?.hitDie ?? 8) + Math.max(0, level - 1) * ((cls?.hitDie ?? 8) / 2 + 1);
    data.hp = { max: hp, current: hp, temp: 0 };
    busy = true;
    try {
      const created = await post<CharacterRecord>("/api/characters", { name, data, ruleset });
      await oncreated(created);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {title} size="sm" {onclose}>
  <form id="new-char" onsubmit={create}>
    <div class="field">
      <label for="nc-name">Name</label>
      <input id="nc-name" class="input" bind:value={name} required maxlength="200" />
    </div>
    <div class="field">
      <label for="nc-rules">Regelversion</label>
      <select id="nc-rules" class="select" bind:value={ruleset}>
        {#each RULESETS as r (r.key)}<option value={r.key}>{r.name}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label for="nc-species">{terms.species}</label>
      <input id="nc-species" class="input" bind:value={species} placeholder="z. B. Zwerg" />
    </div>
    <div class="grid-2">
      <div class="field">
        <label for="nc-class">Klasse</label>
        <input id="nc-class" class="input" list="nc-class-list" bind:value={className} placeholder="z. B. Magier" />
        <datalist id="nc-class-list">
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
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="new-char" disabled={busy || !name.trim()}>{submitLabel}</button>
  {/snippet}
</Modal>
