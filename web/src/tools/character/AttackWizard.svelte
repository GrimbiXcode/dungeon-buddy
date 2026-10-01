<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { Crosshair, Dices, Swords, X } from "@lucide/svelte";
  import Modal from "../../components/Modal.svelte";
  import { attackDamageBonus, attackToHit, type Attack } from "../../lib/character";
  import { addExpr, diceString, formatDice, parseDice, type DiceExpr } from "../../lib/dice";
  import { formatMod } from "../../lib/dnd";
  import { attackOptions, label, useFeature, usesLeft, type AttackOption } from "../../lib/features";
  import { d20Request, isPhysical, openRoll } from "../../lib/roller.svelte";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";

  let { attack, onclose }: { attack: Attack; onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);

  type Economy = "action" | "bonus" | "reaction";
  type Outcome = "hit" | "crit" | "miss";

  let step = $state<"prepare" | "result">("prepare");
  let economy = $state<Economy>("action");
  let selectedBefore = $state<string[]>([]);
  let selectedHit = $state<string[]>([]);
  let categoryFilter = $state<string[]>([]);
  let rolled = $state<{ kept: number; total: number } | null>(null);
  let outcome = $state<Outcome | null>(null);
  let twoHanded = $state(false);

  const options = $derived(attackOptions(c, attack));
  const categories = $derived([...new Set([...options.before, ...options.onHit].map(o => o.feature.category))]);
  const visible = (list: AttackOption[]) =>
    list.filter(o => o.automatic || !categoryFilter.length || categoryFilter.includes(o.feature.category));

  /** Fähigkeiten, die in diesen Angriff einfliessen */
  const activeBefore = $derived(options.before.filter(o => o.automatic || selectedBefore.includes(o.feature.id)));
  const activeHit = $derived(options.onHit.filter(o => selectedHit.includes(o.feature.id)));

  const toHit = $derived(attackToHit(c, attack) + activeBefore.reduce((s, o) => s + o.feature.attackMods.toHit, 0));
  const advantage = $derived(activeBefore.some(o => o.feature.attackMods.advantage));

  const damage = $derived.by(() => {
    const base = parseDice(twoHanded && attack.versatileDamage ? attack.versatileDamage : attack.damage);
    let expr: DiceExpr = base ?? { groups: [], bonus: 0 };
    const types = [attack.damageType];
    expr = addExpr(expr, { groups: [], bonus: attackDamageBonus(c, attack) });
    const extra = parseDice(attack.extraDamage);
    if (extra) {
      expr = addExpr(expr, extra);
      types.push(attack.extraDamageType);
    }
    for (const o of [...activeBefore, ...activeHit]) {
      expr = addExpr(expr, { groups: [], bonus: o.feature.attackMods.damageBonus });
      const d = o.feature.effectType === "damage" ? parseDice(o.feature.damage) : null;
      if (d) {
        expr = addExpr(expr, d);
        types.push(o.feature.damageType);
      }
    }
    return { expr, types: [...new Set(types.filter(Boolean))] };
  });

  const economySpentNow = $derived(c.combat.active && c.combat.used[economy]);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  }

  function consume(list: AttackOption[]) {
    for (const o of list) {
      if (o.automatic) continue;
      for (const note of useFeature(c, o.feature)) toast(note);
    }
  }

  function rollAttack() {
    consume(activeBefore);
    if (c.combat.active) c.combat.used[economy] = true;
    const request = d20Request({
      title: `${attack.name || "Angriff"} – Angriffswurf`,
      subtitle: activeBefore.length ? `Mit: ${activeBefore.map(o => o.feature.name).join(", ")}` : undefined,
      modifier: toHit,
      kind: "attack",
      ruleset: ctx.ruleset,
      exhaustion: c.exhaustion,
      rollMode: c.rollMode,
      onResult: (kept, total) => {
        rolled = { kept, total };
        outcome = kept === 20 ? "crit" : kept === 1 ? "miss" : outcome;
      },
    });
    // Vorteil aus Fähigkeiten; trifft er auf Nachteil (Erschöpfung 2014), heben sie sich auf
    if (advantage) request.mode = request.mode === "disadvantage" ? "normal" : "advantage";
    openRoll(request);
    step = "result";
  }

  function rollDamage() {
    consume(activeHit);
    openRoll({
      type: "damage",
      title: `${attack.name || "Angriff"} – Schaden`,
      subtitle: activeHit.length || activeBefore.length ? `Inklusive ${[...activeBefore, ...activeHit].map(o => o.feature.name).join(", ")}` : undefined,
      dice: diceString(damage.expr),
      damageType: damage.types.join(" / "),
      crit: outcome === "crit",
      canCrit: true,
      physical: isPhysical(c.rollMode),
    });
    onclose();
  }

  const missOptions = $derived(c.features.filter(f => f.triggers.includes("miss") && (f.appliesTo.scope === "none" || options.before.concat(options.onHit).some(o => o.feature.id === f.id))));
