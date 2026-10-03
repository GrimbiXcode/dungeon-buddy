<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { Check, ChevronDown, Lock, Star, Trash2 } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import { spellAttackBonus, spellSaveDc } from "../../lib/character";
  import { formatMod } from "../../lib/dnd";
  import { d20Request, isPhysical, openRoll } from "../../lib/roller.svelte";
  import type { Ruleset, Spell } from "../../lib/types";
  import { className, damageTypeName, saveLabel, schoolName, spellDice, type RollChar } from "./spells";

  let {
    spell,
    char,
    ownerName,
    showOwner,
    ruleset,
    onpatch,
    onedit,
    ondelete,
    oncast,
    onlibrary,
  }: {
    spell: Spell;
    /** Charakter, mit dessen Werten gewürfelt wird */
    char: RollChar | null;
    ownerName: string | null;
    showOwner: boolean;
    ruleset: Ruleset;
    onpatch: (patch: Partial<Spell>) => void;
    onedit: () => void;
    ondelete: () => void;
    oncast: (slot: number | "pact") => void;
    onlibrary?: () => void;
  } = $props();

  let expanded = $state(false);
  let slotPick = $state<string | null>(null);

  const d = $derived(spell.data);
  const cantrip = $derived(spell.level === 0);
  const sc = $derived(char?.data.spellcasting ?? null);

  const slotOptions = $derived.by(() => {
    if (cantrip || !sc) return [];
    const opts: { value: string; label: string; free: number }[] = [];
    for (let l = spell.level; l <= 9; l++) {
      const s = sc.slots[l - 1]!;
      const free = Math.max(0, s.max - s.used);
      opts.push({ value: String(l), label: s.max > 0 ? `Grad ${l} · ${free}/${s.max} frei` : `Grad ${l}`, free });
    }
    if (sc.pact.max > 0 && sc.pact.level >= spell.level) {
      const free = Math.max(0, sc.pact.max - sc.pact.used);
      opts.push({ value: "pact", label: `Pakt (Grad ${sc.pact.level}) · ${free}/${sc.pact.max} frei`, free });
    }
    return opts;
  });

  /** Standard: Spruchgrad, ausser es gibt dort keine Plätze, aber Paktplätze */
  const defaultSlot = $derived.by(() => {
    if (!sc || cantrip) return String(spell.level);
    const own = sc.slots[spell.level - 1];
    if ((!own || own.max === 0) && slotOptions.some(o => o.value === "pact")) return "pact";
    return String(spell.level);
  });
  const slotChoice = $derived(slotPick && slotOptions.some(o => o.value === slotPick) ? slotPick : defaultSlot);
  const slotLevel = $derived(slotChoice === "pact" && sc ? sc.pact.level : Number(slotChoice) || spell.level);
  const slotFree = $derived(slotOptions.find(o => o.value === slotChoice)?.free ?? 0);

  const damageDice = $derived(char && d.damage ? spellDice(spell, "damage", char.data, slotLevel) : null);
  const healDice = $derived(char && d.heal ? spellDice(spell, "heal", char.data, slotLevel) : null);
  const dmgType = $derived(damageTypeName(d.damageType));
  const upcastSuffix = $derived(!cantrip && slotLevel > spell.level ? ` (Grad ${slotLevel})` : "");

  const metaLine = $derived(convertText([d.castingTime, d.range, d.duration].filter(Boolean).join(" · "), unitSystem()));
  const hasActions = $derived(Boolean(d.save) || (char && (!cantrip || d.attack || damageDice || healDice)));

  function rollAttack() {
    if (!char) return;
    openRoll(
      d20Request({
        title: `${spell.name} – Angriff`,
        subtitle: `${char.name} · ${d.attack === "melee" ? "Nahkampf-Zauberangriff" : "Fernkampf-Zauberangriff"}`,
        modifier: spellAttackBonus(char.data),
        kind: "attack",
        ruleset,
        exhaustion: char.data.exhaustion,
        conditions: char.data.conditions,
        critRange: char.data.critRange,
        rollMode: char.data.rollMode,
        followUp: damageDice
          ? { title: `${spell.name} – Schaden`, dice: damageDice, damageType: dmgType || undefined, canCrit: true }
          : undefined,
      })
    );
  }

  function rollDamage() {
    if (!char || !damageDice) return;
    openRoll({
      type: "damage",
      title: `${spell.name} – Schaden${upcastSuffix}`,
      subtitle: char.name,
      dice: damageDice,
      damageType: dmgType || undefined,
      canCrit: Boolean(d.attack),
      physical: isPhysical(char.data.rollMode),
    });
  }

  function rollHeal() {
    if (!char || !healDice) return;
    openRoll({
      type: "damage",
      title: `${spell.name} – Heilung${upcastSuffix}`,
      subtitle: char.name,
      dice: healDice,
      heal: true,
      canCrit: false,
      physical: isPhysical(char.data.rollMode),
    });
  }

  /** Deutsche Schreibweise für die Anzeige: 2d6 → 2W6 */
  const wLabel = (dice: string) => dice.replace(/(\d*)d(\d+)/g, "$1W$2");

  function togglePrepared() {
    if (cantrip || spell.alwaysPrepared) return;
    onpatch({ prepared: !spell.prepared });
  }
