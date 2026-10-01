<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import Modal from "../../components/Modal.svelte";
  import { parseDice } from "../../lib/dice";
  import { rulesTerms } from "../../lib/dnd";
  import {
    ACTIVATIONS,
    DURATIONS,
    EFFECT_TYPES,
    SCOPES,
    TARGETS,
    TRIGGERS,
    USE_RESETS,
    baseCategories,
    normalizeFeature,
    type Feature,
    type Trigger,
  } from "../../lib/features";
  import { sheet } from "./context";

  let {
    feature,
    onsave,
    onclose,
  }: { feature: Feature; onsave: (f: Feature) => void; onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let f = $state(normalizeFeature(JSON.parse(JSON.stringify(feature))));
  // svelte-ignore state_referenced_locally
  let tagText = $state(feature.tags.join(", "));
  let limited = $state(f.uses.max != null);
  let error = $state<string | null>(null);

  const categories = $derived([
    ...new Set([...baseCategories(rulesTerms(ctx.ruleset).species), ...c.features.map(x => x.category)].filter(Boolean)),
  ]);
  const allTags = $derived([...new Set(c.features.flatMap(x => x.tags))]);

  function toggleTrigger(t: Trigger) {
    f.triggers = f.triggers.includes(t) ? f.triggers.filter(x => x !== t) : [...f.triggers, t];
  }

  function toggleAttack(id: string) {
    const ids = f.appliesTo.attackIds;
    f.appliesTo.attackIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      error = "Bitte einen Namen eingeben.";
      return;
    }
    if (f.damage.trim() && !parseDice(f.damage)) {
      error = `Ungültiger Würfelausdruck „${f.damage}“ (Beispiel: 2d6+3).`;
      return;
    }
    f.tags = [...new Set(tagText.split(",").map(t => t.trim()).filter(Boolean))];
    if (!limited) f.uses.max = null;
    else if (f.uses.max == null) f.uses.max = 1;
    onsave($state.snapshot(f) as Feature);
  }
</script>

