<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText, distanceUnit, feetToInput, formatDistance, inputToFeet } from "../../lib/units";
  import { onMount } from "svelte";
  import { Flag, Hourglass, Plus, Swords, Timer, Trash2, Zap } from "@lucide/svelte";
  import Modal from "../../components/Modal.svelte";
  import { get } from "../../lib/api";
  import { attackToHit, initiative, spellAttackBonus, type Attack } from "../../lib/character";
  import { formatMod, SPELL_LEVEL_NAMES } from "../../lib/dnd";
  import {
    EFFECT_TYPES,
    activationFromCastingTime,
    addEffect,
    endCombat,
    isAvailable,
    label,
    matchesFilter,
    nextTurn,
    startCombat,
    usesLeft,
    type Activation,
    type Feature,
  } from "../../lib/features";
  import { d20Request, isPhysical, openRoll } from "../../lib/roller.svelte";
  import { toast } from "../../lib/toast.svelte";
  import type { Spell } from "../../lib/types";
  import { isPrepared, spellDice } from "../spellbook/spells";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);

  let spells = $state<Spell[]>([]);
  let categoryFilter = $state<string[]>([]);
  let effectFilter = $state<string[]>([]);
  let addingEffect = $state(false);
  let effectName = $state("");
  let effectRounds = $state<number | null>(10);
  let effectConcentration = $state(false);

  onMount(async () => {
    try {
      const all = await get<Spell[]>(`/api/characters/${ctx.characterId}/spells`);
      spells = all.filter(isPrepared);
    } catch {
      spells = [];
    }
  });

  const SECTIONS: { key: Activation; title: string; economy?: "action" | "bonus" | "reaction" }[] = [
    { key: "before", title: "Vor der Aktion" },
    { key: "action", title: "Als Aktion", economy: "action" },
    { key: "bonus", title: "Als Bonusaktion", economy: "bonus" },
    { key: "reaction", title: "Als Reaktion", economy: "reaction" },
    { key: "free", title: "Freie Optionen" },
  ];

  const STANDARD_ACTIONS = ["Spurt", "Ausweichen", "Rückzug", "Helfen", "Verstecken", "Suchen", "Gegenstand benutzen", "Vorbereiten"];

  const categories = $derived([...new Set([...c.features.map(f => f.category), ...(spells.length ? ["Zauber"] : [])])]);
  const effectTypes = $derived(EFFECT_TYPES.filter(e => c.features.some(f => f.effectType === e.key)));

  const filteredFeatures = $derived(
    c.features.filter(f =>
      f.activation !== "passive" && matchesFilter(f, { search: "", categories: categoryFilter, tags: [], effectTypes: effectFilter })
    )
  );
  const showSpells = $derived(!categoryFilter.length || categoryFilter.includes("Zauber"));
  const showAttacks = $derived(!effectFilter.length || effectFilter.includes("damage"));

  function sectionFeatures(key: Activation) {
    return filteredFeatures
      .filter(f => f.activation === key)
      .sort((a, b) => Number(isAvailable(c, b)) - Number(isAvailable(c, a)) || a.name.localeCompare(b.name, "de"));
  }

  function sectionSpells(key: Activation) {
    if (!showSpells) return [];
    return spells.filter(s => activationFromCastingTime(s.data.castingTime ?? "") === key);
  }

  function spent(economy?: "action" | "bonus" | "reaction") {
    return economy ? c.combat.used[economy] : false;
  }

  function begin(rollInitiative: boolean) {
    startCombat(c);
    if (rollInitiative) ctx.rollD20("Initiative", initiative(c), "initiative");
  }

  function turn() {
    const expired = nextTurn(c);
    toast(expired.length ? `Runde ${c.combat.round}. Abgelaufen: ${expired.join(", ")}` : `Runde ${c.combat.round} – dein Zug.`);
  }

  function standardAction(name: string) {
    c.combat.used.action = true;
    if (name === "Ausweichen") addEffect(c, { name: "Ausweichen", featureId: null, remaining: 1, concentration: false, note: "Angriffe gegen dich mit Nachteil, Vorteil auf GES-Rettungswürfe" });
    if (name === "Rückzug") addEffect(c, { name: "Rückzug", featureId: null, remaining: 1, concentration: false, note: "Keine Gelegenheitsangriffe" });
    toast(`${name} – Aktion verbraucht.`);
  }

  /** Rundenzahl aus SRD-Dauer, z. B. "Concentration, up to 1 minute" */
  function spellRounds(duration: string): number | null {
    const m = /(\d+)\s*(round|minute|hour)/i.exec(duration);
    if (!m) return null;
    const n = Number(m[1]);
    return m[2]!.toLowerCase().startsWith("round") ? n : m[2]!.toLowerCase().startsWith("minute") ? n * 10 : n * 600;
  }

  function castSpell(s: Spell, activation: Activation) {
    // Niedrigsten freien Platz ab dem Grad des Zaubers verwenden
    let slotLevel = s.level;
    if (s.level > 0) {
      const sc = c.spellcasting;
      const idx = sc.slots.findIndex((slot, i) => i + 1 >= s.level && slot.max - slot.used > 0);
      const pactOk = sc.pact.max - sc.pact.used > 0 && sc.pact.level >= s.level;
      if (idx >= 0) {
        sc.slots[idx]!.used++;
        slotLevel = idx + 1;
        toast(`Grad-${slotLevel}-Zauberplatz verbraucht.`);
      } else if (pactOk) {
        sc.pact.used++;
        slotLevel = sc.pact.level;
        toast("Paktplatz verbraucht.");
      } else {
        toast(`Kein freier Zauberplatz ab Grad ${s.level}.`, "error");
        return;
      }
    }
    const economy = SECTIONS.find(x => x.key === activation)?.economy;
    if (economy) c.combat.used[economy] = true;
    if (s.data.concentration) {
      for (const note of addEffect(c, { name: s.name, featureId: null, remaining: spellRounds(s.data.duration ?? ""), concentration: true, note: "Zauber" })) toast(note);
    }
    const dmg = spellDice(s, "damage", c, slotLevel);
    const heal = spellDice(s, "heal", c, slotLevel);
    if (s.data.attack) {
      openRoll(
        d20Request({
          title: `${s.name} – Zauberangriff`,
          modifier: spellAttackBonus(c),
          kind: "attack",
          ruleset: ctx.ruleset,
          exhaustion: c.exhaustion,
          rollMode: c.rollMode,
          followUp: dmg ? { title: `${s.name} – Schaden`, dice: dmg, damageType: s.data.damageType ?? undefined, canCrit: true } : undefined,
        })
      );
    } else if (dmg) {
      openRoll({ type: "damage", title: `${s.name} – Schaden`, dice: dmg, damageType: s.data.damageType ?? undefined, canCrit: false, physical: isPhysical(c.rollMode) });
    } else if (heal) {
      openRoll({ type: "damage", title: `${s.name} – Heilung`, dice: heal, heal: true, canCrit: false, physical: isPhysical(c.rollMode) });
    }
  }

  function addManualEffect(e: SubmitEvent) {
    e.preventDefault();
    if (!effectName.trim()) return;
    for (const note of addEffect(c, {
      name: effectName.trim(),
      featureId: null,
      remaining: effectRounds && effectRounds > 0 ? effectRounds : null,
      concentration: effectConcentration,
      note: "",
    }))
      toast(note);
    effectName = "";
    effectRounds = 10;
    effectConcentration = false;
    addingEffect = false;
  }

  function toggleFilter(list: string[], v: string) {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  }
