<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { onMount } from "svelte";
  import { get } from "../../lib/api";
  import { spellAttackBonus, spellMod, spellSaveDc } from "../../lib/character";
  import { ABILITIES, ABILITY_NAMES, SPELL_LEVEL_NAMES, formatMod } from "../../lib/dnd";
  import type { Spell } from "../../lib/types";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);

  let spells = $state<Spell[]>([]);

  onMount(async () => {
    try {
      spells = await get<Spell[]>(`/api/characters/${ctx.characterId}/spells`);
    } catch {
      spells = [];
    }
  });

  const spellbookHref = $derived(
    ctx.campaignId ? `/k/${ctx.campaignId}/zauberbuch?charakter=${ctx.characterId}` : `/charaktere/${ctx.characterId}/zauber`
  );
  const ready = $derived(spells.filter(s => s.level === 0 || s.prepared || s.alwaysPrepared));
  const byLevel = $derived(
    Array.from({ length: 10 }, (_, lvl) => ({ lvl, list: ready.filter(s => s.level === lvl) })).filter(g => g.list.length)
  );
  const activeSlots = $derived(c.spellcasting.slots.map((s, i) => ({ ...s, level: i + 1, index: i })).filter(s => s.max > 0));

  function toggleSlot(index: number, pip: number) {
    const slot = c.spellcasting.slots[index]!;
    const available = slot.max - slot.used;
    slot.used = pip < available ? slot.max - pip : slot.max - pip - 1;
  }

  function togglePact(pip: number) {
    const p = c.spellcasting.pact;
    const available = p.max - p.used;
    p.used = pip < available ? p.max - pip : p.max - pip - 1;
  }
</script>

