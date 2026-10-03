<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import Modal from "../../components/Modal.svelte";
  import { newAttack, sortProperties, type Attack } from "../../lib/character";
  import { parseDice } from "../../lib/dice";
  import { ABILITIES, ABILITY_SHORT } from "../../lib/dnd";
  import { WEAPON_PROPERTIES } from "../../lib/features";
  import { distanceUnit, feetToInput, inputToFeet } from "../../lib/units";
  import { untrack } from "svelte";
  import Stepper from "../../components/Stepper.svelte";
  import {
    AMMO_TYPES,
    RECOVERIES,
    itemById,
    newInventoryItem,
    suggestConsumption,
    type AmmoType,
    type ConsumptionSuggestion,
    type InventoryItem,
    type Recovery,
  } from "../../lib/inventory";
  import { sheet } from "./context";

  let { attack, onsave, onclose }: { attack: Attack; onsave: (a: Attack) => void; onclose: () => void } = $props();

  const ctx = sheet();

  const MASTERIES = ["", "Auslaugen (Sap)", "Einkerben (Nick)", "Plagen (Vex)", "Spalten (Cleave)", "Streifen (Graze)", "Stossen (Push)", "Umstossen (Topple)", "Verlangsamen (Slow)"];

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let a = $state(newAttack(JSON.parse(JSON.stringify(attack))));
  let error = $state<string | null>(null);

  // ── Verbrauch pro Angriff ──
  // svelte-ignore state_referenced_locally
  const startItem = itemById(ctx.data, attack.consumes?.itemId);
  /** "" = kein Verbrauch, "new" = neuer Gegenstand, sonst ID im Inventar */
  let consumeSel = $state(startItem?.id ?? "");
  // svelte-ignore state_referenced_locally
  let consumeAmount = $state(attack.consumes?.amount ?? 1);
  let recover = $state<Recovery>(startItem?.recover ?? "none");
  let draft = $state<InventoryItem>(newInventoryItem({ name: "", quantity: 1 }));
  /** Selbst gewählt: dann keine Vorschläge mehr aus dem Namen */
  let consumeTouched = $state(Boolean(startItem));

  const ammoItems = $derived(ctx.data.inventory.filter(i => i.ammo));
  const otherItems = $derived(ctx.data.inventory.filter(i => !i.ammo));
  const suggestion = $derived(suggestConsumption(ctx.data, { name: a.name, kind: a.kind, properties: a.properties }));
  const selectedItem = $derived(consumeSel === "new" ? draft : itemById(ctx.data, consumeSel));

  function applySuggestion(s: ConsumptionSuggestion | null) {
    if (!s) {
      consumeSel = "";
      return;
    }
    if (s.kind === "existing") {
      consumeSel = s.item.id;
      recover = s.item.recover;
    } else {
      draft = s.item;
      consumeSel = "new";
      recover = s.item.recover;
    }
  }

  // Name, Art und Eigenschaften schlagen Geschosse bzw. das Verbrauchsgut vor
  $effect(() => {
    const s = suggestion;
    if (!untrack(() => consumeTouched)) untrack(() => applySuggestion(s));
  });

  function chooseConsumption(v: string) {
    consumeTouched = true;
    consumeSel = v;
    const item = itemById(ctx.data, v);
    if (item) recover = item.recover;
    if (v === "new") {
      if (!draft.name.trim()) draft = suggestion?.kind === "new" ? suggestion.item : newInventoryItem({ name: a.name.trim(), quantity: 1 });
      recover = draft.recover;
    }
  }

  function setDraftAmmo(v: string) {
    const ammo = (v || null) as AmmoType | null;
    consumeTouched = true;
    draft.ammo = ammo;
    if (ammo) recover = "half";
  }

  /** Verbrauch übernehmen; neuer Gegenstand kommt ins Inventar. false bei Fehler */
  function commitConsumption(): boolean {
    if (!consumeSel) {
      a.consumes = null;
      return true;
    }
    let item: InventoryItem | undefined;
    if (consumeSel === "new") {
      if (!draft.name.trim()) {
        error = "Bitte einen Namen für den neuen Gegenstand eingeben.";
        return false;
      }
      item = { ...$state.snapshot(draft), name: draft.name.trim(), recover };
      ctx.data.inventory.push(item);
    } else {
      item = itemById(ctx.data, consumeSel);
      if (!item) {
        a.consumes = null;
        return true;
      }
      item.recover = recover;
    }
    a.consumes = { itemId: item.id, amount: Math.max(1, consumeAmount) };
    if (item.ammo && !a.properties.includes("Geschosse")) a.properties = sortProperties([...a.properties, "Geschosse"]);
    return true;
  }

  /** Fern- und Wurfwaffen haben eine Grund- und eine Fernreichweite */
  const hasLong = $derived(a.kind === "ranged" || a.properties.includes("Wurfwaffe"));
  const unit = $derived(distanceUnit(unitSystem()));

  function rangeInput(ft: number | null) {
    return ft == null ? "" : feetToInput(ft, unitSystem());
  }

  function setRange(field: "rangeNormal" | "rangeLong", raw: string) {
    const value = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    a[field] = value == null || !Number.isFinite(value) || value < 0 ? null : inputToFeet(value, unitSystem());
  }

  function toggleProperty(p: string) {
    a.properties = a.properties.includes(p) ? a.properties.filter(x => x !== p) : sortProperties([...a.properties, p]);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!a.name.trim()) {
      error = "Bitte einen Namen eingeben.";
      return;
    }
    if (!hasLong) a.rangeLong = null;
    if (a.rangeLong != null && a.rangeNormal == null) {
      error = "Bitte zuerst die Grundreichweite angeben.";
      return;
    }
    if (a.rangeLong != null && a.rangeNormal != null && a.rangeLong <= a.rangeNormal) {
      error = "Die Fernreichweite muss grösser sein als die Grundreichweite.";
      return;
    }
    if (a.rangeNormal != null) a.range = "";
    for (const [label, value] of [["Schaden", a.damage], ["Zweihändig", a.versatileDamage], ["Zusatzschaden", a.extraDamage]] as const) {
      if (value.trim() && !parseDice(value)) {
        error = `Ungültiger Würfelausdruck bei „${label}“: „${value}“ (Beispiel: 1d8).`;
        return;
      }
    }
    if (!commitConsumption()) return;
    onsave($state.snapshot(a) as Attack);
  }
