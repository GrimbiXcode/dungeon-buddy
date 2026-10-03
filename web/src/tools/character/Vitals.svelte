<script lang="ts">
  import NumberField from "../../components/NumberField.svelte";
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText, distanceUnit, feetToInput, formatDistance, inputToFeet } from "../../lib/units";
  import { Minus, Plus } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import { applyDamage, applyHealing, initiative, profBonus } from "../../lib/character";
  import { formatMod, rulesTerms } from "../../lib/dnd";
  import { armorClass } from "../../lib/armor";
  import { sheet } from "./context";
  import ArmorClassModal from "./ArmorClassModal.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  const terms = $derived(rulesTerms(ctx.ruleset));

  let amount = $state<number | null>(null);
  let showAc = $state(false);
  const ac = $derived(armorClass(c));
  const acBoosted = $derived(c.combat.effects.some(e => e.ac && e.ac.mode !== "none"));

  function apply(kind: "damage" | "heal" | "temp") {
    const n = Math.floor(Number(amount));
    if (!n || n < 0) return;
    if (kind === "damage") applyDamage(c, n);
    else if (kind === "heal") applyHealing(c, n);
    else c.hp.temp = Math.max(c.hp.temp, n);
    amount = null;
  }

  const hpPercent = $derived(c.hp.max > 0 ? Math.min(100, Math.round((c.hp.current / c.hp.max) * 100)) : 0);
  const exhaustionText = $derived.by(() => {
    if (!c.exhaustion) return "";
    if (ctx.ruleset === "2024") return `${-2 * c.exhaustion} auf W20-Tests, −${formatDistance(5 * c.exhaustion, unitSystem())} Bewegung`;
    return [
      "Nachteil auf Attributswürfe",
      "Bewegungsrate halbiert",
      "Nachteil auf Angriffe & Rettungswürfe",
      "TP-Maximum halbiert",
      "Bewegungsrate 0",
      "Tod",
    ]
      .slice(0, c.exhaustion)
      .join(" · ");
  });
</script>