<div class="spellcasting">
  <section class="card">
    <h3>Zauberwirken</h3>
    {#if ctx.editing}
      <div class="grid-3">
        <label class="field"><span class="label">Attribut</span>
          <select class="select" bind:value={c.spellcasting.ability}>
            <option value={null}>keins</option>
            {#each ABILITIES as a (a)}<option value={a}>{ABILITY_NAMES[a]}</option>{/each}
          </select>
        </label>
        <label class="field"><span class="label">Bonus Angriff</span>
          <input class="input mono" type="number" bind:value={c.spellcasting.attackBonusExtra} />
        </label>
        <label class="field"><span class="label">Bonus SG</span>
          <input class="input mono" type="number" bind:value={c.spellcasting.dcExtra} />
        </label>
      </div>
    {/if}
    {#if c.spellcasting.ability}
      <div class="stats">
        <div><span class="label">Attribut</span><strong>{ABILITY_NAMES[c.spellcasting.ability]} ({formatMod(spellMod(c))})</strong></div>
        <button class="stat-btn" disabled={ctx.editing} onclick={() => ctx.rollD20("Zauberangriff", spellAttackBonus(c), "attack")}>
          <span class="label">Zauberangriff</span><strong class="mono"><Icon name="roll" size={14} /> {formatMod(spellAttackBonus(c))}</strong>
        </button>
        <div><span class="label">Zauber-SG</span><strong class="mono">{spellSaveDc(c)}</strong></div>
      </div>
    {:else if !ctx.editing}
      <p class="muted small">Kein Zauberattribut gewählt. Im Bearbeiten-Modus einstellen, falls dein Charakter zaubert.</p>
    {/if}
  </section>

  <section class="card">
    <h3>Zauberplätze</h3>
    {#if ctx.editing}
      <p class="tiny muted">Maximale Plätze pro Grad:</p>
      <div class="slot-edit">
        {#each c.spellcasting.slots as slot, i (i)}
          <label class="tiny muted">Grad {i + 1}<input class="input input-sm mono" type="number" min="0" max="9" bind:value={slot.max} /></label>
        {/each}
      </div>
      <div class="grid-3 pact">
        <label class="tiny muted">Paktplätze<input class="input input-sm mono" type="number" min="0" max="9" bind:value={c.spellcasting.pact.max} /></label>
        <label class="tiny muted">Paktgrad<input class="input input-sm mono" type="number" min="1" max="9" bind:value={c.spellcasting.pact.level} /></label>
      </div>
    {:else if activeSlots.length === 0 && c.spellcasting.pact.max === 0}
      <p class="muted small">Keine Zauberplätze eingetragen.</p>
    {:else}
      <div class="slots">
        {#each activeSlots as slot (slot.index)}
          <div class="slot-row">
            <span class="small w">Grad {slot.level}</span>
            <span class="pips">
              {#each Array.from({ length: slot.max }, (_, p) => p) as p (p)}
                <button class="pip" class:on={p < slot.max - slot.used} aria-label="Grad {slot.level} Platz {p + 1}" onclick={() => toggleSlot(slot.index, p)}></button>
              {/each}
            </span>
            <span class="tiny muted mono">{slot.max - slot.used}/{slot.max}</span>
          </div>
        {/each}
        {#if c.spellcasting.pact.max > 0}
          {@const p = c.spellcasting.pact}
          <div class="slot-row">
            <span class="small w">Pakt (G{p.level})</span>
            <span class="pips">
              {#each Array.from({ length: p.max }, (_, i) => i) as i (i)}
                <button class="pip pact-pip" class:on={i < p.max - p.used} aria-label="Paktplatz {i + 1}" onclick={() => togglePact(i)}></button>
              {/each}
            </span>
            <span class="tiny muted mono">{p.max - p.used}/{p.max}</span>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <section class="card wide">
    <div class="row-between head">
      <h3>Vorbereitete Zauber</h3>
      <a class="btn btn-sm" href={spellbookHref}><Icon name="spellbook" size={14} /> Zauberbuch öffnen</a>
    </div>
    {#if byLevel.length === 0}
      <p class="muted small">Noch keine Zauber zugeordnet. Im Zauberbuch kannst du Zauber aus dem SRD übernehmen und diesem Charakter zuweisen.</p>
    {:else}
      {#each byLevel as group (group.lvl)}
        <div class="spell-group">
          <span class="label">{SPELL_LEVEL_NAMES[group.lvl]}</span>
          <div class="chip-row">
            {#each group.list as s (s.id)}
              <a class="badge spell" href={spellbookHref}>{s.name}{#if s.data.concentration} ·K{/if}</a>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </section>
</div>

<style>
  .spellcasting { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 0.6rem; }
  .head { margin-bottom: 0.6rem; }
  .head h3 { margin: 0; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .stats > * {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    font: inherit;
    color: inherit;
    text-align: left;
  }
  .stats strong { display: inline-flex; align-items: center; gap: 0.3rem; }
  .stat-btn { cursor: pointer; }
  .stat-btn:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
  .label { font-size: 0.7rem; }
  .slot-edit { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 0.4rem; }
  .slot-edit label, .pact label { display: flex; flex-direction: column; gap: 0.15rem; }
  .pact { margin-top: 0.6rem; }
  .slots { display: flex; flex-direction: column; gap: 0.45rem; }
  .slot-row { display: flex; align-items: center; gap: 0.6rem; }
  .w { width: 5.5rem; flex: none; }
  .pips { display: flex; gap: 0.3rem; flex-wrap: wrap; flex: 1; }
  .pip { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--faint); background: transparent; cursor: pointer; padding: 0; transform: rotate(45deg) scale(0.8); }
  .pip.on { background: var(--accent); border-color: var(--accent); }
  .pact-pip.on { background: var(--accent-strong); }
  .spell-group { margin-bottom: 0.6rem; }
  .spell-group .label { display: block; margin-bottom: 0.3rem; }
  .spell { font-size: 0.8rem; color: var(--text); }
  @media (max-width: 420px) {
    .stats { grid-template-columns: 1fr 1fr; }
  }
</style>
