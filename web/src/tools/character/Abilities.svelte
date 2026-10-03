<script lang="ts">
  import { ABILITIES, ABILITY_NAMES, ABILITY_SHORT, formatMod } from "../../lib/dnd";
  import { mod, saveBonus } from "../../lib/character";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);
</script>

<section class="card">
  <h3>Attribute</h3>
  <div class="abilities">
    {#each ABILITIES as a (a)}
      {#if ctx.editing}
        <label class="ability editing">
          <span class="short">{ABILITY_SHORT[a]}</span>
          <input class="input input-sm score-input mono" type="number" min="1" max="30" bind:value={c.abilities[a]} aria-label={ABILITY_NAMES[a]} />
          <span class="mod mono">{formatMod(mod(c, a))}</span>
        </label>
      {:else}
        <button class="ability" title="{ABILITY_NAMES[a]}swurf" onclick={() => ctx.rollD20(`${ABILITY_NAMES[a]}swurf`, mod(c, a), "check", { ability: a })}>
          <span class="short">{ABILITY_SHORT[a]}</span>
          <span class="mod mono">{formatMod(mod(c, a))}</span>
          <span class="score mono">{c.abilities[a]}</span>
        </button>
      {/if}
    {/each}
  </div>

  <h4 class="label saves-title">Rettungswürfe</h4>
  <div class="saves">
    {#each ABILITIES as a (a)}
      {#if ctx.editing}
        <label class="save checkbox">
          <input type="checkbox" bind:checked={c.saveProficiencies[a]} />
          <span class="grow">{ABILITY_NAMES[a]}</span>
          <span class="mono">{formatMod(saveBonus(c, a))}</span>
        </label>
      {:else}
        <button class="save" onclick={() => ctx.rollD20(`Rettungswurf ${ABILITY_NAMES[a]}`, saveBonus(c, a), "save", { ability: a })}>
          <span class="dot" class:on={c.saveProficiencies[a]} aria-label={c.saveProficiencies[a] ? "geübt" : "nicht geübt"}></span>
          <span class="grow">{ABILITY_NAMES[a]}</span>
          <span class="mono bonus">{formatMod(saveBonus(c, a))}</span>
        </button>
      {/if}
    {/each}
  </div>
</section>

<style>
  h3 { margin-bottom: 0.7rem; }
  .abilities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  @media (min-width: 1280px) {
    .abilities { grid-template-columns: repeat(6, 1fr); }
  }
  .ability {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.55rem 0.3rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  button.ability:hover { border-color: var(--accent); background: var(--accent-soft); }
  .ability.editing { cursor: default; }
  .short { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; color: var(--muted); }
  .mod { font-size: 1.5rem; font-weight: 800; font-family: var(--font-display); line-height: 1.2; }
  .ability.editing .mod { font-size: 0.95rem; color: var(--muted); }
  .score {
    font-size: 0.8rem;
    padding: 0 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .score-input { width: 4.2rem; text-align: center; font-weight: 700; font-size: 1.1rem; }
  .saves-title { margin: 1rem 0 0.4rem; }
  .saves { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem 0.75rem; }
  .save {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  button.save:hover { background: var(--surface-2); border-color: var(--border); }
  label.save { cursor: pointer; }
  .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--faint); flex: none; }
  .dot.on { background: var(--accent); border-color: var(--accent); }
  .bonus { font-weight: 700; }
  @media (max-width: 420px) {
    .saves { grid-template-columns: 1fr; }
  }
</style>