<Modal title={feature.name ? `${feature.name} bearbeiten` : "Neue Fähigkeit"} size="lg" {onclose}>
  <form id="feature-form" onsubmit={submit}>
    <fieldset>
      <legend>Grunddaten</legend>
      <div class="grid-2">
        <label class="field"><span class="label">Name</span><input class="input" bind:value={f.name} required maxlength="120" /></label>
        <label class="field">
          <span class="label">Kategorie</span>
          <input class="input" list="feature-categories" bind:value={f.category} placeholder="z. B. Klasse, Talent, Ausrüstung …" />
          <datalist id="feature-categories">{#each categories as cat (cat)}<option value={cat}></option>{/each}</datalist>
        </label>
      </div>
      <label class="field">
        <span class="label">Eigene Kategorien / Schlagworte (kommagetrennt)</span>
        <input class="input" list="feature-tags" bind:value={tagText} placeholder="z. B. Nahkampf, Kontrolle, Lieblingskombo" />
        <datalist id="feature-tags">{#each allTags as t (t)}<option value={t}></option>{/each}</datalist>
      </label>
    </fieldset>

    <fieldset>
      <legend>Einsatz</legend>
      <div class="grid-2">
        <label class="field">
          <span class="label">Wann / Aktionsart</span>
          <select class="select" bind:value={f.activation}>
            {#each ACTIVATIONS as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
          </select>
        </label>
        <div class="field">
          <span class="label">Wie oft einsetzbar</span>
          <div class="row uses">
            <label class="checkbox small"><input type="checkbox" bind:checked={limited} /> begrenzt</label>
            {#if limited}
              <input class="input input-sm mono num" type="number" min="0" max="99" bind:value={f.uses.max} aria-label="Anzahl" />
              <span class="small muted">×</span>
              <select class="select input-sm" bind:value={f.uses.reset} aria-label="Zurücksetzen">
                {#each USE_RESETS as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
              </select>
            {:else}
              <span class="small muted">beliebig oft</span>
            {/if}
          </div>
        </div>
      </div>
      {#if c.resources.length}
        <div class="row">
          <label class="field grow">
            <span class="label">Verbraucht Ressource</span>
            <select class="select" bind:value={f.resourceId}>
              <option value={null}>keine</option>
              {#each c.resources as r (r.id)}<option value={r.id}>{r.name} ({r.max})</option>{/each}
            </select>
          </label>
          {#if f.resourceId}
            <label class="field"><span class="label">Kosten</span><input class="input mono num" type="number" min="0" bind:value={f.resourceCost} /></label>
          {/if}
        </div>
      {/if}
      <div class="field">
        <span class="label">Auslöser (für Vorschläge im Kampf)</span>
        <div class="chip-row">
          {#each TRIGGERS as t (t.key)}
            <button type="button" class="chip" aria-pressed={f.triggers.includes(t.key)} onclick={() => toggleTrigger(t.key)}>{t.label}</button>
          {/each}
        </div>
      </div>
      <label class="field"><span class="label">Bedingung / Voraussetzung</span><input class="input" bind:value={f.condition} placeholder="z. B. nur mit Finesse-Waffe, einmal pro Zug" /></label>
    </fieldset>

    <fieldset>
      <legend>Wirkung</legend>
      <div class="grid-2">
        <label class="field">
          <span class="label">Art</span>
          <select class="select" bind:value={f.effectType}>
            {#each EFFECT_TYPES as e (e.key)}<option value={e.key}>{e.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span class="label">Ziel</span>
          <select class="select" bind:value={f.target}>
            {#each TARGETS as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
          </select>
        </label>
      </div>
      <label class="field"><span class="label">Ziel genauer</span><input class="input" bind:value={f.targetText} placeholder={unitSystem() === "metric" ? "z. B. eine Kreatur in 9 m, 4.5-m-Kegel" : "z. B. eine Kreatur in 30 ft, 15-ft-Kegel"} /></label>
      <label class="field"><span class="label">Nutzen (kurz)</span><input class="input" bind:value={f.benefit} placeholder="z. B. +2 RK, Vorteil auf den nächsten Angriff" /></label>
      <div class="grid-3">
        <label class="field"><span class="label">{f.effectType === "healing" ? "Heilung" : "Schaden"} (Würfel)</span><input class="input mono" bind:value={f.damage} placeholder="2d6+3" /></label>
        <label class="field"><span class="label">Schadensart</span><input class="input" bind:value={f.damageType} placeholder="Feuer" /></label>
        <label class="field"><span class="label">Rettungswurf</span><input class="input" bind:value={f.save} placeholder="GES, halber Schaden" /></label>
      </div>
      <div class="grid-3">
        <label class="field">
          <span class="label">Dauer</span>
          <select class="select" bind:value={f.duration.kind}>
            {#each DURATIONS as d (d.key)}<option value={d.key}>{d.label}</option>{/each}
          </select>
        </label>
        {#if ["rounds", "minutes", "hours", "concentration"].includes(f.duration.kind)}
          <label class="field"><span class="label">Anzahl</span><input class="input mono" type="number" min="1" bind:value={f.duration.amount} /></label>
        {/if}
        {#if f.duration.kind === "special"}
          <label class="field"><span class="label">Dauer (Text)</span><input class="input" bind:value={f.duration.text} /></label>
        {/if}
      </div>
    </fieldset>

    <fieldset>
      <legend>Bei Angriffen</legend>
      <label class="field">
        <span class="label">Gilt für</span>
        <select class="select" bind:value={f.appliesTo.scope}>
          {#each SCOPES as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
      </label>
      {#if f.appliesTo.scope === "specific"}
        <div class="chip-row weapons">
          {#each c.attacks as a (a.id)}
            <button type="button" class="chip" aria-pressed={f.appliesTo.attackIds.includes(a.id)} onclick={() => toggleAttack(a.id)}>{a.name || "Angriff"}</button>
          {:else}
            <span class="small muted">Noch keine Waffen/Angriffe im Bogen.</span>
          {/each}
        </div>
      {/if}
      {#if f.appliesTo.scope !== "none"}
        <div class="grid-3">
          <label class="field"><span class="label">Treffer-Modifikator</span><input class="input mono" type="number" bind:value={f.attackMods.toHit} /></label>
          <label class="field"><span class="label">Schadensbonus</span><input class="input mono" type="number" bind:value={f.attackMods.damageBonus} /></label>
          <label class="checkbox adv"><input type="checkbox" bind:checked={f.attackMods.advantage} /> Gibt Vorteil</label>
        </div>
        <p class="tiny muted">
          Würfel aus „Schaden“ werden beim Treffer zum Waffenschaden addiert, wenn der Auslöser „Bei Treffer“ gesetzt ist oder
          die Fähigkeit vor dem Angriff gewählt wird.
        </p>
      {/if}
    </fieldset>

    <label class="field">
      <span class="label">Beschreibung (Markdown)</span>
      <textarea class="textarea" bind:value={f.description}></textarea>
    </label>
    {#if error}<p class="error small">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="feature-form">Speichern</button>
  {/snippet}
</Modal>

<style>
  fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
  legend {
    font-family: var(--font-display);
    font-weight: 700;
    margin-bottom: 0.6rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
    width: 100%;
  }
  .uses { gap: 0.4rem; min-height: 38px; flex-wrap: nowrap; }
  .uses .select { width: auto; }
  .num { width: 4.5rem; }
  .chip {
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.82rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .weapons { margin-bottom: 0.8rem; }
  .adv { align-self: center; margin-top: 0.8rem; }
  .error { color: var(--danger); }
</style>
