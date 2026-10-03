<script lang="ts">
  import { LibraryBig, Pencil, Plus, Shield, Trash2 } from "@lucide/svelte";
  import { ARMOR_TYPES, UNARMORED_DEFENSES, armorClass, newArmor, setEquipped, type ArmorItem } from "../../lib/armor";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { formatMod } from "../../lib/dnd";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";
  import ArmorEditor from "./ArmorEditor.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  let editing = $state<ArmorItem | null>(null);

  const ac = $derived(armorClass(c));
  const typeLabel = (t: ArmorItem["type"]) => ARMOR_TYPES.find(x => x.key === t)?.label ?? t;

  function save(a: ArmorItem) {
    const i = c.armor.findIndex(x => x.id === a.id);
    if (i >= 0) c.armor[i] = a;
    else c.armor.push(a);
    if (a.equipped) setEquipped(c, c.armor.find(x => x.id === a.id)!, true);
    editing = null;
  }

  async function remove(a: ArmorItem) {
    if (!(await confirmDialog(`„${a.name || "Rüstung"}“ entfernen?`, { title: "Rüstung löschen" }))) return;
    c.armor = c.armor.filter(x => x.id !== a.id);
  }

  function toggle(a: ArmorItem) {
    const on = !a.equipped;
    setEquipped(c, a, on);
    // Schild an- oder ablegen kostet im Kampf eine Aktion
    if (a.type === "shield" && c.combat.active) {
      c.combat.used.action = true;
      toast(`${a.name} ${on ? "aufgenommen" : "abgelegt"} – Aktion verbraucht.`);
    }
  }
</script>

<section class="card">
  <div class="row-between head">
    <h3><Shield size={17} /> Rüstung &amp; Schilde</h3>
    <div class="row">
      <button class="btn btn-sm" onclick={() => ctx.openLibrary("armor")}><LibraryBig size={14} /> Aus Bibliothek</button>
      <button class="btn btn-sm btn-primary" onclick={() => (editing = newArmor())}><Plus size={14} /> Rüstung</button>
    </div>
  </div>

  <div class="ac-line">
    <span class="ac-value mono">{ac.total}</span>
    <span class="small muted parts">
      {ac.parts.map((p, i) => `${p.label} ${i === 0 ? p.value : formatMod(p.value)}`).join(" · ")}
    </span>
  </div>
  {#each ac.notes as note (note)}<p class="tiny warn">{note}</p>{/each}

  {#if c.armor.length}
    <div class="list">
      {#each c.armor as a (a.id)}
        <div class="item" class:on={a.equipped}>
          <label class="switch" title={a.type === "shield" ? "Schild tragen" : "Rüstung anlegen"}>
            <input type="checkbox" checked={a.equipped} onchange={() => toggle(a)} />
            <span class="small">{a.type === "shield" ? "getragen" : "angelegt"}</span>
          </label>
          <span class="grow">
            <strong>{a.name || "Rüstung"}</strong>
            <span class="tiny muted block">
              {typeLabel(a.type)} · {a.type === "shield" ? `+${a.baseAc + a.bonus}` : `RK ${a.baseAc + a.bonus}`}{a.type === "medium" && a.dexCap != null ? ` + GES (max. ${a.dexCap})` : a.type === "light" ? " + GES" : ""}
              {#if a.stealthDisadvantage} · Nachteil Heimlichkeit{/if}{#if a.strength} · STR {a.strength}{/if}{#if a.notes} · {a.notes}{/if}
            </span>
          </span>
          <button class="btn btn-sm btn-icon btn-ghost" aria-label="{a.name} bearbeiten" onclick={() => (editing = a)}><Pencil size={14} /></button>
          <button class="btn btn-sm btn-icon btn-ghost" aria-label="{a.name} in Bibliothek" title="In Bibliothek" onclick={() => ctx.addToLibrary("armor", a)}><LibraryBig size={14} /></button>
          {#if ctx.editing}
            <button class="btn btn-sm btn-icon btn-danger" aria-label="{a.name} entfernen" onclick={() => remove(a)}><Trash2 size={14} /></button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted small">Keine Rüstung erfasst. Ohne Rüstung gilt 10 + GES.</p>
  {/if}

  {#if ctx.editing}
    <div class="settings">
      <label class="field">
        <span class="label">RK-Berechnung</span>
        <select class="select input-sm" bind:value={c.acMode}>
          <option value="auto">Aus Rüstung, Schild und Effekten</option>
          <option value="manual">Fester Grundwert</option>
        </select>
      </label>
      {#if c.acMode === "manual"}
        <label class="field"><span class="label">Grundwert</span><input class="input input-sm mono" type="number" bind:value={c.ac} /></label>
      {:else}
        <label class="field">
          <span class="label">Ungerüstete Verteidigung</span>
          <select class="select input-sm" bind:value={c.unarmoredDefense}>
            {#each UNARMORED_DEFENSES as u (u.key)}<option value={u.key}>{u.label}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="field"><span class="label">Sonstiger Bonus</span><input class="input input-sm mono" type="number" bind:value={c.acBonus} /></label>
    </div>
    <p class="tiny muted">Löschen im Bearbeiten-Modus. Schilde, aktive Effekte und temporäre Boni zählen auch beim festen Grundwert.</p>
  {/if}
</section>

{#if editing}
  <ArmorEditor item={editing} onsave={save} onclose={() => (editing = null)} />
{/if}

<style>
  .head { margin-bottom: 0.6rem; gap: 0.5rem; flex-wrap: wrap; }
  h3 { margin: 0; display: inline-flex; align-items: center; gap: 0.4rem; }
  .ac-line { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.4rem; }
  .ac-value { font-size: 1.8rem; font-weight: 800; font-family: var(--font-display); }
  .warn { color: var(--warning); margin: 0 0 0.3rem; }
  .list { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .item.on { border-color: var(--accent); background: var(--accent-soft); }
  .switch { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; cursor: pointer; min-width: 4.2rem; }
  .switch input { accent-color: var(--accent-strong); width: 1.1rem; height: 1.1rem; }
  .block { display: block; }
  .settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.5rem; margin-top: 0.8rem; }
</style>
