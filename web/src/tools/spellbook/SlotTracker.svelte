<script lang="ts">
  import { RotateCcw } from "@lucide/svelte";
  import type { CharacterData } from "../../lib/character";

  let {
    data,
    onset,
    onreset,
  }: {
    data: CharacterData;
    /** level 1–9 oder "pact" */
    onset: (level: number | "pact", used: number) => void;
    onreset: () => void;
  } = $props();

  const rows = $derived([
    ...data.spellcasting.slots
      .map((s, i) => ({ key: i + 1 as number | "pact", label: String(i + 1), title: `Grad ${i + 1}`, max: s.max, used: s.used }))
      .filter(r => r.max > 0),
    ...(data.spellcasting.pact.max > 0
      ? [
          {
            key: "pact" as const,
            label: `Pakt ${data.spellcasting.pact.level}`,
            title: `Paktmagie (Grad ${data.spellcasting.pact.level})`,
            max: data.spellcasting.pact.max,
            used: data.spellcasting.pact.used,
          },
        ]
      : []),
  ]);

  const anyUsed = $derived(rows.some(r => r.used > 0));

  function tap(row: (typeof rows)[number], index: number) {
    // Pip antippen: bis hierhin verbraucht; den letzten verbrauchten erneut antippen gibt ihn frei
    const used = Math.min(row.used, row.max);
    onset(row.key, index < used ? index : index + 1);
  }
</script>

{#if rows.length}
  <div class="slots">
    <div class="row-between head">
      <span class="label">Zauberplätze</span>
      {#if anyUsed}
        <button class="btn btn-ghost btn-sm" onclick={onreset}><RotateCcw size={14} /> Alle frei</button>
      {/if}
    </div>
    <div class="list">
      {#each rows as row (row.key)}
        {@const used = Math.min(row.used, row.max)}
        <div class="slot-row" role="group" aria-label="{row.title}: {row.max - used} von {row.max} frei">
          <span class="lvl" class:pact={row.key === "pact"} title={row.title}>{row.label}</span>
          <div class="pips">
            {#each Array.from({ length: row.max }, (_, i) => i) as i (i)}
              <button
                class="pip"
                class:used={i < used}
                aria-pressed={i < used}
                aria-label="{row.title}, Platz {i + 1} {i < used ? 'verbraucht' : 'frei'}"
                onclick={() => tap(row, i)}
              ></button>
            {/each}
          </div>
          <span class="count tiny muted mono">{row.max - used}/{row.max}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .slots { margin-top: 0.9rem; }
  .head { margin-bottom: 0.4rem; min-height: 30px; }
  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.6rem;
  }
  .slot-row { display: flex; align-items: center; gap: 0.5rem; }
  .lvl {
    min-width: 0.9rem;
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--accent-text);
    white-space: nowrap;
  }
  .lvl.pact { font-size: 0.8rem; }
  .pips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .pip {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    cursor: pointer;
    padding: 0;
    position: relative;
    transition: background 0.12s, border-color 0.12s;
  }
  .pip:hover { background: var(--accent); }
  .pip.used {
    background: transparent;
    border-color: var(--border);
  }
  .pip.used::after {
    content: "";
    position: absolute;
    inset: 9px 3px auto;
    height: 2px;
    background: var(--faint);
    transform: rotate(-45deg);
    top: 10px;
  }
  .count { min-width: 1.8rem; }
</style>
