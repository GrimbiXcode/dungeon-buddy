<script lang="ts">
  import Modal from "../../components/Modal.svelte";
  import Stepper from "../../components/Stepper.svelte";
  import { AMMO_TYPES, RECOVERIES, newInventoryItem, type AmmoType, type InventoryItem } from "../../lib/inventory";

  let { item, onsave, onclose }: { item: InventoryItem; onsave: (i: InventoryItem) => void; onclose: () => void } = $props();

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let i = $state(newInventoryItem(JSON.parse(JSON.stringify(item))));
  let error = $state<string | null>(null);

  function setAmmo(v: string) {
    const ammo = (v || null) as AmmoType | null;
    // Geschosse kommen meist zur Hälfte zurück
    if (ammo && !i.ammo && i.recover === "none") i.recover = "half";
    i.ammo = ammo;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!i.name.trim()) {
      error = "Bitte einen Namen eingeben.";
      return;
    }
    i.name = i.name.trim();
    onsave($state.snapshot(i) as InventoryItem);
  }
</script>

<Modal title={item.name ? `${item.name} bearbeiten` : "Neuer Gegenstand"} size="sm" {onclose}>
  <form id="item-form" onsubmit={submit}>
    <label class="field"><span class="label">Name</span><input class="input" bind:value={i.name} required maxlength="120" placeholder="z. B. Heiltrank" /></label>
    <div class="field">
      <span class="label">Anzahl</span>
      <span><Stepper bind:value={i.quantity} label="Anzahl" /></span>
    </div>
    <label class="field">
      <span class="label">Geschoss</span>
      <select class="select" value={i.ammo ?? ""} onchange={e => setAmmo(e.currentTarget.value)}>
        <option value="">kein Geschoss</option>
        {#each AMMO_TYPES as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
      </select>
      <span class="tiny muted">Geschosse werden bei Fernkampfwaffen vorgeschlagen.</span>
    </label>
    <label class="field">
      <span class="label">Nach dem Kampf</span>
      <select class="select" bind:value={i.recover}>
        {#each RECOVERIES as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
      </select>
      <span class="tiny muted">{RECOVERIES.find(r => r.key === i.recover)?.hint} Gilt, wenn ein Angriff oder eine Fähigkeit den Gegenstand im Kampf verbraucht.</span>
    </label>
    <label class="field"><span class="label">Notiz</span><input class="input" bind:value={i.notes} placeholder="z. B. +1, versilbert, im Rucksack …" /></label>
    {#if error}<p class="error small">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="item-form">Speichern</button>
  {/snippet}
</Modal>

<style>
  .error { color: var(--danger); }
</style>
