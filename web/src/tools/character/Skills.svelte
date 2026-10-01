<script lang="ts">
  import { ABILITY_SHORT, SKILLS, formatMod, type SkillKey } from "../../lib/dnd";
  import { passive, skillBonus } from "../../lib/character";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);

  const sorted = [...SKILLS].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const levelLabel = ["nicht geübt", "geübt", "Expertise"];

  function cycle(key: SkillKey) {
    c.skills[key] = ((c.skills[key] + 1) % 3) as 0 | 1 | 2;
  }
</script>

<section class="card">
  <div class="row-between head">
    <h3>Fertigkeiten</h3>
    {#if ctx.editing}
      <label class="checkbox small"><input type="checkbox" bind:checked={c.jackOfAllTrades} /> Alleskönner</label>
    {/if}
  </div>
  {#if ctx.editing}<p class="tiny muted hint">Tippe auf den Kreis: nicht geübt → geübt → Expertise.</p>{/if}
  <div class="skills">
    {#each sorted as s (s.key)}
      <div class="skill">
        {#if ctx.editing}
          <button class="prof l{c.skills[s.key]}" onclick={() => cycle(s.key)} aria-label="{s.name}: {levelLabel[c.skills[s.key]]}" title={levelLabel[c.skills[s.key]]}></button>
          <span class="grow">{s.name} <span class="tiny faint">{ABILITY_SHORT[s.ability]}</span></span>
          <span class="mono bonus">{formatMod(skillBonus(c, s.key))}</span>
        {:else}
          <button class="roll" onclick={() => ctx.rollD20(s.name, skillBonus(c, s.key), "skill", { subtitle: `Fertigkeit (${ABILITY_SHORT[s.ability]})` })}>
            <span class="prof l{c.skills[s.key]}" title={levelLabel[c.skills[s.key]]}></span>
            <span class="grow">{s.name} <span class="tiny faint">{ABILITY_SHORT[s.ability]}</span></span>
            <span class="mono bonus">{formatMod(skillBonus(c, s.key))}</span>
          </button>
        {/if}
      </div>
    {/each}
  </div>
  <div class="passives small muted">
    <span>Passive Wahrnehmung <strong class="mono">{passive(c, "perception")}</strong></span>
    <span>Passives Motiv erkennen <strong class="mono">{passive(c, "insight")}</strong></span>
    <span>Passive Nachforschungen <strong class="mono">{passive(c, "investigation")}</strong></span>
  </div>
</section>

<style>
  .head { margin-bottom: 0.5rem; }
  .head h3 { margin: 0; }
  .hint { margin: 0 0 0.5rem; }
  .skills { columns: 2; column-gap: 0.75rem; }
  @media (max-width: 520px) {
    .skills { columns: 1; }
  }
  .skill { break-inside: avoid; display: flex; align-items: center; gap: 0.5rem; min-height: 34px; padding: 0 0.5rem; }
  .skill:has(.roll) { padding: 0; }
  .roll {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 34px;
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .roll:hover { background: var(--surface-2); border-color: var(--border); }
  .prof {
    width: 14px;
    height: 14px;
    flex: none;
    border-radius: 50%;
    border: 2px solid var(--faint);
    background: transparent;
    padding: 0;
  }
  button.prof { cursor: pointer; width: 20px; height: 20px; }
  .prof.l1 { background: var(--accent); border-color: var(--accent); }
  .prof.l2 { background: var(--accent); border-color: var(--text); box-shadow: 0 0 0 2px var(--accent-soft); border-radius: 3px; transform: rotate(45deg) scale(0.85); }
  .bonus { font-weight: 700; }
  .passives { display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; margin-top: 0.8rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
  .passives strong { color: var(--text); }
</style>
