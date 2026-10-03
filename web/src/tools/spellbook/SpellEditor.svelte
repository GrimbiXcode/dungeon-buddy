<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { untrack } from "svelte";
  import Modal from "../../components/Modal.svelte";
  import { patch, post } from "../../lib/api";
  import { ABILITY_NAMES, SPELL_LEVEL_NAMES } from "../../lib/dnd";
  import { parseDice } from "../../lib/dice";
  import { toastError } from "../../lib/toast.svelte";
  import type { Spell, SpellData } from "../../lib/types";
  import { DAMAGE_TYPE_OPTIONS, SAVE_ABILITIES, SCHOOL_OPTIONS, fullData } from "./spells";

  let {
    spellUrl,
    spell,
    characters,
    defaultCharacterId,
    onsaved,
    onclose,
  }: {
    /** Basis-URL der Zauber (Kampagne oder Charakter) */
    spellUrl: string;
    spell: Spell | null;
    characters: { id: string; name: string }[];
    defaultCharacterId: string | null;
    onsaved: (spell: Spell) => void;
    onclose: () => void;
  } = $props();

  function initForm(s: Spell | null, charId: string | null) {
    const d = fullData(s?.data);
    return {
      name: s?.name ?? "",
      level: s?.level ?? 1,
      school: d.school,
      castingTime: d.castingTime,
      range: d.range,
      components: d.components,
      duration: d.duration,
      concentration: d.concentration,
      ritual: d.ritual,
      classes: d.classes.join(", "),
      description: d.description,
      higherLevel: d.higherLevel,
      attack: d.attack ?? "",
      save: d.save ?? "",
      damage: d.damage ?? "",
      damageType: d.damageType ?? "",
      heal: d.heal ?? "",
      healAddsModifier: d.healAddsModifier,
      upcast: d.upcast ?? "",
      acMode: (d.acMod?.mode ?? "") as "" | "bonus" | "base" | "min",
      acValue: d.acMod?.value ?? 0,
      characterId: (s ? s.characterId : charId) ?? "",
      notes: s?.notes ?? "",
      prepared: s?.prepared ?? false,
      alwaysPrepared: s?.alwaysPrepared ?? false,
    };
  }

  const form = $state(untrack(() => initForm(spell, defaultCharacterId)));
  const isNew = $derived(!spell);
  let saving = $state(false);
  let submitted = $state(false);

  const diceError = (v: string) => (v.trim() && !parseDice(v) ? "Ungültiger Würfelausdruck, z. B. 2d6+3" : "");
  const errors = $derived({
    name: form.name.trim() ? "" : "Bitte einen Namen eingeben.",
    damage: diceError(form.damage),
    heal: diceError(form.heal),
    upcast: diceError(form.upcast),
  });
  const valid = $derived(Object.values(errors).every(e => !e));

  const opt = (v: string) => (v.trim() ? v.trim() : null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitted = true;
    if (!valid) {
      // Zum ersten fehlerhaften Feld springen
      const ids: Record<keyof typeof errors, string> = { name: "sp-name", damage: "sp-dmg", heal: "sp-heal", upcast: "sp-up" };
      const first = (Object.keys(ids) as (keyof typeof errors)[]).find(k => errors[k]);
      if (first) document.getElementById(ids[first])?.focus();
      return;
    }
    if (saving) return;
    saving = true;
    const data: SpellData = {
      ...fullData(spell?.data),
      school: form.school.trim(),
      castingTime: form.castingTime.trim(),
      range: form.range.trim(),
      components: form.components.trim(),
      duration: form.duration.trim(),
      concentration: form.concentration,
      ritual: form.ritual,
      classes: form.classes
        .split(",")
        .map(c => c.trim())
        .filter(Boolean),
      description: form.description,
      higherLevel: form.higherLevel,
      attack: form.attack === "melee" || form.attack === "ranged" ? form.attack : null,
      save: form.save || null,
      damage: opt(form.damage),
      damageType: opt(form.damage) ? opt(form.damageType) : null,
      heal: opt(form.heal),
      healAddsModifier: opt(form.heal) ? form.healAddsModifier : false,
      upcast: opt(form.upcast),
      acMod: form.acMode && form.acValue ? { mode: form.acMode, value: Number(form.acValue) } : null,
    };
    const body = {
      name: form.name.trim(),
      level: Number(form.level),
      data,
      characterId: form.characterId || null,
      notes: form.notes,
      prepared: form.prepared,
      alwaysPrepared: form.alwaysPrepared,
    };
    try {
      const url = spellUrl;
      const saved = spell ? await patch<Spell>(`${url}/${spell.id}`, body) : await post<Spell>(url, body);
      onsaved(saved);
    } catch (err) {
      toastError(err);
    } finally {
      saving = false;
    }
  }
