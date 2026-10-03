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
  import type { Feature } from "../../lib/features";
  import { addExpr, diceString, formatDice, parseDice, type DiceExpr } from "../../lib/dice";
  import { ABILITY_SHORT, formatMod, type Ability } from "../../lib/dnd";
  import {
    attackOptions,
    describeRollMods,
    abilityChoices,
    featureDamageExpr,
    featureDamageType,
    featureRollKind,
    isDamageTwice,
    label,
    sumMods,
    useFeature,
    usesLeft,
    type AbilityPicks,
    type AttackOption,
  } from "../../lib/features";
  import AbilityPicker from "./AbilityPicker.svelte";
  import { d20Request, isPhysical, openRoll } from "../../lib/roller.svelte";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";

  let {
    attack,
    offhand = false,
    preselect,
    onclose,
  }: { attack: Attack; offhand?: boolean; /** Fähigkeit vorwählen (aus „Einsetzen“) */ preselect?: string; onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);

  type Economy = "action" | "bonus" | "reaction";
  type Outcome = "hit" | "crit" | "miss";

  // svelte-ignore state_referenced_locally
  const nick = offhandIsNick(attack, ctx.ruleset);
  let step = $state<"prepare" | "result">("prepare");
  // svelte-ignore state_referenced_locally
  let economy = $state<Economy>(offhand ? "bonus" : "action");
  // Vorwahl nur beim Öffnen (der Assistent wird bei jedem Öffnen neu erzeugt)
  // svelte-ignore state_referenced_locally
  const preId = preselect;
  // svelte-ignore state_referenced_locally
  const pre = preId ? attackOptions(ctx.data, attack) : null;
  let selectedBefore = $state<string[]>(preId && pre?.before.some(o => o.feature.id === preId && !o.automatic) ? [preId] : []);
  let selectedHit = $state<string[]>(preId && pre && [...pre.onHit, ...pre.onCrit].some(o => o.feature.id === preId) ? [preId] : []);
  let categoryFilter = $state<string[]>([]);
  /** Gewählte Attribute je Fähigkeit (bei Zuschlägen mit mehreren Attributen) */
  let picks = $state<Record<string, AbilityPicks>>({});
  const exprOf = (f: Feature) => featureDamageExpr(c, f, picks[f.id]);
  let rolled = $state<{ kept: number; total: number } | null>(null);
  let outcome = $state<Outcome | null>(null);
  /** Ergebnis kam aus dem Wurf (nat. 20/1 bzw. Krit-Bereich), nicht von Hand: beim nächsten Wurf neu bestimmen */
  let autoOutcome = false;
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
  /** Bei Treffer gewählt, bei kritischem Treffer auch die nur dafür geltenden (passive automatisch) */
  const activeCrit = $derived(outcome === "crit" ? options.onCrit.filter(o => o.automatic || selectedHit.includes(o.feature.id)) : []);
  const activeHit = $derived([...options.onHit.filter(o => selectedHit.includes(o.feature.id)), ...activeCrit]);
  /** Vielseitig: nur mit der Eigenschaft und nicht beim Zusatzangriff (die andere Hand hält die zweite Waffe) */
  const versatile = $derived(!offhand && attack.properties.includes("Vielseitig") && attack.versatileDamage ? attack.versatileDamage : "");

  const attackMods = $derived(sumMods(activeBefore.map(o => ({ label: o.feature.name, mods: o.feature.rollMods.filter(m => m.target === "attack") }))));
  const damageMods = $derived(
    sumMods([...activeBefore, ...activeHit].map(o => ({ label: o.feature.name, mods: o.feature.rollMods.filter(m => m.target === "damage") })))
  );

  const toHit = $derived(attackToHit(c, attack, rollOpts) + attackMods.flat);
  const toHitDice = $derived(attackMods.dice.map(d => `${d.sign < 0 ? "−" : "+"}${d.groups.map(g => `${g.count}W${g.sides}`).join("+")}`).join(" "));
  const advantage = $derived(attackMods.advantage && !attackMods.disadvantage);
  const disadvantage = $derived(attackMods.disadvantage && !attackMods.advantage);

  /** Waffenwürfel ohne Boni (für „zweimal würfeln“) */
  const weaponDice = $derived(parseDice(twoHanded && versatile ? versatile : attack.damage));
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
    // Schaden nur bei kritischem Treffer (Brutaler kritischer Treffer) wird nicht verdoppelt
    let critExtra: DiceExpr | null = null;
    for (const o of [...activeBefore, ...activeHit]) {
      if (o.feature.damageOtherTarget) continue;
      const d = featureRollKind(o.feature) === "damage" ? exprOf(o.feature) : null;
      if (!d) continue;
      if (activeCrit.includes(o)) critExtra = critExtra ? addExpr(critExtra, d) : d;
      else expr = addExpr(expr, d);
      types.push(featureDamageType(o.feature, attack));
    }
    return { expr, critExtra, types: [...new Set(types.filter(Boolean))] };
  });

  /**
   * Eigene Würfe nach dem Waffenschaden: Schaden gegen weitere Ziele (Weit
   * ausholender Angriff) und sonstige Wirkungen
   */
  const otherTargets = $derived(
    [...activeBefore, ...activeHit].flatMap(o => {
      const kind = featureRollKind(o.feature);
      const separate = kind === "other" || kind === "healing" || (kind === "damage" && o.feature.damageOtherTarget);
      const d = separate ? exprOf(o.feature) : null;
      if (!d) return [];
      const text = kind === "other" ? o.feature.effectText.trim() : kind === "healing" ? "" : featureDamageType(o.feature, attack);
      return [{ feature: o.feature, expr: d, kind, text }];
    })
  );
  let otherRolled = $state<string[]>([]);

  const economySpentNow = $derived(c.combat.active && !(offhand && nick) && c.combat.used[economy]);

  /** Zusatzangriff mit einer zweiten leichten Waffe anbieten (als Bonusaktion nur, wenn sie noch frei ist) */
  const offhandChoices = $derived(
    offhand || c.combat.offhandUsed || (c.combat.active && economy !== "action")
      ? []
      : offhandWeapons(c, attack, ctx.ruleset).filter(w => !c.combat.active || offhandIsNick(w, ctx.ruleset) || !c.combat.used.bonus)
  );
  /** Zusatzangriff erst, wenn dieser Angriff fertig ist (sonst gingen Schaden und Würfe verloren) */
  const offhandReady = $derived(outcome === "miss" || (damageRolled && otherTargets.every(o => otherRolled.includes(o.feature.id))));

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
      critRange: c.critRange,
      ruleset: ctx.ruleset,
      exhaustion: c.exhaustion,
      rollMode: c.rollMode,
      // Vorteil/Nachteil aus Fähigkeiten; gegensätzliche Quellen heben sich im Dialog auf
      sources: activeBefore.flatMap(o =>
        o.feature.rollMods
          .filter(m => m.target === "attack" && m.mode !== "none")
          .map(m => ({ label: o.feature.name, mode: m.mode as "advantage" | "disadvantage" }))
      ),
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
        if (kept >= c.critRange || kept === 1) {
          outcome = kept === 1 ? "miss" : "crit";
          autoOutcome = true;
        } else if (autoOutcome) {
          outcome = null;
          autoOutcome = false;
        }
      },
    });
    openRoll(request);
    step = "result";
  }

  function rollDamage() {
    consume(activeHit);
    const separate = new Set(otherTargets.map(o => o.feature.id));
    const included = [...activeBefore, ...activeHit].filter(o => !separate.has(o.feature.id)).map(o => o.feature.name);
    openRoll({
      type: "damage",
      title: `${attack.name || "Angriff"} – Schaden`,
      subtitle: included.length ? `Inklusive ${included.join(", ")}` : undefined,
      dice: diceString(damage.expr),
      damageType: damage.types.join(" / "),
      crit: outcome === "crit",
      critExtra: damage.critExtra ? diceString(damage.critExtra) : undefined,
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

  function setOutcome(o: Outcome) {
    outcome = o;
    autoOutcome = false;
  }

  function rollOtherTarget(o: (typeof otherTargets)[number]) {
    openRoll({
      type: "damage",
      title: o.kind === "other" ? o.feature.name : `${o.feature.name} – Schaden`,
      subtitle: o.kind === "other" ? `Ausgelöst durch ${attack.name || "Angriff"}` : `Weiteres Ziel, ausgelöst durch ${attack.name || "Angriff"}`,
      dice: diceString(o.expr),
      damageType: o.kind === "damage" ? o.text || undefined : undefined,
      effect: o.kind === "other" ? o.text : undefined,
      heal: o.kind === "healing",
      crit: o.kind === "damage" && o.feature.critWithAttack && outcome === "crit",
      canCrit: o.kind === "damage",
      physical: isPhysical(c.rollMode),
    });
    otherRolled = [...otherRolled, o.feature.id];
  }

  function startOffhand(a: Attack) {
    ctx.openAttack(a, { offhand: true });
  }

  const missOptions = $derived(c.features.filter(f => f.triggers.includes("miss") && (f.appliesTo.scope === "none" || options.before.concat(options.onHit).some(o => o.feature.id === f.id))));
</script>

{#snippet optionRow(o: AttackOption, selected: string[], onToggle: (id: string) => void, locked = false)}
  {@const f = o.feature}
  {@const left = usesLeft(c, f)}
  <label class="option" class:auto={o.automatic} class:disabled={!o.available && !o.automatic} class:locked>
    <input
      type="checkbox"
      checked={o.automatic || selected.includes(f.id)}
      disabled={o.automatic || !o.available || locked}
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
          featureRollKind(f) === "other" && exprOf(f)
            ? `${formatDice(exprOf(f)!)}: ${f.effectText}`
            : featureRollKind(f) === "damage" && exprOf(f)
              ? `${f.damageOtherTarget ? "Weiteres Ziel: " : "+"}${formatDice(exprOf(f)!)} ${featureDamageType(f, attack)}`.trim()
              : "",
          convertText(f.benefit, unitSystem()),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {#if f.condition}<span class="tiny faint block">Bedingung: {convertText(f.condition, unitSystem())}</span>{/if}
      {#if abilityChoices(f).length && (o.automatic || selected.includes(f.id))}
        <AbilityPicker
          feature={f}
          disabled={locked && !otherTargets.some(x => x.feature.id === f.id && !otherRolled.includes(f.id))}
          bind:picks={() => picks[f.id] ?? {}, v => (picks = { ...picks, [f.id]: v })}
        />
      {/if}
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
    {#if versatile}
      <label class="checkbox small"><input type="checkbox" bind:checked={twoHanded} /> Zweihändig führen ({versatile})</label>
    {/if}
  {:else}
    <div class="outcome">
      {#if rolled}
        <p class="small">Wurf: <strong class="mono">{rolled.total}</strong> (W20: {rolled.kept}). Wie ist der Angriff ausgegangen?</p>
      {:else}
        <p class="small">Wie ist der Angriff ausgegangen?</p>
      {/if}
      <div class="segmented" role="group" aria-label="Ergebnis">
        <button aria-pressed={outcome === "hit"} disabled={damageRolled} onclick={() => setOutcome("hit")}><Icon name="hit" size={14} /> Treffer</button>
        <button aria-pressed={outcome === "crit"} disabled={damageRolled} onclick={() => setOutcome("crit")}>Kritisch</button>
        <button aria-pressed={outcome === "miss"} disabled={damageRolled} onclick={() => setOutcome("miss")}><X size={14} /> Verfehlt</button>
      </div>
      {#if damageRolled}<p class="tiny muted">Schaden gewürfelt: Ergebnis und Auswahl stehen fest.</p>{/if}
    </div>

    {#if outcome === "hit" || outcome === "crit"}
      <h4 class="label">Bei Treffer</h4>
      {#if visible(options.onHit).length}
        <div class="options">
          {#each visible(options.onHit) as o (o.feature.id)}
            {@render optionRow(o, selectedHit, id => (selectedHit = toggle(selectedHit, id)), damageRolled)}
          {/each}
        </div>
      {:else}
        <p class="small muted">Keine Fähigkeiten mit Auslöser „Bei Treffer“ für diese Waffe.</p>
      {/if}
      {#if outcome === "crit" && visible(options.onCrit).length}
        <h4 class="label">Bei kritischem Treffer</h4>
        <div class="options">
          {#each visible(options.onCrit) as o (o.feature.id)}
            {@render optionRow(o, selectedHit, id => (selectedHit = toggle(selectedHit, id)), damageRolled)}
          {/each}
        </div>
      {/if}
      {#if versatile}
        <label class="checkbox small"><input type="checkbox" bind:checked={twoHanded} disabled={damageRolled} /> Zweihändig geführt ({versatile})</label>
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
      <h4 class="label">{otherTargets.some(o => o.kind === "other") ? "Weitere Würfe" : "Weitere Ziele"}</h4>
      <div class="row">
        {#each otherTargets as o (o.feature.id)}
          <button class="btn btn-sm" class:btn-primary={!otherRolled.includes(o.feature.id)} onclick={() => rollOtherTarget(o)}>
            <Icon name={o.kind === "other" ? "roll" : "attack"} size={14} /> {o.feature.name}: {formatDice(o.expr)}{o.text ? `${o.kind === "other" ? ":" : ""} ${o.text}` : ""}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if step === "result" && offhandReady && offhandChoices.length}
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
  .option.locked { cursor: default; }
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