<div class="vitals">
  {#if ctx.editing && c.acMode === "manual"}
    <div class="stat">
      <span class="label"><Icon name="armor" size={13} /> RK (Grundwert)</span>
      <NumberField class="input input-sm mono" aria-label="Rüstungsklasse" bind:value={c.ac} />
    </div>
  {:else}
    <button class="stat clickable" onclick={() => (showAc = true)} title={ac.parts.map(p => `${p.label} ${p.value}`).join(", ")}>
      <span class="label"><Icon name="armor" size={13} /> RK</span>
      <span class="value mono" class:boosted={acBoosted}>{ac.total}</span>
    </button>
  {/if}
  <button class="stat clickable" disabled={ctx.editing} onclick={() => ctx.rollD20("Initiative", initiative(c), "initiative", { ability: "dex" })}>
    <span class="label"><Icon name="initiative" size={13} /> Initiative</span>
    <span class="value mono">{formatMod(initiative(c))}</span>
  </button>
  <div class="stat">
    <span class="label"><Icon name="speed" size={13} /> Bewegung</span>
    {#if ctx.editing}
      <input
        class="input input-sm mono"
        type="number"
        step={unitSystem() === "metric" ? 1.5 : 5}
        value={feetToInput(c.speed, unitSystem())}
        onchange={e => {
          const el = e.currentTarget as HTMLInputElement;
          // Leeres oder ungültiges Feld: alten Wert behalten
          if (el.value !== "" && Number.isFinite(el.valueAsNumber)) c.speed = Math.max(0, inputToFeet(el.valueAsNumber, unitSystem()));
          el.value = String(feetToInput(c.speed, unitSystem()));
        }}
        aria-label="Bewegungsrate in {distanceUnit(unitSystem())}"
      />
    {:else}
      <span class="value mono">{formatDistance(c.speed, unitSystem()).split(" ")[0]}<small> {distanceUnit(unitSystem())}</small></span>
    {/if}
  </div>
  <div class="stat">
    <span class="label"><Icon name="proficiency" size={13} /> Übung</span>
    <span class="value mono">{formatMod(profBonus(c))}</span>
  </div>

  <div class="hp card">
    <div class="row-between">
      <span class="label"><Icon name="hp" size={13} /> Trefferpunkte</span>
      {#if c.hp.temp > 0}<span class="badge badge-accent">+{c.hp.temp} temporär</span>{/if}
    </div>
    <div class="hp-main">
      {#if ctx.editing}
        <label class="tiny muted">Aktuell <NumberField class="input input-sm mono" bind:value={c.hp.current} /></label>
        <label class="tiny muted">Maximum <NumberField class="input input-sm mono" bind:value={c.hp.max} /></label>
        <label class="tiny muted">Temporär <NumberField class="input input-sm mono" min={0} bind:value={c.hp.temp} /></label>
      {:else}
        <span class="hp-value mono" class:down={c.hp.current === 0}>{c.hp.current}<small>/{c.hp.max}</small></span>
        <div class="hp-actions">
          <input class="input input-sm mono" type="number" min="0" inputmode="numeric" placeholder="Wert" bind:value={amount} aria-label="Trefferpunkte-Wert" />
          <button class="btn btn-sm btn-danger" onclick={() => apply("damage")} aria-label="Schaden"><Minus size={14} /> Schaden</button>
          <button class="btn btn-sm" onclick={() => apply("heal")} aria-label="Heilen"><Plus size={14} /> Heilen</button>
          <button class="btn btn-sm btn-ghost" onclick={() => apply("temp")}>Temp</button>
        </div>
      {/if}
    </div>
    <div class="bar"><span style="width:{hpPercent}%" class:low={hpPercent <= 30}></span></div>
  </div>

  <div class="extras">
    <button class="toggle" class:on={c.inspiration} onclick={() => (c.inspiration = !c.inspiration)} aria-pressed={c.inspiration}>
      <Icon name="inspiration" size={15} /> {terms.inspiration}
    </button>
    <div class="exhaustion" title={exhaustionText}>
      <span class="small">Erschöpfung</span>
      <button class="btn btn-sm btn-icon" aria-label="Erschöpfung verringern" disabled={c.exhaustion === 0} onclick={() => (c.exhaustion = Math.max(0, c.exhaustion - 1))}><Minus size={14} /></button>
      <strong class="mono">{c.exhaustion}</strong>
      <button class="btn btn-sm btn-icon" aria-label="Erschöpfung erhöhen" disabled={c.exhaustion >= 6} onclick={() => (c.exhaustion = Math.min(6, c.exhaustion + 1))}><Plus size={14} /></button>
    </div>
    {#if exhaustionText}<span class="tiny exhaustion-text">{exhaustionText}</span>{/if}
  </div>
</div>

{#if showAc}
  <ArmorClassModal onclose={() => (showAc = false)} />
{/if}

<style>
  .vitals {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0.55rem 0.3rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font: inherit;
    color: inherit;
  }
  .stat .label { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; }
  .stat input { width: 4.5rem; text-align: center; }
  .clickable { cursor: pointer; }
  .clickable:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
  .clickable:disabled { cursor: default; }
  .value { font-size: 1.45rem; font-weight: 800; font-family: var(--font-display); }
  .value.boosted { color: var(--accent-text); }
  .value small { font-size: 0.7rem; color: var(--muted); }
  .hp { grid-column: 1 / -1; padding: 0.7rem 0.9rem; }
  .hp .label { display: inline-flex; align-items: center; gap: 0.25rem; }
  .hp-main { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin: 0.3rem 0 0.5rem; }
  .hp-main label { display: flex; flex-direction: column; gap: 0.2rem; width: 6rem; }
  .hp-value { font-size: 2rem; font-weight: 800; font-family: var(--font-display); line-height: 1; }
  .hp-value small { font-size: 1rem; color: var(--muted); }
  .hp-value.down { color: var(--danger); }
  .hp-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; flex: 1; justify-content: flex-end; }
  .hp-actions input { width: 5rem; }
  .bar { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--success); transition: width 0.25s; }
  .bar span.low { background: var(--danger); }
  .extras { grid-column: 1 / -1; display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
  }
  .toggle.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 650; }
  .exhaustion { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.3rem 0.2rem 0.7rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
  .exhaustion strong { min-width: 1ch; text-align: center; }
  .exhaustion-text { color: var(--danger); }
  @media (min-width: 1100px) {
    .vitals { grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 2.4fr); }
    .hp { grid-column: auto; grid-row: span 1; }
  }
</style>