</script>

{#snippet optionRow(o: AttackOption, selected: string[], onToggle: (id: string) => void)}
  {@const f = o.feature}
  {@const left = usesLeft(c, f)}
  <label class="option" class:auto={o.automatic} class:disabled={!o.available && !o.automatic}>
    <input
      type="checkbox"
      checked={o.automatic || selected.includes(f.id)}
      disabled={o.automatic || !o.available}
      onchange={() => onToggle(f.id)}
    />
    <span class="grow">
      <span class="opt-name">
        {f.name}
        <span class="badge">{label.activation(f.activation)}</span>
        {#if o.automatic}<span class="badge badge-accent">{f.activation === "passive" ? "immer" : "aktiv"}</span>{/if}
        {#if o.spent}<span class="badge badge-danger">{label.activation(f.activation)} verbraucht</span>{/if}
      </span>
      <span class="tiny muted block">
        {[
          f.attackMods.advantage ? "Vorteil" : "",
          f.attackMods.toHit ? `Treffer ${formatMod(f.attackMods.toHit)}` : "",
          f.attackMods.damageBonus ? `Schaden ${formatMod(f.attackMods.damageBonus)}` : "",
          f.effectType === "damage" && parseDice(f.damage) ? `+${formatDice(parseDice(f.damage)!)} ${f.damageType}` : "",
          convertText(f.benefit, unitSystem()),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {#if f.condition}<span class="tiny faint block">Bedingung: {convertText(f.condition, unitSystem())}</span>{/if}
    </span>
    {#if left != null}<span class="tiny muted nowrap">{left} übrig</span>{/if}
  </label>
{/snippet}

<Modal title="Angriff: {attack.name || 'Waffe'}" size="md" {onclose}>
  <div class="summary">
    <div><span class="label">Treffer</span><strong class="mono">{formatMod(toHit)}</strong>{#if advantage}<span class="badge badge-accent">Vorteil</span>{/if}</div>
    <div><span class="label">Schaden</span><strong class="mono">{formatDice(damage.expr)}</strong><span class="tiny muted">{damage.types.join(" / ")}</span></div>
  </div>
  {#if attack.properties.length || attack.mastery || attack.range}
    <p class="tiny muted props">
      {[attack.kind === "ranged" ? "Fernkampf" : "Nahkampf", convertText(attack.range, unitSystem()), ...attack.properties, attack.mastery ? `Meisterschaft: ${attack.mastery}` : ""].filter(Boolean).join(" · ")}
    </p>
  {/if}

  {#if categories.length > 1}
    <div class="chip-row filter" role="group" aria-label="Nach Kategorie filtern">
      <span class="tiny muted">Filter:</span>
      {#each categories as cat (cat)}
        <button class="chip" aria-pressed={categoryFilter.includes(cat)} onclick={() => (categoryFilter = toggle(categoryFilter, cat))}>{cat}</button>
      {/each}
    </div>
  {/if}

  {#if step === "prepare"}
    {#if c.combat.active}
      <div class="row economy">
        <span class="small muted">Angriff als</span>
        <div class="segmented" role="group" aria-label="Aktionsart">
          <button aria-pressed={economy === "action"} onclick={() => (economy = "action")}>Aktion</button>
          <button aria-pressed={economy === "bonus"} onclick={() => (economy = "bonus")}>Bonusaktion</button>
          <button aria-pressed={economy === "reaction"} onclick={() => (economy = "reaction")}>Reaktion</button>
        </div>
        {#if economySpentNow}<span class="tiny warn">schon verbraucht (Extra-Angriff?)</span>{/if}
      </div>
    {/if}

    <h4 class="label">Vor dem Angriff</h4>
    {#if visible(options.before).length}
      <div class="options">
        {#each visible(options.before) as o (o.feature.id)}
          {@render optionRow(o, selectedBefore, id => (selectedBefore = toggle(selectedBefore, id)))}
        {/each}
      </div>
    {:else}
      <p class="small muted">Keine passenden Fähigkeiten. Unter „Fähigkeiten“ kannst du festlegen, für welche Angriffe eine Fähigkeit gilt.</p>
    {/if}

    {#if options.onHit.length}
      <p class="tiny muted">Nach einem Treffer kannst du zusätzlich wählen: {options.onHit.map(o => o.feature.name).join(", ")}.</p>
    {/if}
    {#if attack.versatileDamage}
      <label class="checkbox small"><input type="checkbox" bind:checked={twoHanded} /> Zweihändig führen ({attack.versatileDamage})</label>
    {/if}
  {:else}
    <div class="outcome">
      {#if rolled}
        <p class="small">Wurf: <strong class="mono">{rolled.total}</strong> (W20: {rolled.kept}). Wie ist der Angriff ausgegangen?</p>
      {:else}
        <p class="small">Wie ist der Angriff ausgegangen?</p>
      {/if}
      <div class="segmented" role="group" aria-label="Ergebnis">
        <button aria-pressed={outcome === "hit"} onclick={() => (outcome = "hit")}><Crosshair size={14} /> Treffer</button>
        <button aria-pressed={outcome === "crit"} onclick={() => (outcome = "crit")}>Kritisch</button>
        <button aria-pressed={outcome === "miss"} onclick={() => (outcome = "miss")}><X size={14} /> Verfehlt</button>
      </div>
    </div>

    {#if outcome === "hit" || outcome === "crit"}
      <h4 class="label">Bei Treffer</h4>
      {#if visible(options.onHit).length}
        <div class="options">
          {#each visible(options.onHit) as o (o.feature.id)}
            {@render optionRow(o, selectedHit, id => (selectedHit = toggle(selectedHit, id)))}
          {/each}
        </div>
      {:else}
        <p class="small muted">Keine Fähigkeiten mit Auslöser „Bei Treffer“ für diese Waffe.</p>
      {/if}
      {#if attack.versatileDamage}
        <label class="checkbox small"><input type="checkbox" bind:checked={twoHanded} /> Zweihändig geführt ({attack.versatileDamage})</label>
      {/if}
    {:else if outcome === "miss"}
      {#if missOptions.length}
        <h4 class="label">Bei Fehlschlag</h4>
        <div class="stack small">
          {#each missOptions as f (f.id)}<div><strong>{f.name}</strong> <span class="muted">{f.benefit}</span></div>{/each}
        </div>
      {:else}
        <p class="small muted">Verfehlt. Nächster Versuch!</p>
      {/if}
    {/if}
  {/if}

  {#snippet footer()}
    {#if step === "prepare"}
      <button class="btn" onclick={onclose}>Abbrechen</button>
      <button class="btn btn-primary" onclick={rollAttack}><Dices size={16} /> Angriff würfeln ({formatMod(toHit)})</button>
    {:else if outcome === "hit" || outcome === "crit"}
      <button class="btn" onclick={onclose}>Schliessen</button>
      <button class="btn btn-primary" onclick={rollDamage}>
        <Swords size={16} /> {outcome === "crit" ? "Kritischen Schaden würfeln" : "Schaden würfeln"} ({formatDice(damage.expr)})
      </button>
    {:else}
      <button class="btn" onclick={onclose}>Schliessen</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem; }
  .summary > div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
  }
  .summary .label { width: 100%; font-size: 0.68rem; }
  .summary strong { font-size: 1.35rem; font-family: var(--font-display); }
  .props { margin: 0 0 0.6rem; }
  .filter { margin-bottom: 0.6rem; align-items: center; }
  .chip {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .economy { margin-bottom: 0.8rem; gap: 0.5rem; }
  .warn { color: var(--warning); }
  h4 { margin: 0.6rem 0 0.4rem; }
  .options { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.6rem; }
  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
  }
  .option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .option.disabled { opacity: 0.55; cursor: not-allowed; }
  .option input { margin-top: 0.2rem; width: 1.05rem; height: 1.05rem; accent-color: var(--accent-strong); }
  .opt-name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; font-weight: 650; }
  .opt-name .badge { font-size: 0.68rem; }
  .block { display: block; }
  .outcome { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.6rem; }
  .outcome p { margin: 0; }
  .segmented button { display: inline-flex; align-items: center; gap: 0.3rem; }
</style>
