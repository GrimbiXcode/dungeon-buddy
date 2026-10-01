<script lang="ts">
  import { ArrowLeftRight, Ruler, X } from "@lucide/svelte";
  import { unitSystem } from "../lib/session.svelte";
  import { COINS, calcCategories, formatNumber, type ConversionMode } from "../lib/units";

  const STORE_KEY = "db-unit-calc";

  let open = $state(false);
  let mode = $state<ConversionMode>("table");
  let categoryKey = $state("length");
  let fromText = $state("30");
  let toText = $state("");
  let coinAmount = $state("1");
  let coinType = $state<(typeof COINS)[number]["key"]>("gp");
  let drawer: HTMLElement | undefined = $state();

  // Letzte Auswahl merken (nur im Browser)
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { mode?: ConversionMode; category?: string };
    if (saved.mode === "exact" || saved.mode === "table") mode = saved.mode;
    if (saved.category) categoryKey = saved.category;
  } catch {
    /* ignorieren */
  }

  $effect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ mode, category: categoryKey }));
    } catch {
      /* ignorieren */
    }
  });

  const categories = $derived(calcCategories(unitSystem()));
  const isCoins = $derived(categoryKey === "coins");
  const category = $derived(categories.find(c => c.key === categoryKey) ?? (isCoins ? null : categories[0]!));

  const parse = (s: string) => {
    const n = Number(s.trim().replace(/['’]/g, "").replace(",", "."));
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  // Ergebnis neu berechnen, wenn Kategorie oder Modus wechseln
  $effect(() => {
    if (!category) return;
    const v = parse(fromText);
    toText = v == null ? "" : formatNumber(category.convert(v, mode), 2).replace(/\s/g, "");
  });

  function onFrom(value: string) {
    fromText = value;
  }

  function onTo(value: string) {
    toText = value;
    const v = parse(value);
    if (category && v != null) fromText = formatNumber(category.back(v, mode), 2).replace(/\s/g, "");
  }

  function selectCategory(key: string) {
    categoryKey = key;
    const c = categories.find(x => x.key === key);
    if (c) fromText = String(c.presets[Math.min(2, c.presets.length - 1)]);
  }

  const coinTotalCp = $derived((parse(coinAmount) ?? 0) * (COINS.find(c => c.key === coinType)?.cp ?? 1));

  function toggle() {
    open = !open;
    if (open) queueMicrotask(() => drawer?.querySelector<HTMLInputElement>("input")?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      open = false;
    }
  }
</script>

<svelte:window {onkeydown} />

<button
  class="tab"
  class:hidden={open}
  onclick={toggle}
  aria-expanded={open}
  aria-controls="unit-calculator"
  title="Einheitenrechner"
>
  <Ruler size={16} />
  <span>Einheiten</span>
</button>

{#if open}
  <button class="backdrop" aria-label="Einheitenrechner schliessen" onclick={() => (open = false)}></button>
{/if}

<aside id="unit-calculator" class="drawer" class:open aria-hidden={!open} bind:this={drawer} inert={!open}>
  <header>
    <h2><Ruler size={18} /> Einheitenrechner</h2>
    <button class="btn btn-ghost btn-icon" onclick={() => (open = false)} aria-label="Schliessen"><X size={18} /></button>
  </header>

  <div class="segmented mode" role="group" aria-label="Umrechnungsart">
    <button aria-pressed={mode === "table"} onclick={() => (mode = "table")}>Spieltisch</button>
    <button aria-pressed={mode === "exact"} onclick={() => (mode = "exact")}>Exakt</button>
  </div>
  <p class="tiny muted hint">
    {mode === "table"
      ? "Wie in den deutschen Regelwerken: 5 ft = 1.5 m, 1 Meile = 1.5 km, 1 lb = 0.5 kg."
      : "Physikalisch genau: 1 ft = 0.3048 m, 1 Meile = 1.609 km, 1 lb = 0.454 kg."}
  </p>

  <div class="chip-row cats" role="group" aria-label="Kategorie">
    {#each categories as c (c.key)}
      <button class="chip" aria-pressed={categoryKey === c.key} onclick={() => selectCategory(c.key)}>{c.label}</button>
    {/each}
    <button class="chip" aria-pressed={isCoins} onclick={() => (categoryKey = "coins")}>Münzen</button>
  </div>

  {#if category}
    <div class="converter">
      <label class="unit-field">
        <span class="label">{category.from}</span>
        <input class="input mono big" inputmode="decimal" value={fromText} oninput={e => onFrom((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <ArrowLeftRight size={18} class="faint swap" />
      <label class="unit-field">
        <span class="label">{category.to}</span>
        <input class="input mono big" inputmode="decimal" value={toText} oninput={e => onTo((e.currentTarget as HTMLInputElement).value)} />
      </label>
    </div>
    <div class="chip-row presets">
      {#each category.presets as p (p)}
        <button class="chip" onclick={() => onFrom(String(p))}>{formatNumber(p)} {category.from}</button>
      {/each}
    </div>
    {#if !category.modeDependent}<p class="tiny faint">Unabhängig von der Umrechnungsart.</p>{/if}

    <table class="ref small">
      <caption class="tiny muted">Schnellübersicht</caption>
      <tbody>
        {#each category.presets as p (p)}
          <tr><td class="mono">{formatNumber(p)} {category.from}</td><td class="mono">{formatNumber(category.convert(p, mode))} {category.to}</td></tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <div class="coins">
      <div class="row">
        <input class="input mono grow" inputmode="decimal" bind:value={coinAmount} aria-label="Anzahl Münzen" />
        <select class="select coin-select" bind:value={coinType} aria-label="Münzart">
          {#each COINS as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
        </select>
      </div>
      <table class="ref small">
        <tbody>
          {#each COINS as c (c.key)}
            <tr><td>{c.label}</td><td class="mono">{formatNumber(coinTotalCp / c.cp, 2)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="tiny faint">1 PM = 10 GM · 1 GM = 2 EM = 10 SM = 100 KM</p>
    </div>
  {/if}
</aside>

<style>
  .tab {
    position: fixed;
    z-index: 80;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.7rem 0.35rem;
    border: 1px solid var(--accent);
    border-right: 0;
    border-radius: 10px 0 0 10px;
    background: var(--accent-strong);
    color: var(--accent-contrast);
    cursor: pointer;
    box-shadow: var(--shadow);
    opacity: 0.85;
    transition: opacity 0.15s, padding 0.15s;
  }
  .tab:hover, .tab:focus-visible { opacity: 1; padding-right: 0.55rem; }
  .tab span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; }
  .tab.hidden { opacity: 0; pointer-events: none; }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 85;
    border: 0;
    background: rgb(5 3 10 / 0.35);
    cursor: default;
  }
  .drawer {
    position: fixed;
    z-index: 90;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 100vw);
    padding: 1rem 1.1rem calc(1rem + env(safe-area-inset-bottom));
    overflow-y: auto;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow);
    transform: translateX(105%);
    transition: transform 0.22s ease-out;
    visibility: hidden;
  }
  .drawer.open { transform: none; visibility: visible; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem; }
  h2 { display: inline-flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1.1rem; }
  .mode { width: 100%; }
  .mode button { flex: 1; }
  .hint { margin: 0.4rem 0 0.8rem; }
  .cats { margin-bottom: 0.9rem; }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .converter { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.5rem; align-items: end; }
  .converter :global(.swap) { margin-bottom: 0.7rem; }
  .unit-field { display: flex; flex-direction: column; gap: 0.25rem; }
  .big { font-size: 1.25rem; font-weight: 700; text-align: right; }
  .presets { margin: 0.6rem 0 0.4rem; }
  .ref { width: 100%; border-collapse: collapse; margin-top: 0.8rem; }
  .ref caption { text-align: left; margin-bottom: 0.3rem; }
  .ref td { padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border); }
  .ref td:last-child { text-align: right; }
  .coin-select { width: 5.5rem; }
  @media (max-width: 767px) {
    .tab { top: auto; bottom: calc(6.5rem + env(safe-area-inset-bottom)); transform: none; padding: 0.55rem 0.3rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer { transition: none; }
  }
</style>
