<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import { profBonus, totalLevel } from "../../lib/character";
  import { CLASSES, proficiencyBonus, rulesTerms } from "../../lib/dnd";
  import { uid } from "../../lib/format";
  import { sheet } from "./context";

  let { name = $bindable() }: { name: string } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);
  const terms = $derived(rulesTerms(ctx.ruleset));

  function onClassName(index: number, value: string) {
    const k = c.classes[index]!;
    k.name = value;
    const known = CLASSES.find(x => x.name.toLowerCase() === value.trim().toLowerCase());
    if (known) {
      k.hitDie = known.hitDie;
      if (!c.spellcasting.ability && known.spellAbility) c.spellcasting.ability = known.spellAbility;
    }
  }
</script>

<section class="card">
  <h3>Grunddaten</h3>
  <div class="grid-2">
    <label class="field"><span class="label">Name</span><input class="input" bind:value={name} maxlength="200" /></label>
    <label class="field"><span class="label">{terms.species}</span><input class="input" bind:value={c.species} /></label>
    <label class="field"><span class="label">Hintergrund</span><input class="input" bind:value={c.background} /></label>
    <label class="field"><span class="label">Gesinnung</span><input class="input" bind:value={c.alignment} /></label>
    <label class="field"><span class="label">Erfahrungspunkte</span><input class="input mono" type="number" min="0" bind:value={c.xp} /></label>
    <label class="field">
      <span class="label">Übungsbonus</span>
      <select class="select" value={c.profBonusOverride ?? ""} onchange={e => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        c.profBonusOverride = v === "" ? null : Number(v);
      }}>
        <option value="">Automatisch (+{proficiencyBonus(totalLevel(c))})</option>
        {#each [2, 3, 4, 5, 6] as n (n)}<option value={n}>+{n}</option>{/each}
      </select>
    </label>
  </div>

  <div class="row-between classes-head">
    <span class="label">Klassen (Gesamtstufe {totalLevel(c)}, Übung +{profBonus(c)})</span>
    <button class="btn btn-sm" onclick={() => c.classes.push({ id: uid(), name: "", subclass: "", level: 1, hitDie: 8 })}>
      <Plus size={14} /> Multiclass
    </button>
  </div>
  <datalist id="sheet-class-list">
    {#each CLASSES as k (k.name)}<option value={k.name}></option>{/each}
  </datalist>
  {#each c.classes as k, i (k.id)}
    <div class="class-row">
      <input class="input input-sm" list="sheet-class-list" value={k.name} oninput={e => onClassName(i, (e.currentTarget as HTMLInputElement).value)} placeholder="Klasse" aria-label="Klasse" />
      <input class="input input-sm" bind:value={k.subclass} placeholder="Unterklasse" aria-label="Unterklasse" />
      <label class="tiny muted">Stufe<input class="input input-sm mono" type="number" min="1" max="20" bind:value={k.level} /></label>
      <label class="tiny muted">TW
        <select class="select input-sm" bind:value={k.hitDie}>
          {#each [6, 8, 10, 12] as d (d)}<option value={d}>W{d}</option>{/each}
        </select>
      </label>
      <button class="btn btn-sm btn-icon btn-danger" disabled={c.classes.length <= 1} aria-label="Klasse entfernen" onclick={() => (c.classes = c.classes.filter(x => x.id !== k.id))}><Trash2 size={14} /></button>
    </div>
  {/each}

  <div class="divider"></div>
  <span class="label">Würfelmodus für diesen Charakter</span>
  <div class="segmented dice-mode" role="group" aria-label="Würfelmodus">
    <button aria-pressed={c.rollMode === "inherit"} onclick={() => (c.rollMode = "inherit")}>Wie im Profil</button>
    <button aria-pressed={c.rollMode === "digital"} onclick={() => (c.rollMode = "digital")}>Digital</button>
    <button aria-pressed={c.rollMode === "physical"} onclick={() => (c.rollMode = "physical")}>Echte Würfel</button>
  </div>
</section>

<style>
  h3 { margin: 0 0 0.8rem; }
  .classes-head { margin: 0.4rem 0 0.5rem; }
  .class-row { display: grid; grid-template-columns: 1.3fr 1.3fr 4.5rem 5rem auto; gap: 0.4rem; align-items: end; margin-bottom: 0.4rem; }
  .class-row label { display: flex; flex-direction: column; gap: 0.1rem; }
  .dice-mode { margin-top: 0.4rem; flex-wrap: wrap; }
  @media (max-width: 560px) {
    .class-row { grid-template-columns: 1fr 1fr; }
  }
</style>
