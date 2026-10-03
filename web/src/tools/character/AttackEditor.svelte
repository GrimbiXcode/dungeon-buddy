<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import Modal from "../../components/Modal.svelte";
  import { newAttack, type Attack } from "../../lib/character";
  import { parseDice } from "../../lib/dice";
  import { ABILITIES, ABILITY_SHORT } from "../../lib/dnd";
  import { WEAPON_PROPERTIES } from "../../lib/features";
  import { distanceUnit, feetToInput, inputToFeet } from "../../lib/units";
  import { sheet } from "./context";

  let { attack, onsave, onclose }: { attack: Attack; onsave: (a: Attack) => void; onclose: () => void } = $props();

  const ctx = sheet();

  const MASTERIES = ["", "Auslaugen (Sap)", "Einkerben (Nick)", "Plagen (Vex)", "Spalten (Cleave)", "Streifen (Graze)", "Stossen (Push)", "Umstossen (Topple)", "Verlangsamen (Slow)"];

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let a = $state(newAttack(JSON.parse(JSON.stringify(attack))));
  let error = $state<string | null>(null);

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
    a.properties = a.properties.includes(p) ? a.properties.filter(x => x !== p) : [...a.properties, p];
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