</script>

{#snippet featureRow(f: Feature)}
  {@const left = usesLeft(c, f)}
  {@const ok = isAvailable(c, f)}
  <div class="sugg" class:off={!ok}>
    <div class="grow">
      <div class="sugg-name">
        <strong>{f.name}</strong>
        <span class="badge">{f.category}</span>
        {#if left != null}<span class="badge" class:badge-danger={left === 0}>{left}×</span>{/if}
      </div>
      <span class="tiny muted">
        {convertText([label.effect(f.effectType), f.benefit, f.damage ? `${f.damage} ${f.damageType}` : "", f.duration.kind !== "instant" ? label.duration(f) : ""].filter(Boolean).join(" · "), unitSystem())}
      </span>
      {#if f.condition}<span class="tiny faint block">{convertText(f.condition, unitSystem())}</span>{/if}
    </div>
    <button class="btn btn-sm" disabled={!ok} onclick={() => ctx.useFeature(f)}>Einsetzen</button>
  </div>
{/snippet}

{#snippet attackRow(a: Attack)}
  <div class="sugg">
    <div class="grow">
      <div class="sugg-name"><Swords size={14} /> <strong>{a.name || "Angriff"}</strong> <span class="badge mono">{formatMod(attackToHit(c, a))}</span></div>
      <span class="tiny muted">{a.kind === "ranged" ? "Fernkampf" : "Nahkampf"}{a.range ? ` ${convertText(a.range, unitSystem())}` : ""} · {a.damage} {a.damageType}</span>
    </div>
    <button class="btn btn-sm btn-primary" onclick={() => ctx.openAttack(a)}>Angreifen</button>
  </div>
{/snippet}

{#snippet spellRow(s: Spell, activation: Activation)}
  <div class="sugg">
    <div class="grow">
      <div class="sugg-name">
        <strong>{s.name}</strong>
        <span class="badge">{SPELL_LEVEL_NAMES[s.level]}</span>
        {#if s.data.concentration}<span class="badge" title="Konzentration">K</span>{/if}
      </div>
      <span class="tiny muted">{convertText([s.data.range, s.data.duration].filter(Boolean).join(" · "), unitSystem())}</span>
    </div>
    <button class="btn btn-sm" onclick={() => castSpell(s, activation)}>Wirken</button>
  </div>
{/snippet}

<section class="card assistant" class:active={c.combat.active}>
  {#if !c.combat.active}
    <div class="row-between">
      <div>
        <h3><Swords size={17} /> Kampf-Assistent</h3>
        <p class="small muted intro">
          Behält Runden, Aktion/Bonusaktion/Reaktion und laufende Effekte im Blick und schlägt dir passende Fähigkeiten,
          Angriffe und Zauber vor.
        </p>
      </div>
      <div class="row">
        <button class="btn" onclick={() => begin(false)}>Kampf beginnen</button>
        <button class="btn btn-primary" onclick={() => begin(true)}><Zap size={15} /> Initiative würfeln</button>
      </div>
    </div>
  {:else}
    <div class="row-between bar">
      <h3><Timer size={17} /> Runde {c.combat.round}</h3>
      <div class="row">
        <button class="btn btn-primary btn-sm" onclick={turn}><Hourglass size={14} /> Nächster Zug</button>
        <button class="btn btn-sm" onclick={() => endCombat(c)}><Flag size={14} /> Kampf beenden</button>
      </div>
    </div>

    <div class="economy">
      {#each [["action", "Aktion"], ["bonus", "Bonusaktion"], ["reaction", "Reaktion"]] as const as [key, name] (key)}
        <button class="eco" class:spent={c.combat.used[key]} aria-pressed={c.combat.used[key]} onclick={() => (c.combat.used[key] = !c.combat.used[key])}>
          <span class="dot"></span>{name}
        </button>
      {/each}
      <label class="move small">
        Bewegung
        <input
          class="input input-sm mono"
          type="number"
          min="0"
          step={unitSystem() === "metric" ? 1.5 : 5}
          value={feetToInput(c.combat.movement, unitSystem())}
          onchange={e => (c.combat.movement = inputToFeet(Number((e.currentTarget as HTMLInputElement).value), unitSystem()))}
          aria-label="Verbrauchte Bewegung in {distanceUnit(unitSystem())}"
        />
        <span class="muted">/ {formatDistance(c.speed, unitSystem())}</span>
      </label>
    </div>

    <div class="effects">
      <div class="row-between">
        <h4 class="label">Aktive Effekte</h4>
        <button class="btn btn-sm btn-ghost" onclick={() => (addingEffect = true)}><Plus size={14} /> Effekt</button>
      </div>
      {#if c.combat.effects.length === 0}
        <p class="tiny muted">Keine. Eingesetzte Fähigkeiten mit Dauer erscheinen hier automatisch.</p>
      {:else}
        <div class="chip-row">
          {#each c.combat.effects as e (e.id)}
            <span class="effect" class:conc={e.concentration} title={e.note}>
              {e.name}
              <span class="mono tiny">{e.remaining == null ? "∞" : `${e.remaining} R`}</span>
              {#if e.concentration}<span class="tiny">K</span>{/if}
              <button aria-label="{e.name} beenden" onclick={() => (c.combat.effects = c.combat.effects.filter(x => x.id !== e.id))}><Trash2 size={12} /></button>
            </span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if c.combat.active}
    <div class="suggest-head row-between">
      <h4 class="label">Vorschläge</h4>
      <div class="chip-row" role="group" aria-label="Nach Kategorie filtern">
        {#each categories as cat (cat)}
          <button class="chip" aria-pressed={categoryFilter.includes(cat)} onclick={() => (categoryFilter = toggleFilter(categoryFilter, cat))}>{cat}</button>
        {/each}
        {#each effectTypes as e (e.key)}
          <button class="chip dashed" aria-pressed={effectFilter.includes(e.key)} onclick={() => (effectFilter = toggleFilter(effectFilter, e.key))}>{e.label}</button>
        {/each}
      </div>
    </div>

    <div class="sections">
      {#each SECTIONS as section (section.key)}
        {@const feats = sectionFeatures(section.key)}
        {@const sp = sectionSpells(section.key)}
        {@const isSpent = spent(section.economy)}
        <div class="section" class:spent={isSpent}>
          <div class="section-title">
            <strong>{section.title}</strong>
            {#if isSpent}<span class="badge badge-danger">verbraucht</span>{/if}
          </div>
          {#if section.key === "action" && showAttacks}
            {#each c.attacks as a (a.id)}{@render attackRow(a)}{/each}
          {/if}
          {#each feats as f (f.id)}{@render featureRow(f)}{/each}
          {#each sp as s (s.id)}{@render spellRow(s, section.key)}{/each}
          {#if section.key === "action" && !categoryFilter.length && !effectFilter.length}
            <div class="chip-row std">
              {#each STANDARD_ACTIONS as name (name)}
                <button class="chip" onclick={() => standardAction(name)}>{name}</button>
              {/each}
            </div>
          {/if}
          {#if !feats.length && !sp.length && !(section.key === "action")}
            <p class="tiny faint">Nichts passendes.</p>
          {/if}
        </div>
      {/each}
    </div>
    {#if c.features.length === 0}
      <p class="tiny muted">Tipp: Erfasse unter „Fähigkeiten“ deine Merkmale und Talente – dann erscheinen sie hier als Vorschläge.</p>
    {/if}
  {/if}
</section>

{#if addingEffect}
  <Modal title="Effekt hinzufügen" size="sm" onclose={() => (addingEffect = false)}>
    <form id="effect-form" onsubmit={addManualEffect}>
      <label class="field"><span class="label">Name</span><input class="input" bind:value={effectName} required placeholder="z. B. Segen, Vergiftet, Hast" /></label>
      <label class="field"><span class="label">Dauer in Runden (leer = unbestimmt)</span><input class="input mono" type="number" min="1" bind:value={effectRounds} /></label>
      <label class="checkbox"><input type="checkbox" bind:checked={effectConcentration} /> Konzentration</label>
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (addingEffect = false)}>Abbrechen</button>
      <button class="btn btn-primary" type="submit" form="effect-form">Hinzufügen</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .assistant.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-soft); }
  h3 { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0 0 0.3rem; }
  .intro { margin: 0; max-width: 36rem; }
  .bar { margin-bottom: 0.7rem; }
  .bar h3 { margin: 0; }
  .economy { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; margin-bottom: 0.8rem; }
  .eco {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 650;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .eco .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
  .eco.spent { border-color: var(--border); background: transparent; color: var(--faint); text-decoration: line-through; }
  .eco.spent .dot { background: transparent; border: 2px solid var(--faint); }
  .move { display: inline-flex; align-items: center; gap: 0.35rem; margin-left: auto; }
  .move input { width: 4.5rem; }
  .effects { margin-bottom: 0.6rem; }
  .effects h4 { margin: 0; }
  .effect {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.3rem 0.2rem 0.6rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .effect.conc { border-color: var(--warning); }
  .effect button { border: 0; background: transparent; color: var(--faint); cursor: pointer; padding: 0.1rem; display: inline-flex; }
  .suggest-head { margin: 0.8rem 0 0.5rem; align-items: center; }
  .suggest-head h4 { margin: 0; }
  .chip {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .chip.dashed { border-style: dashed; }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .sections { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .section.spent { opacity: 0.55; }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: 0.15rem; }
  .sugg {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .sugg.off { opacity: 0.5; }
  .sugg-name { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .sugg-name .badge { font-size: 0.66rem; }
  .block { display: block; }
  .std { margin-top: 0.2rem; }
  @media (max-width: 520px) {
    .move { margin-left: 0; }
  }
</style>
