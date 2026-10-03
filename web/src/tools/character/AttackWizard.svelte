<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { X } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Modal from "../../components/Modal.svelte";
  import {
    attackAbility,
    attackRange,
    attackDamageBonus,
    attackToHit,
    isFinesse,
    offhandIsNick,
    offhandWeapons,
    type Attack,
  } from "../../lib/character";
  import { addExpr, diceString, formatDice, parseDice, type DiceExpr } from "../../lib/dice";
  import { ABILITY_SHORT, formatMod, type Ability } from "../../lib/dnd";
  import {
    attackOptions,
    describeRollMods,
    featureDamageExpr,
    featureDamageType,
    isDamageTwice,
    label,
    sumMods,
    useFeature,
    usesLeft,
    type AttackOption,
  } from "../../lib/features";
  import { d20Request, isPhysical, openRoll } from "../../lib/roller.svelte";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";

  let { attack, offhand = false, onclose }: { attack: Attack; offhand?: boolean; onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);

  type Economy = "action" | "bonus" | "reaction";
  type Outcome = "hit" | "crit" | "miss";

  // svelte-ignore state_referenced_locally
  const nick = offhandIsNick(attack, ctx.ruleset);
  let step = $state<"prepare" | "result">("prepare");
  // svelte-ignore state_referenced_locally
  let economy = $state<Economy>(offhand ? "bonus" : "action");
  let selectedBefore = $state<string[]>([]);
  let selectedHit = $state<string[]>([]);
  let categoryFilter = $state<string[]>([]);
  let rolled = $state<{ kept: number; total: number } | null>(null);
  let outcome = $state<Outcome | null>(null);
  let twoHanded = $state(false);
  let damageRolled = $state(false);
  // svelte-ignore state_referenced_locally
  let abilityChoice = $state<Ability | null>(isFinesse(attack) ? (attackAbility(ctx.data, attack) as Ability) : null);

  const finesse = $derived(isFinesse(attack) && (attack.ability === "str" || attack.ability === "dex"));
  const rollOpts = $derived({ ability: abilityChoice, offhand });

  const options = $derived(attackOptions(c, attack));
  const categories = $derived([...new Set([...options.before, ...options.onHit].flatMap(o => o.feature.categories))]);
  const visible = (list: AttackOption[]) =>
    list.filter(o => o.automatic || !categoryFilter.length || o.feature.categories.some(cat => categoryFilter.includes(cat)));

  /** Fähigkeiten, die in diesen Angriff einfliessen */
  const activeBefore = $derived(options.before.filter(o => o.automatic || selectedBefore.includes(o.feature.id)));
  const activeHit = $derived(options.onHit.filter(o => selectedHit.includes(o.feature.id)));

  const attackMods = $derived(sumMods(activeBefore.map(o => ({ label: o.feature.name, mods: o.feature.rollMods.filter(m => m.target === "attack") }))));
  const damageMods = $derived(
    sumMods([...activeBefore, ...activeHit].map(o => ({ label: o.feature.name, mods: o.feature.rollMods.filter(m => m.target === "damage") })))
  );

  const toHit = $derived(attackToHit(c, attack, rollOpts) + attackMods.flat);
  const toHitDice = $derived(attackMods.dice.map(d => `${d.sign < 0 ? "−" : "+"}${d.groups.map(g => `${g.count}W${g.sides}`).join("+")}`).join(" "));
  const advantage = $derived(attackMods.advantage && !attackMods.disadvantage);
  const disadvantage = $derived(attackMods.disadvantage && !attackMods.advantage);

  /** Waffenwürfel ohne Boni (für „zweimal würfeln“) */
  const weaponDice = $derived(parseDice(twoHanded && attack.versatileDamage ? attack.versatileDamage : attack.damage));
  /** Fähigkeiten, mit denen die Waffenwürfel zweimal gewürfelt werden (Wilder Angreifer) */
  const twiceFrom = $derived([...activeBefore, ...activeHit].filter(o => o.feature.rollMods.some(isDamageTwice)).map(o => o.feature.name));

  const damage = $derived.by(() => {
    let expr: DiceExpr = weaponDice ?? { groups: [], bonus: 0 };
    const types = [attack.damageType];
    expr = addExpr(expr, { groups: [], bonus: attackDamageBonus(c, attack, rollOpts) + damageMods.flat });
    for (const d of damageMods.dice) if (d.sign > 0) expr = addExpr(expr, { groups: d.groups, bonus: 0 });
    const extra = parseDice(attack.extraDamage);
    if (extra) {
      expr = addExpr(expr, extra);
      types.push(attack.extraDamageType);
    }
    for (const o of [...activeBefore, ...activeHit]) {
      if (o.feature.damageOtherTarget) continue;
      const d = o.feature.effectType === "damage" ? featureDamageExpr(c, o.feature) : null;
      if (d) {
        expr = addExpr(expr, d);
        types.push(featureDamageType(o.feature, attack));
      }
    }
    return { expr, types: [...new Set(types.filter(Boolean))] };
  });

  /** Schaden gegen weitere Ziele (Weit ausholender Angriff): eigener Wurf je Fähigkeit */
  const otherTargets = $derived(
    [...activeBefore, ...activeHit].flatMap(o => {
      const d = o.feature.damageOtherTarget && o.feature.effectType === "damage" ? featureDamageExpr(c, o.feature) : null;
      return d ? [{ feature: o.feature, expr: d, type: featureDamageType(o.feature, attack) }] : [];
    })
  );
  let otherRolled = $state<string[]>([]);

  const economySpentNow = $derived(c.combat.active && !(offhand && nick) && c.combat.used[economy]);

  /** Zusatzangriff mit einer zweiten leichten Waffe anbieten */
  const offhandChoices = $derived(
    offhand || c.combat.offhandUsed || (c.combat.active && economy !== "action") ? [] : offhandWeapons(c, attack, ctx.ruleset)
  );

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
    if (c.combat.active) {
      if (offhand) {
        c.combat.offhandUsed = true;
        if (!nick) c.combat.used.bonus = true;
      } else {
        c.combat.used[economy] = true;
        if (economy === "action" && offhandWeapons(c, attack, ctx.ruleset).length) c.combat.lightAttack = attack.id;
      }
    }
    const request = d20Request({
      title: `${attack.name || "Angriff"} – ${offhand ? "Zusatzangriff" : "Angriffswurf"}`,
      subtitle: activeBefore.length ? `Mit: ${activeBefore.map(o => o.feature.name).join(", ")}` : undefined,
      modifier: toHit,
      kind: "attack",
      ruleset: ctx.ruleset,
      exhaustion: c.exhaustion,
      rollMode: c.rollMode,
      options: attackMods.dice.map((d, i) => ({
        id: `dice-${i}`,
        label: d.label,
        flat: 0,
        dice: d.groups,
        sign: d.sign,
        mode: null,
        auto: true,
      })),
      onResult: (kept, total) => {
        rolled = { kept, total };
        outcome = kept === 20 ? "crit" : kept === 1 ? "miss" : outcome;
      },
    });
    // Vorteil/Nachteil aus Fähigkeiten; gegensätzliche Quellen heben sich auf
    if (advantage) request.mode = request.mode === "disadvantage" ? "normal" : "advantage";
    if (disadvantage) request.mode = request.mode === "advantage" ? "normal" : "disadvantage";
    openRoll(request);
    step = "result";
  }

  function rollDamage() {
    consume(activeHit);
    const included = [...activeBefore, ...activeHit].filter(o => !o.feature.damageOtherTarget).map(o => o.feature.name);
    openRoll({
      type: "damage",
      title: `${attack.name || "Angriff"} – Schaden`,
      subtitle: included.length ? `Inklusive ${included.join(", ")}` : undefined,
      dice: diceString(damage.expr),
      damageType: damage.types.join(" / "),
      crit: outcome === "crit",
      canCrit: true,
      twice:
        twiceFrom.length && weaponDice?.groups.length
          ? { label: twiceFrom.join(", "), dice: diceString({ groups: weaponDice.groups, bonus: 0 }) }
          : undefined,
      physical: isPhysical(c.rollMode),
    });
    damageRolled = true;
    if (!offhandChoices.length && !otherTargets.length) onclose();
  }

  function rollOtherTarget(o: (typeof otherTargets)[number]) {
    openRoll({
      type: "damage",
      title: `${o.feature.name} – Schaden`,
      subtitle: `Weiteres Ziel, ausgelöst durch ${attack.name || "Angriff"}`,
      dice: diceString(o.expr),
      damageType: o.type || undefined,
      canCrit: true,
      physical: isPhysical(c.rollMode),
    });
    otherRolled = [...otherRolled, o.feature.id];
  }

  function startOffhand(a: Attack) {
    ctx.openAttack(a, { offhand: true });
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
          describeRollMods(f.rollMods.filter(m => m.target === "attack" || m.target === "damage")),
          f.effectType === "damage" && featureDamageExpr(c, f)
            ? `${f.damageOtherTarget ? "Weiteres Ziel: " : "+"}${formatDice(featureDamageExpr(c, f)!)} ${featureDamageType(f, attack)}`.trim()
            : "",
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

<Modal title="{offhand ? 'Zusatzangriff' : 'Angriff'}: {attack.name || 'Waffe'}" size="md" {onclose}>
  {#if offhand}
    <p class="small offhand-hint">
      Zweite leichte Waffe{nick ? " (Einkerben: Teil der Angriffsaktion)" : " als Bonusaktion"}. Attributsmodifikator
      {c.twoWeaponFighting ? "zählt dank Kampfstil Zwei-Waffen-Kampf." : "nur, wenn er negativ ist."}
    </p>
  {/if}
  <div class="summary">
    <div><span class="label">Treffer</span><strong class="mono">{formatMod(toHit)}</strong>{#if toHitDice}<span class="mono small">{toHitDice}</span>{/if}{#if advantage}<span class="badge badge-accent">Vorteil</span>{/if}{#if disadvantage}<span class="badge badge-danger">Nachteil</span>{/if}</div>
    <div><span class="label">Schaden</span><strong class="mono">{formatDice(damage.expr)}</strong><span class="tiny muted">{damage.types.join(" / ")}</span></div>
  </div>
  {#if attack.properties.length || attack.mastery || attackRange(attack, unitSystem())}
    <p class="tiny muted props">
      {[attack.kind === "ranged" ? "Fernkampf" : "Nahkampf", attackRange(attack, unitSystem()), ...attack.properties, attack.mastery ? `Meisterschaft: ${attack.mastery}` : ""].filter(Boolean).join(" · ")}
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
    {#if finesse}
      <div class="row economy">
        <span class="small muted">Finesse: Angriff mit</span>
        <div class="segmented" role="group" aria-label="Attribut">
          {#each ["str", "dex"] as const as ab (ab)}
            <button aria-pressed={abilityChoice === ab} onclick={() => (abilityChoice = ab)}>{ABILITY_SHORT[ab]}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if c.combat.active && !offhand}
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
        <button aria-pressed={outcome === "hit"} onclick={() => (outcome = "hit")}><Icon name="hit" size={14} /> Treffer</button>
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

  {#if step === "result" && damageRolled && otherTargets.length}
    <div class="offhand">
      <h4 class="label">Weitere Ziele</h4>
      <div class="row">
        {#each otherTargets as o (o.feature.id)}
          <button class="btn btn-sm" class:btn-primary={!otherRolled.includes(o.feature.id)} onclick={() => rollOtherTarget(o)}>
            <Icon name="attack" size={14} /> {o.feature.name}: {formatDice(o.expr)}{o.type ? ` ${o.type}` : ""}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if step === "result" && offhandChoices.length}
    <div class="offhand">
      <h4 class="label">Zweite leichte Waffe</h4>
      <p class="tiny muted">
        Nach dem Angriff mit einer leichten Waffe darfst du mit einer anderen leichten Waffe einen Zusatzangriff machen
        ({ctx.ruleset === "2024" ? "Bonusaktion, mit Einkerben als Teil der Angriffsaktion" : "Bonusaktion"}), ohne positiven Attributsmodifikator beim Schaden.
      </p>
      <div class="row">
        {#each offhandChoices as w (w.id)}
          <button class="btn btn-sm" onclick={() => startOffhand(w)}>
            <Icon name="attack" size={14} /> Zusatzangriff: {w.name || "Waffe"}
            <span class="tiny muted">({offhandIsNick(w, ctx.ruleset) ? "Angriffsaktion" : "Bonusaktion"})</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#snippet footer()}
    {#if step === "prepare"}
      <button class="btn" onclick={onclose}>Abbrechen</button>
      <button class="btn btn-primary" onclick={rollAttack}><Icon name="roll" size={16} /> Angriff würfeln ({formatMod(toHit)})</button>
    {:else if (outcome === "hit" || outcome === "crit") && !damageRolled}
      <button class="btn" onclick={onclose}>Schliessen</button>
      <button class="btn btn-primary" onclick={rollDamage}>
        <Icon name="attack" size={16} /> {outcome === "crit" ? "Kritischen Schaden würfeln" : "Schaden würfeln"} ({formatDice(damage.expr)})
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
  .offhand { margin-top: 0.8rem; padding-top: 0.6rem; border-top: 1px dashed var(--border); }
  .offhand h4 { margin-top: 0; }
  .offhand-hint { margin: 0 0 0.6rem; padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--accent-text); }
</style>
