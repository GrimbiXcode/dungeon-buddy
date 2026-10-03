<script lang="ts">
  import { roller } from "../../lib/roller.svelte";
  import { sheet } from "./context";

  const ctx = sheet();
  /** Nur Würfe dieses Charakters */
  const entries = $derived(roller.log.filter(e => e.owner === ctx.characterId));

  const time = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" });
</script>

{#if entries.length}
  <section class="card log">
    <h3>Letzte Würfe</h3>
    <ul>
      {#each entries.slice(0, 8) as entry (entry.id)}
        <li class:crit={entry.flag === "crit"} class:fumble={entry.flag === "fumble"}>
          <strong class="mono total">{entry.total}</strong>
          <span class="grow">
            <span class="small">{entry.title}</span>
            <span class="tiny muted block">{entry.detail}</span>
          </span>
          <span class="tiny faint">{time.format(entry.at)}</span>
        </li>
      {/each}
    </ul>
    <p class="tiny faint">Würfe werden nicht gespeichert.</p>
  </section>
{/if}

<style>
  h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0.4rem; border-radius: var(--radius-sm); background: var(--surface-2); }
  .total { min-width: 2.2rem; text-align: center; font-size: 1.1rem; font-family: var(--font-display); }
  li.crit .total { color: var(--success); }
  li.fumble .total { color: var(--danger); }
  .block { display: block; }
  .log p { margin: 0.5rem 0 0; }
</style>
