<script lang="ts">
  import NumberField from "../../components/NumberField.svelte";
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText, distanceUnit, feetToInput, formatDistance, inputToFeet } from "../../lib/units";
  import { Minus, Plus } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import { applyDamage, applyHealing, effectiveMaxHp, effectiveSpeed, initiative, profBonus } from "../../lib/character";
  import { formatMod, rulesTerms } from "../../lib/dnd";
  import { armorClass } from "../../lib/armor";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";
  import ArmorClassModal from "./ArmorClassModal.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  const terms = $derived(rulesTerms(ctx.ruleset));

  let amount = $state<number | null>(null);
  let showAc = $state(false);
  const ac = $derived(armorClass(c));
  const acBoosted = $derived(c.combat.effects.some(e => e.ac && e.ac.mode !== "none"));

  /** Kritischer Treffer bei 0 TP: zwei Fehlschläge */
  let critHit = $state(false);

  function apply(kind: "damage" | "heal" | "temp") {
    const n = Math.floor(Number(amount));
    if (!n || n < 0) return;
    if (kind === "damage") {
      const note = applyDamage(c, n, { crit: critHit });
      if (note) toast(note);
      critHit = false;
    }
    else if (kind === "heal") applyHealing(c, n, maxHp);
    else c.hp.temp = Math.max(c.hp.temp, n);
    amount = null;
  }

  /** TP-Maximum und Bewegung unter Erschöpfung */
  const maxHp = $derived(effectiveMaxHp(c, ctx.ruleset));
  const speed = $derived(effectiveSpeed(c, ctx.ruleset));
  const hpPercent = $derived(maxHp > 0 ? Math.min(100, Math.round((c.hp.current / maxHp) * 100)) : 0);

  function setExhaustion(level: number) {
    c.exhaustion = Math.min(6, Math.max(0, level));
    // Halbiertes Maximum: aktuelle TP darüber hinaus verfallen
    c.hp.current = Math.min(c.hp.current, effectiveMaxHp(c, ctx.ruleset));
  }
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
      <span class="label"><Icon name="armor" size={13} /> Grund-RK</span>
      <NumberField class="input input-sm mono" aria-label="Rüstungsklasse" bind:value={c.ac} />
    </div>
  {:else}
    <button class="stat clickable" onclick={() => (showAc = true)} title={ac.parts.map(p => `${p.label} ${p.value}`).join(", ")}>
      <span class="label"><Icon name="armor" size={13} /> RK</span>
      <span class="value mono" class:boosted={acBoosted}>{ac.total}</span>
    </button>
  {/if}
  {#if ctx.editing}
    <div class="stat">
      <span class="label"><Icon name="initiative" size={13} /> Initiative-Bonus</span>
      <NumberField class="input input-sm mono" bind:value={c.initiativeBonus} aria-label="Zusätzlicher Initiative-Bonus" title="Zusätzlich zu GES (z. B. Talent Aufmerksam)" />
    </div>
  {:else}
    <button class="stat clickable" onclick={() => ctx.rollD20("Initiative", initiative(c, ctx.ruleset), "initiative", { ability: "dex" })}>
      <span class="label"><Icon name="initiative" size={13} /> Initiative</span>
      <span class="value mono">{formatMod(initiative(c, ctx.ruleset))}</span>
    </button>
  {/if}
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
      <span class="value mono" class:reduced={speed !== c.speed} title={speed !== c.speed ? `Erschöpfung: sonst ${formatDistance(c.speed, unitSystem())}` : undefined}
        >{formatDistance(speed, unitSystem()).split(" ")[0]}<small> {distanceUnit(unitSystem())}</small></span
      >
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
        <span class="hp-value mono" class:down={c.hp.current === 0}
          >{c.hp.current}<small>/{maxHp}</small>{#if maxHp !== c.hp.max}<small class="reduced" title="Erschöpfung: TP-Maximum halbiert"> (½)</small>{/if}</span
        >
        <div class="hp-actions">
          <input class="input input-sm mono" type="number" min="0" inputmode="numeric" placeholder="Wert" bind:value={amount} aria-label="Trefferpunkte-Wert" />
          <button class="btn btn-sm btn-danger" onclick={() => apply("damage")} aria-label="Schaden"><Minus size={14} /> Schaden</button>
          <button class="btn btn-sm" onclick={() => apply("heal")} aria-label="Heilen"><Plus size={14} /> Heilen</button>
          <button class="btn btn-sm btn-ghost" onclick={() => apply("temp")}>Temp</button>
          {#if c.hp.current === 0}
            <label class="checkbox tiny"><input type="checkbox" bind:checked={critHit} /> Kritischer Treffer (2 Fehlschläge)</label>
          {/if}
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
      <button class="btn btn-sm btn-icon" aria-label="Erschöpfung verringern" disabled={c.exhaustion === 0} onclick={() => setExhaustion(c.exhaustion - 1)}><Minus size={14} /></button>
      <strong class="mono">{c.exhaustion}</strong>
      <button class="btn btn-sm btn-icon" aria-label="Erschöpfung erhöhen" disabled={c.exhaustion >= 6} onclick={() => setExhaustion(c.exhaustion + 1)}><Plus size={14} /></button>
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
  /* Umbruch an Wortgrenzen bzw. mit Silbentrennung, nicht mitten im Wort */
  .stat .label { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; max-width: 100%; text-align: center; overflow-wrap: break-word; hyphens: auto; }
  .stat :global(input) { width: 4.5rem; max-width: 100%; text-align: center; }
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
  .reduced { color: var(--warning); }
  /* Knöpfe behalten ihre Höhe; der Krit-Hinweis bei 0 TP steht in einer eigenen Zeile */
  .hp-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; flex: 1; justify-content: flex-end; align-items: center; }
  .hp-main .hp-actions .checkbox { flex-basis: 100%; flex-direction: row; width: auto; justify-content: flex-end; }
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
    /* RK, Initiative, Bewegung, Übung als 2×2-Block neben den Trefferpunkten:
       so sind die Kacheln so hoch wie ihr Inhalt und die TP haben Platz für ihre Knöpfe */
    .vitals { grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 2.6fr); }
    .hp { grid-column: 3; grid-row: 1 / span 2; display: flex; flex-direction: column; justify-content: center; }
    .stat { flex-direction: row; justify-content: space-between; padding: 0.5rem 0.9rem; }
    .stat .label { font-size: 0.72rem; flex: 1 1 0; min-width: 0; text-align: left; }
    /* Eingabefelder im Bearbeiten-Modus nicht zusammendrücken; lieber bricht die Bezeichnung um */
    .stat :global(input) { flex: none; }
  }
  @media (max-width: 420px) {
    /* Schmale Kacheln: Symbole weglassen, damit „Bewegung“ & Co. hineinpassen */
    .stat .label :global(svg) { display: none; }
  }
</style>
