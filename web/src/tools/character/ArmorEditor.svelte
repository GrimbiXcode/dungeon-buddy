<script lang="ts">
  import Modal from "../../components/Modal.svelte";
  import { ARMOR_PRESETS, ARMOR_TYPES, normalizeArmor, type ArmorItem } from "../../lib/armor";

  let { item, onsave, onclose }: { item: ArmorItem; onsave: (a: ArmorItem) => void; onclose: () => void } = $props();

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let a = $state(normalizeArmor(JSON.parse(JSON.stringify(item))));
  // svelte-ignore state_referenced_locally
  let dexLimited = $state(a.dexCap != null && a.type !== "heavy");
  let error = $state<string | null>(null);

  function applyPreset(name: string) {
    const p = ARMOR_PRESETS.find(x => x.name === name);
    if (!p) return;
    Object.assign(a, { ...p, dexCap: p.type === "medium" ? 2 : p.type === "heavy" ? 0 : null });
    dexLimited = p.type === "medium";
  }

  function typeChanged() {
    if (a.type === "shield" && a.baseAc > 5) a.baseAc = 2;
    if (a.type === "medium" && a.dexCap == null) {
      a.dexCap = 2;
      dexLimited = true;
    }
    if (a.type === "light") dexLimited = false;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!a.name.trim()) {
      error = "Bitte einen Namen eingeben.";
      return;
    }
    if (a.type === "heavy") a.dexCap = 0;
    else if (!dexLimited || a.type === "shield") a.dexCap = null;
    else a.dexCap = Math.max(0, a.dexCap ?? 2);
    onsave($state.snapshot(a) as ArmorItem);
  }
</script>

<Modal title={item.name ? `${item.name} bearbeiten` : "Neue Rüstung"} size="md" {onclose}>
  <form id="armor-form" onsubmit={submit}>
    {#if !item.name}
      <label class="field">
        <span class="label">Vorlage</span>
        <select class="select" onchange={e => applyPreset((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">Eigene Rüstung …</option>
          {#each ARMOR_TYPES as t (t.key)}
            <optgroup label={t.label}>
              {#each ARMOR_PRESETS.filter(p => p.type === t.key) as p (p.name)}
                <option value={p.name}>{p.name} ({t.key === "shield" ? `+${p.baseAc}` : `RK ${p.baseAc}`})</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </label>
    {/if}
    <div class="grid-2">
      <label class="field"><span class="label">Name</span><input class="input" bind:value={a.name} required maxlength="120" /></label>
      <label class="field">
        <span class="label">Art</span>
        <select class="select" bind:value={a.type} onchange={typeChanged}>
          {#each ARMOR_TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
        </select>
      </label>
    </div>
    <div class="grid-3">
      <label class="field">
        <span class="label">{a.type === "shield" ? "RK-Bonus" : "Grund-RK"}</span>
        <input class="input mono" type="number" min="0" bind:value={a.baseAc} />
      </label>
      <label class="field"><span class="label">Magischer Bonus</span><input class="input mono" type="number" bind:value={a.bonus} /></label>
      {#if a.type !== "shield"}
        <label class="field"><span class="label">Mindeststärke</span><input class="input mono" type="number" min="0" bind:value={a.strength} /></label>
      {/if}
    </div>
    {#if a.type === "light" || a.type === "medium"}
      <div class="row">
        <label class="checkbox small"><input type="checkbox" bind:checked={dexLimited} /> GES-Bonus begrenzt</label>
        {#if dexLimited}
          <label class="small row cap">auf höchstens <input class="input input-sm mono" type="number" min="0" bind:value={a.dexCap} /></label>
        {/if}
      </div>
    {:else if a.type === "heavy"}
      <p class="tiny muted">Schwere Rüstung: Der GES-Modifikator zählt nicht.</p>
    {/if}
    {#if a.type !== "shield"}
      <label class="checkbox small"><input type="checkbox" bind:checked={a.stealthDisadvantage} /> Nachteil auf Heimlichkeit</label>
    {/if}
    <label class="field"><span class="label">Notiz</span><input class="input" bind:value={a.notes} /></label>
    {#if error}<p class="error small">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="armor-form">Speichern</button>
  {/snippet}
</Modal>

<style>
  .cap { gap: 0.35rem; }
  .cap input { width: 4rem; }
  .error { color: var(--danger); }
</style>