</script>

<Modal title={isNew ? "Eigener Zauber" : `${spell?.name} bearbeiten`} {onclose} size="lg">
  <form id="spell-form" onsubmit={submit} novalidate>
    <div class="grid-main">
      <div class="field span-2">
        <label for="sp-name">Name *</label>
        <input id="sp-name" class="input" bind:value={form.name} maxlength="200" autocomplete="off" />
        {#if submitted && errors.name}<span class="err">{errors.name}</span>{/if}
      </div>
      <div class="field">
        <label for="sp-level">Grad</label>
        <select id="sp-level" class="select" bind:value={form.level}>
          {#each SPELL_LEVEL_NAMES as n, i (i)}
            <option value={i}>{i === 0 ? "Zaubertrick" : n}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="sp-school">Schule</label>
        <input id="sp-school" class="input" bind:value={form.school} list="sp-schools" autocomplete="off" />
        <datalist id="sp-schools">
          {#each SCHOOL_OPTIONS as s (s)}<option value={s}></option>{/each}
        </datalist>
      </div>
      <div class="field">
        <label for="sp-ct">Zeitaufwand</label>
        <input id="sp-ct" class="input" bind:value={form.castingTime} placeholder="1 Aktion" />
      </div>
      <div class="field">
        <label for="sp-range">Reichweite</label>
        <input id="sp-range" class="input" bind:value={form.range} placeholder={unitSystem() === "metric" ? "18 m" : "60 feet"} />
      </div>
      <div class="field">
        <label for="sp-comp">Komponenten</label>
        <input id="sp-comp" class="input" bind:value={form.components} placeholder="V, G, M" />
      </div>
      <div class="field">
        <label for="sp-dur">Wirkungsdauer</label>
        <input id="sp-dur" class="input" bind:value={form.duration} placeholder="Sofort" />
      </div>
    </div>

    <div class="row checks">
      <label class="checkbox"><input type="checkbox" bind:checked={form.concentration} /> Konzentration</label>
      <label class="checkbox"><input type="checkbox" bind:checked={form.ritual} /> Ritual</label>
    </div>

    <div class="field">
      <label for="sp-classes">Klassen</label>
      <input id="sp-classes" class="input" bind:value={form.classes} placeholder="Magier, Zauberer" />
    </div>
    <div class="field">
      <label for="sp-desc">Beschreibung</label>
      <textarea id="sp-desc" class="textarea" rows="6" bind:value={form.description} placeholder="Markdown möglich"></textarea>
    </div>
    <div class="field">
      <label for="sp-hl">Auf höheren Graden</label>
      <textarea id="sp-hl" class="textarea short" rows="3" bind:value={form.higherLevel}></textarea>
    </div>

    <fieldset>
      <legend>Würfeln</legend>
      <div class="grid-main">
        <div class="field">
          <label for="sp-attack">Zauberangriff</label>
          <select id="sp-attack" class="select" bind:value={form.attack}>
            <option value="">Keiner</option>
            <option value="melee">Nahkampf</option>
            <option value="ranged">Fernkampf</option>
          </select>
        </div>
        <div class="field">
          <label for="sp-save">Rettungswurf</label>
          <select id="sp-save" class="select" bind:value={form.save}>
            <option value="">Keiner</option>
            {#each SAVE_ABILITIES as a (a)}
              <option value={a}>{ABILITY_NAMES[a]}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="sp-dmg">Schadenswürfel</label>
          <input id="sp-dmg" class="input mono" bind:value={form.damage} placeholder="8d6" autocomplete="off" />
          {#if errors.damage}<span class="err">{errors.damage}</span>{/if}
        </div>
        <div class="field">
          <label for="sp-dmgtype">Schadensart</label>
          <input id="sp-dmgtype" class="input" bind:value={form.damageType} list="sp-dmgtypes" autocomplete="off" />
          <datalist id="sp-dmgtypes">
            {#each DAMAGE_TYPE_OPTIONS as t (t)}<option value={t}></option>{/each}
          </datalist>
        </div>
        <div class="field">
          <label for="sp-heal">Heilungswürfel</label>
          <input id="sp-heal" class="input mono" bind:value={form.heal} placeholder="1d8" autocomplete="off" />
          {#if errors.heal}<span class="err">{errors.heal}</span>{/if}
          <label class="checkbox small"><input type="checkbox" bind:checked={form.healAddsModifier} /> + Zaubermodifikator</label>
        </div>
        <div class="field">
          <label for="sp-up">Pro höherem Grad</label>
          <input id="sp-up" class="input mono" bind:value={form.upcast} placeholder="1d6" autocomplete="off" />
          {#if errors.upcast}<span class="err">{errors.upcast}</span>{:else}<span class="tiny faint">Zusätzliche Würfel je Grad über dem Spruchgrad</span>{/if}
        </div>
        <div class="field">
          <label for="sp-ac">Rüstungsklasse</label>
          <select id="sp-ac" class="select" bind:value={form.acMode}>
            <option value="">Keine Wirkung</option>
            <option value="bonus">Bonus (z. B. Schild +5)</option>
            <option value="base">Grund-RK + GES (z. B. Magierrüstung 13)</option>
            <option value="min">Mindest-RK (z. B. Rindenhaut 16)</option>
          </select>
          {#if form.acMode}
            <input class="input mono" type="number" bind:value={form.acValue} aria-label="RK-Wert" />
            <span class="tiny faint">Wirkt nach dem Wirken für die Wirkungsdauer als aktiver Effekt.</span>
          {/if}
        </div>
      </div>
    </fieldset>

    <div class="grid-main">
      <div class="field">
        <label for="sp-char">Charakter</label>
        <select id="sp-char" class="select" bind:value={form.characterId}>
          <option value="">Ohne Charakter</option>
          {#each characters as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
      <div class="field checks-col">
        <span class="label">Vorbereitung</span>
        <label class="checkbox"><input type="checkbox" bind:checked={form.prepared} disabled={form.alwaysPrepared} /> Vorbereitet</label>
        <label class="checkbox"><input type="checkbox" bind:checked={form.alwaysPrepared} /> Immer vorbereitet</label>
      </div>
    </div>
    <div class="field">
      <label for="sp-notes">Notizen</label>
      <textarea id="sp-notes" class="textarea short" rows="3" bind:value={form.notes} placeholder="Eigene Notizen, Markdown möglich"></textarea>
    </div>
  </form>

  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="spell-form" disabled={saving}>
      {isNew ? "Zauber anlegen" : "Speichern"}
    </button>
  {/snippet}
</Modal>

<style>
  .grid-main {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 0.75rem;
  }
  @media (min-width: 700px) {
    .grid-main { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  .span-2 { grid-column: span 2; }
  .checks { margin: -0.2rem 0 0.9rem; gap: 1.2rem; }
  .checks-col { gap: 0.45rem; }
  .textarea.short { min-height: 70px; }
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.8rem 0;
    margin: 0 0 0.9rem;
  }
  legend {
    padding: 0 0.35rem;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }
  .err { color: var(--danger); font-size: 0.8rem; }
</style>
