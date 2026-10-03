<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import Modal from "../../components/Modal.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { parseBonus, parseDice } from "../../lib/dice";
  import { ABILITIES, ABILITY_NAMES, SKILLS, rulesTerms } from "../../lib/dnd";
  import {
    AC_MODES,
    ACTIVATIONS,
    ADV_MODES,
    DURATIONS,
    EFFECT_TYPES,
    LINK_WHEN,
    ROLL_TARGETS,
    SCOPES,
    TARGETS,
    TRIGGERS,
    USE_RESETS,
    baseCategories,
    newRollMod,
    normalizeFeature,
    type Feature,
    type RollMod,
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

  /** Andere Fähigkeiten, die diese mitverwenden kann */
  const linkable = $derived(c.features.filter(x => x.id !== f.id).sort((a, b) => a.name.localeCompare(b.name, "de")));

  function addLink() {
    const first = linkable.find(x => !f.links.some(l => l.featureId === x.id));
    if (first) f.links = [...f.links, { featureId: first.id, cost: 1, when: "use" }];
  }

  function addRollMod() {
    f.rollMods = [...f.rollMods, newRollMod()];
  }

  /** Angriffs-/Schadensboni brauchen einen Angriffsbezug */
  function targetChanged(m: RollMod) {
    m.ability = null;
    m.skill = null;
    if ((m.target === "attack" || m.target === "damage") && f.appliesTo.scope === "none") f.appliesTo.scope = "all";
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
    const badMod = f.rollMods.find(m => m.bonus.trim() && !parseBonus(m.bonus));
    if (badMod) {
      error = `Ungültiger Bonus „${badMod.bonus}“ (Beispiele: 2, -1, 1d4, -1d4).`;
      return;
    }
    f.rollMods = f.rollMods.filter(m => m.bonus.trim() || m.mode !== "none");
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
        <span class="label">Verwendet andere Fähigkeiten</span>
        {#each f.links as link, i (i)}
          <div class="row link-row">
            <select class="select input-sm grow" bind:value={link.featureId} aria-label="Fähigkeit">
              {#each linkable as x (x.id)}<option value={x.id}>{x.name || "Ohne Namen"}</option>{/each}
            </select>
            <input class="input input-sm mono num" type="number" min="0" bind:value={link.cost} aria-label="Nutzungen" title="Nutzungen" />
            <select class="select input-sm when" bind:value={link.when} aria-label="Wann">
              {#each LINK_WHEN as w (w.key)}<option value={w.key}>{w.label}</option>{/each}
            </select>
            <button type="button" class="btn btn-sm btn-icon btn-ghost" aria-label="Verknüpfung entfernen" onclick={() => (f.links = f.links.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        {/each}
        {#if linkable.length > f.links.length}
          <button type="button" class="btn btn-sm btn-ghost add" onclick={addLink}><Plus size={14} /> Verknüpfung</button>
        {:else if !linkable.length}
          <span class="tiny muted">Lege zuerst die andere Fähigkeit an (z. B. Durchschnaufen für Taktisches Verständnis).</span>
        {/if}
        <span class="tiny muted">„Wenn es gelingt“: Der Verbrauch wird erst bestätigt, wenn du ihn nach dem Wurf auslöst.</span>
      </div>
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
        <p class="tiny muted">
          Würfel aus „Schaden“ werden beim Treffer zum Waffenschaden addiert, wenn der Auslöser „Bei Treffer“ gesetzt ist oder
          die Fähigkeit vor dem Angriff gewählt wird. Treffer- und Schadensboni legst du unten unter „Würfe verändern“ fest.
        </p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Würfe verändern</legend>
      <p class="tiny muted intro">
        Bonus als Zahl oder Würfel (z. B. 2, 1d4, -1d4) und/oder Vorteil/Nachteil. Passive und aktive Fähigkeiten wirken
        automatisch; Fähigkeiten ohne Dauer (frei, vor der Aktion, Reaktion) kannst du im Würfeldialog dazuwählen, auch nach dem Wurf.
      </p>
      {#each f.rollMods as m, i (i)}
        <div class="mod-row">
          <select class="select input-sm" bind:value={m.target} onchange={() => targetChanged(m)} aria-label="Wurf">
            {#each ROLL_TARGETS as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
          </select>
          {#if m.target === "check" || m.target === "save"}
            <select class="select input-sm" bind:value={m.ability} aria-label="Attribut">
              <option value={null}>alle Attribute</option>
              {#each ABILITIES as a (a)}<option value={a}>{ABILITY_NAMES[a]}</option>{/each}
            </select>
          {:else if m.target === "skill"}
            <select class="select input-sm" bind:value={m.skill} aria-label="Fertigkeit">
              <option value={null}>alle Fertigkeiten</option>
              {#each SKILLS as sk (sk.key)}<option value={sk.key}>{sk.name}</option>{/each}
            </select>
          {:else}
            <span></span>
          {/if}
          <input class="input input-sm mono" bind:value={m.bonus} placeholder="+2 / 1d4" aria-label="Bonus" />
          <select class="select input-sm" bind:value={m.mode} aria-label="Vorteil/Nachteil">
            {#each ADV_MODES as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
          </select>
          <button type="button" class="btn btn-sm btn-icon btn-ghost" aria-label="Modifikator entfernen" onclick={() => (f.rollMods = f.rollMods.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      {/each}
      <button type="button" class="btn btn-sm btn-ghost add" onclick={addRollMod}><Plus size={14} /> Modifikator</button>

      <div class="grid-2 ac">
        <label class="field">
          <span class="label">Rüstungsklasse</span>
          <select class="select" bind:value={f.acMod.mode}>
            {#each AC_MODES as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
          </select>
        </label>
        {#if f.acMod.mode !== "none"}
          <label class="field"><span class="label">Wert</span><input class="input mono" type="number" bind:value={f.acMod.value} /></label>
        {/if}
      </div>
      {#if f.acMod.mode !== "none"}
        <p class="tiny muted">Wirkt, solange die Fähigkeit aktiv ist (passiv immer, sonst nach dem Einsetzen für die Dauer).</p>
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
  .link-row { gap: 0.35rem; margin-bottom: 0.35rem; flex-wrap: nowrap; }
  .link-row .when { width: auto; max-width: 14rem; }
  .add { align-self: flex-start; }
  .intro { margin: 0 0 0.5rem; }
  .mod-row { display: grid; grid-template-columns: 1.2fr 1.2fr 0.8fr 0.9fr auto; gap: 0.35rem; margin-bottom: 0.35rem; align-items: center; }
  @media (max-width: 560px) {
    .mod-row { grid-template-columns: 1fr 1fr; }
  }
  .ac { margin-top: 0.8rem; }
  .error { color: var(--danger); }
</style>