</script>

<Modal title={attack.name ? `${attack.name} bearbeiten` : "Neuer Angriff"} size="lg" {onclose}>
  <form id="attack-form" onsubmit={submit}>
    <fieldset>
      <legend>Waffe</legend>
      <div class="grid-2">
        <label class="field"><span class="label">Name</span><input class="input" bind:value={a.name} required maxlength="120" placeholder="z. B. Langschwert" /></label>
        <label class="field">
          <span class="label">Art</span>
          <select class="select" bind:value={a.kind}>
            <option value="melee">Nahkampf</option>
            <option value="ranged">Fernkampf</option>
          </select>
        </label>
      </div>
      <div class="field">
        <span class="label">Eigenschaften</span>
        <div class="chip-row" role="group" aria-label="Waffeneigenschaften">
          {#each WEAPON_PROPERTIES as p (p)}
            <button type="button" class="chip" aria-pressed={a.properties.includes(p)} onclick={() => toggleProperty(p)}>{p}</button>
          {/each}
        </div>
        {#if a.properties.includes("Finesse")}
          <p class="tiny muted">Finesse: Beim Angriff wählst du STR oder GES (vorgeschlagen wird der bessere Wert).</p>
        {/if}
        {#if a.properties.includes("Leicht")}
          <p class="tiny muted">Leicht: Nach einem Angriff damit bietet der Assistent einen Zusatzangriff mit einer zweiten leichten Waffe an.</p>
        {/if}
      </div>
      <div class="grid-2 ranges">
        <label class="field">
          <span class="label">{hasLong ? "Grundreichweite" : "Reichweite"}</span>
          <span class="unit-input">
            <input
              class="input mono"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              value={rangeInput(a.rangeNormal)}
              placeholder={hasLong ? (unit === "m" ? "24" : "80") : unit === "m" ? "1.5" : "5"}
              onchange={e => setRange("rangeNormal", e.currentTarget.value)}
            />
            <span class="unit">{unit}</span>
          </span>
          <span class="tiny muted">
            {hasLong ? "Bis hier greifst du normal an." : `Nahkampf meist ${unit === "m" ? "1.5 m" : "5 ft"}, mit „Weitreichend“ ${unit === "m" ? "3 m" : "10 ft"}.`}
          </span>
        </label>
        {#if hasLong}
          <label class="field">
            <span class="label">Fernreichweite</span>
            <span class="unit-input">
              <input
                class="input mono"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                value={rangeInput(a.rangeLong)}
                placeholder={unit === "m" ? "96" : "320"}
                onchange={e => setRange("rangeLong", e.currentTarget.value)}
              />
              <span class="unit">{unit}</span>
            </span>
            <span class="tiny muted">Weiter weg bis hier: Angriff mit Nachteil. Darüber hinaus nicht möglich.</span>
          </label>
        {/if}
      </div>
      {#if a.range && a.rangeNormal == null}
        <p class="tiny muted">Bisherige Angabe: „{a.range}“. Bitte in die Felder oben übertragen.</p>
      {/if}
      <div class="grid-3">
        {#if ctx.ruleset === "2024"}
          <label class="field">
            <span class="label">Meisterschaft</span>
            <select class="select" bind:value={a.mastery}>
              {#each MASTERIES as m (m)}<option value={m}>{m || "–"}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
    </fieldset>

    <fieldset>
      <legend>Angriff &amp; Schaden</legend>
      <div class="grid-3">
        <label class="field">
          <span class="label">Attribut</span>
          <select class="select" bind:value={a.ability}>
            {#each ABILITIES as ab (ab)}<option value={ab}>{ABILITY_SHORT[ab]}</option>{/each}
            <option value="spell">Zauberattribut</option>
            <option value="none">keins</option>
          </select>
        </label>
        <label class="field"><span class="label">Bonus Treffer</span><input class="input mono" type="number" bind:value={a.toHitBonus} /></label>
        <label class="checkbox prof"><input type="checkbox" bind:checked={a.proficient} /> Geübt</label>
      </div>
      <div class="grid-3">
        <label class="field"><span class="label">Schaden</span><input class="input mono" bind:value={a.damage} placeholder="1d8" /></label>
        <label class="field"><span class="label">Bonus Schaden</span><input class="input mono" type="number" bind:value={a.damageBonus} /></label>
        <label class="field"><span class="label">Schadensart</span><input class="input" bind:value={a.damageType} placeholder="Hieb" /></label>
      </div>
      <div class="grid-3">
        {#if a.properties.includes("Vielseitig")}
          <label class="field"><span class="label">Zweihändig</span><input class="input mono" bind:value={a.versatileDamage} placeholder="1d10" /></label>
        {/if}
        <label class="field"><span class="label">Zusatzschaden</span><input class="input mono" bind:value={a.extraDamage} placeholder="z. B. 2d6" /></label>
        <label class="field"><span class="label">Zusatz-Art</span><input class="input" bind:value={a.extraDamageType} placeholder="Feuer" /></label>
      </div>
      <label class="checkbox small"><input type="checkbox" bind:checked={a.addAbilityToDamage} /> Attributsmodifikator auf Schaden</label>
    </fieldset>

    <fieldset>
      <legend>Verbrauch pro Angriff</legend>
      {#if !consumeTouched && suggestion}
        <p class="tiny muted">
          Vorschlag aus dem Namen: {suggestion.kind === "existing" ? `„${suggestion.item.name}“ aus dem Inventar` : `„${suggestion.item.name}“ neu anlegen`}.
        </p>
      {/if}
      <div class="grid-3">
        <label class="field">
          <span class="label">Gegenstand</span>
          <select class="select" value={consumeSel} onchange={e => chooseConsumption(e.currentTarget.value)}>
            <option value="">kein Verbrauch</option>
            {#if ammoItems.length}
              <optgroup label="Geschosse">
                {#each ammoItems as i (i.id)}<option value={i.id}>{i.name} ({i.quantity})</option>{/each}
              </optgroup>
            {/if}
            {#if otherItems.length}
              <optgroup label="Gegenstände">
                {#each otherItems as i (i.id)}<option value={i.id}>{i.name} ({i.quantity})</option>{/each}
              </optgroup>
            {/if}
            <option value="new">Neuer Gegenstand …</option>
          </select>
        </label>
        {#if consumeSel}
          <div class="field">
            <span class="label">Menge pro Angriff</span>
            <span><Stepper bind:value={consumeAmount} min={1} label="Menge pro Angriff" /></span>
          </div>
          <label class="field">
            <span class="label">Nach dem Kampf</span>
            <select class="select" bind:value={recover} onchange={() => (consumeTouched = true)}>
              {#each RECOVERIES as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
      {#if consumeSel === "new"}
        <div class="grid-3">
          <label class="field"><span class="label">Name im Inventar</span><input class="input" bind:value={draft.name} oninput={() => (consumeTouched = true)} maxlength="120" placeholder="z. B. Pfeile" /></label>
          <div class="field">
            <span class="label">Startmenge</span>
            <span><Stepper bind:value={draft.quantity} label="Startmenge" onchange={() => (consumeTouched = true)} /></span>
          </div>
          <label class="field">
            <span class="label">Geschoss</span>
            <select class="select" value={draft.ammo ?? ""} onchange={e => setDraftAmmo(e.currentTarget.value)}>
              <option value="">kein Geschoss</option>
              {#each AMMO_TYPES as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
      {#if selectedItem}
        <p class="tiny muted">
          Jeder Angriff zieht {consumeAmount} × „{selectedItem.name || "Gegenstand"}“ ab.
          {RECOVERIES.find(r => r.key === recover)?.hint}
          {#if a.kind === "melee" && a.properties.includes("Wurfwaffe")}Im Angriffsdialog wählst du Nahkampf oder Werfen; verbraucht wird nur beim Werfen.{/if}
          {#if consumeSel === "new"}Beim Speichern kommt der Gegenstand mit {draft.quantity} Stück ins Inventar.{/if}
        </p>
      {:else}
        <p class="tiny muted">Pfeile, Bolzen, Wurfdolche, Alchemistenfeuer … werden bei jedem Angriff aus dem Inventar abgezogen.</p>
      {/if}
    </fieldset>

    <label class="field"><span class="label">Notiz</span><input class="input" bind:value={a.notes} placeholder="Besonderheiten …" /></label>
    {#if error}<p class="error small">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="attack-form">Speichern</button>
  {/snippet}
</Modal>

<style>
  .ranges { align-items: start; }
  .ranges > .field { min-width: 0; }
  .unit-input { display: flex; align-items: center; gap: 0.4rem; }
  .unit-input .input { flex: 1; min-width: 0; }
  .unit { color: var(--muted); font-size: 0.9rem; }
  fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
  legend {
    font-family: var(--font-display);
    font-weight: 700;
    margin-bottom: 0.6rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
    width: 100%;
  }
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
  .prof { align-self: center; margin-top: 0.8rem; }
  .error { color: var(--danger); }
</style>
