<script lang="ts">
  import { Backpack, Plus, Trash2 } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import Stepper from "../../components/Stepper.svelte";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import {
    LOW_STOCK,
    ammoForItem,
    ammoInfo,
    clampQuantity,
    importEquipmentText,
    newInventoryItem,
    parseEquipmentText,
    removeItem,
    type InventoryItem,
  } from "../../lib/inventory";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";
  import ItemEditor from "./ItemEditor.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  let editing = $state<InventoryItem | null>(null);
  let newName = $state("");

  /** Wer verbraucht den Gegenstand? (Angriffe und Fähigkeiten) */
  function users(i: InventoryItem) {
    // Gleichnamige Nutzer nur einmal (sonst doppelte Schlüssel in der Liste)
    return [...new Set([...c.attacks.filter(a => a.consumes?.itemId === i.id), ...c.features.filter(f => f.itemId === i.id)].map(x => x.name || "Ohne Namen"))];
  }

  const ammo = $derived(c.inventory.filter(i => i.ammo));
  const consumables = $derived(c.inventory.filter(i => !i.ammo && users(i).length));
  const other = $derived(c.inventory.filter(i => !i.ammo && !users(i).length));
  const importable = $derived(parseEquipmentText(c.equipment).length);

  function add(e: SubmitEvent) {
    e.preventDefault();
    const text = newName.trim();
    if (!text) return;
    // „20 Pfeile“ oder „2x Heiltrank“ legt gleich die Menge fest
    const m = text.match(/^(\d{1,5})\s*(?:[x×]\s*)?(\S.*)$/i);
    const name = (m ? m[2]! : text).trim().slice(0, 120);
    const ammoType = ammoForItem(name);
    c.inventory.push(newInventoryItem({ name, quantity: m ? clampQuantity(Number(m[1])) : 1, ammo: ammoType }));
    newName = "";
  }

  function save(item: InventoryItem) {
    const i = c.inventory.findIndex(x => x.id === item.id);
    if (i >= 0) c.inventory[i] = item;
    else c.inventory.push(item);
    editing = null;
  }

  async function remove(i: InventoryItem) {
    const used = users(i);
    const msg = used.length
      ? `„${i.name}“ entfernen? ${used.join(", ")} verbraucht dann nichts mehr.`
      : `„${i.name}“ aus dem Inventar entfernen?`;
    if (!(await confirmDialog(msg, { title: "Gegenstand löschen" }))) return;
    removeItem(c, i.id);
  }

  async function importText() {
    const n = parseEquipmentText(c.equipment).length;
    const ok = await confirmDialog(
      `${n} ${n === 1 ? "Zeile" : "Zeilen"} mit Aufzählungszeichen werden als Gegenstände übernommen und aus dem Freitext entfernt. Mengen wie „20 Pfeile“ oder „Heiltrank (2)“ werden erkannt.`,
      { title: "In Liste übernehmen", confirmLabel: "Übernehmen", danger: false }
    );
    if (!ok) return;
    const items = importEquipmentText(c);
    toast(`${items.length} ${items.length === 1 ? "Gegenstand" : "Gegenstände"} übernommen.`, "success");
  }
</script>