</script>

<article class="spell" class:open={expanded}>
  <div class="top">
    <button
      class="prep"
      class:on={spell.prepared || spell.alwaysPrepared}
      class:fixed={cantrip || spell.alwaysPrepared}
      aria-pressed={cantrip || spell.alwaysPrepared || spell.prepared}
      aria-disabled={cantrip || spell.alwaysPrepared}
      aria-label={cantrip
        ? "Zaubertrick – immer verfügbar"
        : spell.alwaysPrepared
          ? "Immer vorbereitet"
          : spell.prepared
            ? "Vorbereitet – antippen zum Entfernen"
            : "Nicht vorbereitet – antippen zum Vorbereiten"}
      title={cantrip ? "Zaubertricks sind immer verfügbar" : spell.alwaysPrepared ? "Immer vorbereitet" : "Vorbereitet"}
      onclick={togglePrepared}
    >
      {#if spell.alwaysPrepared}<Lock size={13} />{:else if spell.prepared || cantrip}<Check size={15} strokeWidth={3} />{/if}
    </button>

    <button class="main" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
      <span class="name-line">
        <span class="name">{spell.name}</span>
        {#if d.concentration}<span class="tag" title="Konzentration">K</span>{/if}
        {#if d.ritual}<span class="tag" title="Ritual">R</span>{/if}
        {#if spell.alwaysPrepared}<span class="badge lock" title="Immer vorbereitet"><Lock size={11} /> immer</span>{/if}
        {#if showOwner && ownerName}<span class="owner tiny faint truncate">{ownerName}</span>{/if}
      </span>
      <span class="meta small muted">
        {#if d.school}<span class="school">{schoolName(d.school)}</span>{#if metaLine}&nbsp;·&nbsp;{/if}{/if}{metaLine}
      </span>
    </button>

    <button
      class="btn btn-ghost btn-icon btn-sm star"
      class:on={spell.favorite}
      aria-pressed={spell.favorite}
      aria-label={spell.favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
      onclick={() => onpatch({ favorite: !spell.favorite })}
    >
      <Star size={17} fill={spell.favorite ? "currentColor" : "none"} />
    </button>
    <button
      class="btn btn-ghost btn-icon btn-sm chev"
      aria-label={expanded ? "Details ausblenden" : "Details anzeigen"}
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <ChevronDown size={17} />
    </button>
  </div>

  {#if hasActions}
    <div class="actions">
      {#if d.save}
        <span class="badge badge-accent save">{char ? `SG ${spellSaveDc(char.data)} · ` : ""}{saveLabel(d.save)}</span>
      {/if}
      {#if char}
        {#if !cantrip && slotOptions.length}
          <select
            class="select input-sm slot-select"
            aria-label="Zauberplatz für {spell.name}"
            value={slotChoice}
            onchange={e => (slotPick = (e.currentTarget as HTMLSelectElement).value)}
          >
            {#each slotOptions as o (o.value)}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
          <button
            class="btn btn-sm"
            disabled={slotFree <= 0}
            title={slotFree <= 0 ? "Kein freier Zauberplatz dieses Grades" : "Einen Zauberplatz verbrauchen"}
            onclick={() => oncast(slotChoice === "pact" ? "pact" : slotLevel)}
          >
            <Icon name="cast" size={14} /> Wirken
          </button>
          {#if slotFree <= 0}<span class="tiny faint">keine Plätze frei</span>{/if}
        {/if}
        {#if d.attack}
          <button class="btn btn-sm btn-primary" onclick={rollAttack}>
            <Icon name="hit" size={14} /> Angriff {formatMod(spellAttackBonus(char.data))}
          </button>
        {/if}
        {#if damageDice}
          <button class="btn btn-sm" onclick={rollDamage} title="{damageDice}{dmgType ? ` ${dmgType}` : ''}">
            <Icon name="attack" size={14} /> Schaden <span class="dice mono">{wLabel(damageDice)}</span>
          </button>
        {/if}
        {#if healDice}
          <button class="btn btn-sm" onclick={rollHeal}>
            <Icon name="hp" size={14} /> Heilung <span class="dice mono">{wLabel(healDice)}</span>
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  {#if expanded}
    <div class="details">
      <dl>
        {#if d.components}<dt>Komponenten</dt><dd>{d.components}</dd>{/if}
        {#if d.classes?.length}<dt>Klassen</dt><dd>{d.classes.map(className).join(", ")}</dd>{/if}
        {#if d.damage}<dt>Schaden</dt><dd>{d.damage}{dmgType ? ` ${dmgType}` : ""}{#if d.upcast}<span class="muted">&nbsp;(+{d.upcast} pro höherem Grad)</span>{/if}</dd>{/if}
        {#if d.heal}<dt>Heilung</dt><dd>{d.heal}{d.healAddsModifier ? " + Zaubermodifikator" : ""}{#if d.upcast}<span class="muted">&nbsp;(+{d.upcast} pro höherem Grad)</span>{/if}</dd>{/if}
        <dt>Charakter</dt><dd>{ownerName ?? "– keinem zugeordnet –"}</dd>
      </dl>
      {#if d.description}<Markdown source={convertText(d.description, unitSystem())} class="desc" />{/if}
      {#if d.higherLevel}
        <h4 class="hl">Auf höheren Graden</h4>
        <Markdown source={convertText(d.higherLevel, unitSystem())} />
      {/if}
      {#if spell.notes}
        <div class="notes">
          <span class="label">Notizen</span>
          <Markdown source={spell.notes} />
        </div>
      {/if}
      <div class="row foot">
        {#if spell.srdKey}<span class="tiny faint">SRD</span>{/if}
        <span class="grow"></span>
        <button class="btn btn-sm" onclick={onedit}><Icon name="edit" size={14} /> Bearbeiten</button>
        {#if onlibrary}<button class="btn btn-sm" onclick={onlibrary}><Icon name="library" size={14} /> In Bibliothek</button>{/if}
        <button class="btn btn-sm btn-danger" onclick={ondelete}><Trash2 size={14} /> Löschen</button>
      </div>
    </div>
  {/if}
</article>

<style>
  .spell {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.45rem 0.4rem 0.45rem 0.55rem;
    transition: border-color 0.15s;
  }
  .spell.open { border-color: color-mix(in oklab, var(--accent) 45%, var(--border)); }
  .top { display: flex; align-items: center; gap: 0.5rem; }
  .prep {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 2px solid var(--border);
    background: var(--bg);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
  }
  .prep:hover { border-color: var(--accent); }
  .prep.on { background: var(--accent-strong); border-color: var(--accent-strong); }
  .prep.fixed { cursor: default; opacity: 0.55; background: var(--surface-2); border-color: var(--border); color: var(--muted); }
  .prep.fixed:hover { border-color: var(--border); }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    border: 0;
    background: none;
    padding: 0.1rem 0;
    text-align: left;
    cursor: pointer;
  }
  .name-line { display: flex; align-items: center; gap: 0.35rem; min-width: 0; max-width: 100%; }
  .name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--accent-soft);
    color: var(--accent-text);
    cursor: help;
  }
  .lock { padding: 0 0.4rem; font-size: 0.7rem; flex: none; }
  .owner { flex: 0 1 auto; margin-left: 0.15rem; }
  .meta { line-height: 1.35; overflow-wrap: anywhere; }
  .school { font-style: italic; }
  .star { color: var(--faint); flex: none; }
  .star.on { color: var(--warning); }
  .chev { flex: none; color: var(--muted); }
  .chev :global(svg) { transition: transform 0.15s; }
  .open .chev :global(svg) { transform: rotate(180deg); }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0.4rem 0 0.1rem 34px;
  }
  .save { font-size: 0.72rem; }
  .slot-select { width: auto; max-width: 100%; font-size: 0.82rem; }
  .dice { font-size: 0.78rem; opacity: 0.8; font-weight: 500; }
  .details {
    margin: 0.6rem 0.2rem 0.2rem 34px;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
    font-size: 0.92rem;
  }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.9rem; margin: 0 0 0.7rem; }
  dt { color: var(--muted); font-size: 0.8rem; padding-top: 0.1rem; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .hl { margin-top: 0.8rem; font-family: var(--font-display); }
  .notes {
    margin-top: 0.8rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .foot { margin-top: 0.8rem; gap: 0.4rem; }
  @media (max-width: 480px) {
    .actions, .details { margin-left: 0; }
    dl { grid-template-columns: 1fr; gap: 0; }
    dd { margin-bottom: 0.35rem; }
  }
</style>