{#snippet row(i: InventoryItem)}
  {@const used = users(i)}
  <div class="item" class:empty={i.quantity === 0}>
    <span class="grow name">
      <button class="name-btn" onclick={() => (editing = i)} title="Bearbeiten">{i.name || "Gegenstand"}</button>
      {#if i.ammo}<span class="badge ammo" title="Geschoss">➶ {ammoInfo(i.ammo).one}</span>{/if}
      {#each used as u (u)}<span class="badge badge-accent" title="Wird von „{u}“ verbraucht">{u}</span>{/each}
      {#if i.notes}<span class="tiny muted block">{i.notes}</span>{/if}
    </span>
    <Stepper bind:value={i.quantity} label={i.name || "Anzahl"} warn={Boolean((i.ammo || used.length) && i.quantity <= LOW_STOCK)} />
    {#if ctx.editing}
      <button class="btn btn-sm btn-icon btn-danger" aria-label="{i.name} entfernen" onclick={() => remove(i)}><Trash2 size={14} /></button>
    {/if}
  </div>
{/snippet}

<section class="card">
  <div class="row-between head">
    <h3><Backpack size={17} /> Ausrüstung</h3>
    <button class="btn btn-sm btn-primary" onclick={() => (editing = newInventoryItem({ name: "" }))}><Plus size={14} /> Gegenstand</button>
  </div>

  {#if c.inventory.length === 0}
    <p class="muted small">
      Noch keine Gegenstände. Lege sie hier mit Anzahl an, z. B. „20 Pfeile“. Fernkampfwaffen legen ihre Geschosse beim Speichern selbst an.
    </p>
  {:else}
    {#if ammo.length}
      <h4 class="label">Geschosse</h4>
      <div class="list">{#each ammo as i (i.id)}{@render row(i)}{/each}</div>
    {/if}
    {#if consumables.length}
      <h4 class="label">Verbrauchsgüter für Angriffe und Fähigkeiten</h4>
      <div class="list">{#each consumables as i (i.id)}{@render row(i)}{/each}</div>
    {/if}
    {#if other.length}
      <h4 class="label">Gegenstände</h4>
      <div class="list">{#each other as i (i.id)}{@render row(i)}{/each}</div>
    {/if}
  {/if}

  <form class="add" onsubmit={add}>
    <input class="input input-sm" bind:value={newName} placeholder="Gegenstand hinzufügen, z. B. 2 Heiltrank" maxlength="130" aria-label="Neuer Gegenstand" />
    <button class="btn btn-sm" type="submit" disabled={!newName.trim()}><Plus size={14} /> Hinzufügen</button>
  </form>
  {#if ctx.editing}<p class="tiny muted">Löschen im Bearbeiten-Modus. Auf den Namen tippen, um Geschoss, Bergen nach dem Kampf und Notiz festzulegen.</p>{/if}
</section>

{#if c.equipment.trim() || ctx.editing}
  <section class="card">
    <div class="row-between head">
      <h3>Weitere Ausrüstung</h3>
      {#if importable}
        <button class="btn btn-sm" onclick={importText}><Icon name="edit" size={14} /> In Liste übernehmen</button>
      {/if}
    </div>
    {#if ctx.editing}
      <textarea class="textarea" bind:value={c.equipment} placeholder="Freitext, z. B. Inhalt des Rucksacks …" aria-label="Weitere Ausrüstung"></textarea>
    {:else}
      <Markdown source={c.equipment} />
    {/if}
  </section>
{/if}

{#if editing}
  <ItemEditor item={editing} onsave={save} onclose={() => (editing = null)} />
{/if}

<style>
  .head { margin-bottom: 0.6rem; gap: 0.5rem; }
  h3 { margin: 0; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 1rem; }
  h4 { margin: 0.7rem 0 0.35rem; }
  h4:first-of-type { margin-top: 0; }
  .list { display: flex; flex-direction: column; gap: 0.3rem; }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.4rem 0.35rem 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .item.empty .name-btn { color: var(--faint); text-decoration: line-through; }
  .name { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
  .name-btn {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    font-weight: 650;
    color: inherit;
    cursor: pointer;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .name-btn:hover { color: var(--accent-text); }
  .badge { font-size: 0.68rem; }
  .ammo { background: color-mix(in oklab, var(--warning) 16%, transparent); border-color: transparent; color: var(--warning); }
  .block { display: block; width: 100%; }
  .add { display: flex; gap: 0.4rem; margin-top: 0.7rem; }
  .add .input { flex: 1; min-width: 0; }
  .textarea { min-height: 120px; }
</style>
