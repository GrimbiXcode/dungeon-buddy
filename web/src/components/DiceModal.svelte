<script lang="ts">
  import { untrack } from "svelte";
  import { RotateCcw } from "@lucide/svelte";
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import {
    closeRoll,
    logRoll,
    openRoll,
    roller,
    updateLog,
    type AdvMode,
    type D20Request,
    type DamageRequest,
    type RollOption,
    type RollRequest,
  } from "../lib/roller.svelte";
  import { critExpr, formatDice, groupRange, parseDice, rollDie, rollGroup, type DiceExpr, type DiceGroup } from "../lib/dice";
  import { formatMod } from "../lib/dnd";

  const req = $derived(roller.request);

  // ── W20 ────────────────────────────────────────────────────────────────
  /** Von Hand gesetzter Vorteil/Nachteil: zählt als weitere Quelle (hebt sich mit anderen auf) */
  let userMode = $state<AdvMode>("normal");
  let picks = $state<number[]>([]);
  let rolled = $state(false);
  /** Gewählte Optionen (automatische sind immer dabei) */
  let selected = $state<string[]>([]);
  /** Ergebnis der Bonuswürfel je Option */
  let bonusRolls = $state<Record<string, number | null>>({});
  let successDone = $state<string[]>([]);
  let logId: number | null = null;

  // ── Schaden ────────────────────────────────────────────────────────────
  let crit = $state(false);
  /** Pro Würfelgruppe: Einzelwürfe (digital) bzw. Summe (physisch) */
  let groupResults = $state<(number[] | null)[]>([]);
  let manualSums = $state<(number | null)[]>([]);
  /** Zweiter Wurf der Waffenwürfel je Gruppe (Wilder Angreifer) und gewählter Wurf */
  let twiceRolls = $state<(number[] | null)[]>([]);
  let twiceChoice = $state<0 | 1>(0);
  let damageLogId: number | null = null;

  /** Zuletzt angezeigte Anfrage (zum Aufräumen beim Schliessen/Wechseln) */
  let shown: RollRequest | null = null;

  /** Ohne Wurf geschlossen: angekreuzte Optionen zurückgeben */
  function refundUnrolled(r: RollRequest) {
    if (r.type !== "d20" || rolled) return;
    for (const o of r.options ?? []) if (!o.auto && selected.includes(o.id)) o.onToggle?.(false);
  }

  $effect(() => {
    // Zurücksetzen, sobald eine neue Anfrage geöffnet wird
    const r = roller.request;
    untrack(() => {
      if (shown && shown !== r) refundUnrolled(shown);
      shown = r;
    });
    if (!r) return;
    picks = [];
    rolled = false;
    userMode = "normal";
    selected = r.type === "d20" ? (r.options ?? []).filter(o => o.auto).map(o => o.id) : [];
    bonusRolls = {};
    successDone = [];
    logId = null;
    crit = r.type === "damage" ? Boolean(r.crit) : false;
    groupResults = [];
    manualSums = [];
    twiceRolls = [];
    twiceChoice = 0;
    damageLogId = null;
  });

  const options = $derived(req?.type === "d20" ? (req.options ?? []) : []);
  const active = $derived(options.filter(o => selected.includes(o.id)));

  /** Vorteil und Nachteil heben sich auf, egal aus wie vielen Quellen (auch der Handauswahl) */
  const mode = $derived.by<AdvMode>(() => {
    if (req?.type !== "d20") return "normal";
    const has = (m: AdvMode) => req.mode === m || userMode === m || (req.sources ?? []).some(s => s.mode === m) || active.some(o => o.mode === m);
    const adv = has("advantage");
    const dis = has("disadvantage");
    return adv && dis ? "normal" : adv ? "advantage" : dis ? "disadvantage" : "normal";
  });
  /** Woher Vorteil/Nachteil kommen; nur, wenn nicht allein die Handauswahl wirkt */
  const sourceNote = $derived.by(() => {
    if (req?.type !== "d20") return "";
    const from = (m: AdvMode) =>
      [
        req.mode === m ? "Voreinstellung" : "",
        ...(req.sources ?? []).filter(s => s.mode === m).map(s => s.label),
        ...active.filter(o => o.mode === m).map(o => o.label),
      ].filter(Boolean);
    const adv = from("advantage");
    const dis = from("disadvantage");
    if (!adv.length && !dis.length) return "";
    if (userMode === "advantage") adv.push("von Hand");
    if (userMode === "disadvantage") dis.push("von Hand");
    const parts = [adv.length ? `Vorteil: ${adv.join(", ")}` : "", dis.length ? `Nachteil: ${dis.join(", ")}` : ""].filter(Boolean);
    return `${parts.join(" · ")} → ${modeLabel[mode]}`;
  });
  const needed = $derived(mode === "normal" ? 1 : 2);

  const optionFlat = $derived(active.reduce((s, o) => s + o.flat, 0));
  const diceOptions = $derived(active.filter(o => o.dice.length));
  const bonusMissing = $derived(diceOptions.some(o => bonusRolls[o.id] == null));
  const bonusSum = $derived(diceOptions.reduce((s, o) => s + o.sign * (bonusRolls[o.id] ?? 0), 0));

  const diceLabel = (groups: DiceGroup[]) => groups.map(g => `${g.count}W${g.sides}`).join(" + ");
  const rollGroups = (groups: DiceGroup[]) => groups.reduce((s, g) => s + rollGroup(g).reduce((a, b) => a + b, 0), 0);

  function rollMissingBonus() {
    const next = { ...bonusRolls };
    for (const o of diceOptions) if (next[o.id] == null) next[o.id] = rollGroups(o.dice);
    bonusRolls = next;
  }

  const isAvailable = (o: RollOption) => (o.available ? o.available() : !o.disabled);
  const optionDisabled = (o: RollOption) => o.auto || (!selected.includes(o.id) && !isAvailable(o));

  function toggleOption(r: D20Request, o: RollOption) {
    if (optionDisabled(o)) return;
    const on = !selected.includes(o.id);
    selected = on ? [...selected, o.id] : selected.filter(x => x !== o.id);
    o.onToggle?.(on);
    if (!on) successDone = successDone.filter(x => x !== o.id);
    if (o.mode) adjustPicks(r);
    // Ein schon gewürfelter Bonuswürfel bleibt beim Ab- und Wiederankreuzen erhalten
    else if (on && rolled && !r.physical && o.dice.length && bonusRolls[o.id] == null) {
      bonusRolls = { ...bonusRolls, [o.id]: rollGroups(o.dice) };
    }
    if (rolled) queueMicrotask(() => reportD20(r));
  }

  /**
   * Vorteil/Nachteil hat sich geändert: vorhandene Würfel behalten. Braucht es
   * einen zweiten W20, wird er digital dazugewürfelt bzw. physisch abgefragt;
   * braucht es nur noch einen, zählt der erste.
   */
  function adjustPicks(r: D20Request) {
    if (!picks.length) return;
    if (picks.length > needed) picks = picks.slice(0, needed);
    if (picks.length < needed) {
      if (r.physical) {
        rolled = false;
        return;
      }
      picks = [...picks, ...Array.from({ length: needed - picks.length }, () => rollDie(20))];
    }
    if (!rolled) finishD20(r, picks);
    else queueMicrotask(() => reportD20(r));
  }

  function optionText(o: RollOption) {
    return [
      o.dice.length ? `${o.sign < 0 ? "−" : "+"}${diceLabel(o.dice)}` : "",
      o.flat ? formatMod(o.flat) : "",
      o.mode === "advantage" ? "Vorteil" : o.mode === "disadvantage" ? "Nachteil" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function d20Kept(values: number[]) {
    if (values.length < needed) return null;
    if (mode === "advantage") return Math.max(...values);
    if (mode === "disadvantage") return Math.min(...values);
    return values[0]!;
  }

  const kept = $derived(d20Kept(picks));

  function d20Total(r: D20Request, k: number) {
    return k + r.modifier + (r.penalty ?? 0) + optionFlat + bonusSum;
  }

  function d20Detail(r: D20Request) {
    const bonus = diceOptions.map(o => `${o.sign < 0 ? "−" : "+"}${diceLabel(o.dice)} (${bonusRolls[o.id] ?? "?"})`).join(" ");
    return `W20 ${picks.join(" / ")}${mode !== "normal" ? (mode === "advantage" ? " (Vorteil)" : " (Nachteil)") : ""} ${formatMod(r.modifier + optionFlat)}${r.penalty ? ` ${formatMod(r.penalty)}` : ""}${bonus ? ` ${bonus}` : ""}`;
  }

  /** Ergebnis melden und Verlauf schreiben bzw. aktualisieren */
  function reportD20(r: D20Request) {
    if (kept == null || bonusMissing) return;
    const total = d20Total(r, kept);
    r.onResult?.(kept, total);
    const entry = { title: r.title, detail: d20Detail(r), total, flag: kept === 20 ? ("crit" as const) : kept === 1 ? ("fumble" as const) : undefined };
    if (logId != null) updateLog(logId, entry);
    else logId = logRoll(entry);
  }

  function finishD20(r: D20Request, values: number[]) {
    const k = d20Kept(values);
    if (k == null) return;
    rolled = true;
    queueMicrotask(() => reportD20(r));
  }

  function rollD20Digital(r: D20Request) {
    picks = Array.from({ length: needed }, () => rollDie(20));
    bonusRolls = {};
    successDone = [];
    rollMissingBonus();
    logId = null;
    finishD20(r, picks);
  }

  function setBonus(r: D20Request, o: RollOption, raw: string) {
    const value = raw.trim() === "" ? NaN : Number(raw);
    const min = o.dice.reduce((s, g) => s + groupRange(g).min, 0);
    const max = o.dice.reduce((s, g) => s + groupRange(g).max, 0);
    const ok = Number.isInteger(value) && value >= min && value <= max;
    bonusRolls = { ...bonusRolls, [o.id]: ok ? value : null };
    if (rolled) queueMicrotask(() => reportD20(r));
  }

  function pick(r: D20Request, n: number) {
    if (rolled) resetD20();
    picks = [...picks, n];
    if (picks.length >= needed) finishD20(r, picks);
  }

  function setMode(r: D20Request, m: AdvMode) {
    userMode = m;
    adjustPicks(r);
  }

  /** Neuer Wurf (physisch „Nochmal“): alles vom letzten Wurf verwerfen */
  function resetD20() {
    picks = [];
    rolled = false;
    logId = null;
    bonusRolls = {};
    successDone = [];
  }

  function toDamage(r: D20Request) {
    if (!r.followUp) return;
    openRoll({ ...r.followUp, type: "damage", physical: r.physical, crit: kept === 20 });
  }

  // ── Schaden ───────────────────────────────────────────────────────────
  const baseExpr = $derived(req?.type === "damage" ? parseDice(req.dice) : null);
  const expr = $derived<DiceExpr | null>(baseExpr ? (crit ? critExpr(baseExpr) : baseExpr) : null);

  /** Wie viele Würfel je Gruppe zum „zweimal würfeln“ gehören (die ersten der Gruppe) */
  const twiceExpr = $derived.by(() => {
    if (req?.type !== "damage" || !req.twice) return null;
    const t = parseDice(req.twice.dice);
    return t ? (crit ? critExpr(t) : t) : null;
  });
  const twiceCounts = $derived(
    twiceExpr && expr ? expr.groups.map(g => Math.min(g.count, twiceExpr.groups.find(t => t.sides === g.sides)?.count ?? 0)) : null
  );

  /** Würfe einer Gruppe, bei gewähltem zweitem Wurf mit dessen Waffenwürfeln */
  function groupValues(i: number): number[] | null {
    const first = groupResults[i];
    if (!first) return null;
    const alt = twiceRolls[i];
    return twiceChoice === 1 && alt ? [...alt, ...first.slice(alt.length)] : first;
  }

  const twiceSets = $derived.by(() => {
    if (!twiceCounts || !twiceRolls.some(Boolean)) return null;
    const first = twiceCounts.flatMap((k, i) => groupResults[i]?.slice(0, k) ?? []);
    const second = twiceRolls.flatMap(r => r ?? []);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    return [
      { dice: first, sum: sum(first) },
      { dice: second, sum: sum(second) },
    ];
  });

  const damageTotal = $derived.by(() => {
    if (!expr || !req || req.type !== "damage") return null;
    let sum = expr.bonus;
    for (let i = 0; i < expr.groups.length; i++) {
      const value = req.physical ? manualSums[i] : groupValues(i)?.reduce((a, b) => a + b, 0);
      if (value == null) return null;
      sum += value;
    }
    return Math.max(0, sum);
  });

  function rollDamageDigital(r: DamageRequest) {
    if (!expr) return;
    const results = expr.groups.map(g => rollGroup(g));
    groupResults = results;
    const counts = twiceCounts;
    twiceRolls = counts ? expr.groups.map((g, i) => (counts[i] ? Array.from({ length: counts[i]! }, () => rollDie(g.sides)) : null)) : [];
    // Voreinstellung: der höhere der beiden Würfe
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const first = counts ? sum(counts.flatMap((k, i) => results[i]!.slice(0, k))) : 0;
    twiceChoice = counts && sum(twiceRolls.flatMap(x => x ?? [])) > first ? 1 : 0;
    logDamage(r);
  }

  function damageDetail(r: DamageRequest) {
    const twice = r.twice && twiceSets ? ` · ${r.twice.label}: Wurf ${twiceChoice + 1}` : "";
    return `${formatDice(expr!)}${crit ? " (kritisch)" : ""}${r.damageType ? ` ${r.damageType}` : ""}${r.effect ? ` · ${r.effect}` : ""}${twice}`;
  }

  function logDamage(r: DamageRequest) {
    if (!expr || damageTotal == null) return;
    const entry = { title: r.title, detail: damageDetail(r), total: damageTotal };
    // Korrekturen am selben Wurf aktualisieren den Eintrag statt einen neuen anzulegen
    if (damageLogId != null) updateLog(damageLogId, entry);
    else damageLogId = logRoll(entry);
  }

  function chooseTwice(r: DamageRequest, choice: 0 | 1) {
    twiceChoice = choice;
    if (damageLogId != null && damageTotal != null) updateLog(damageLogId, { detail: damageDetail(r), total: damageTotal });
  }

  function setManual(r: DamageRequest, index: number, value: number | null) {
    const group = expr?.groups[index];
    const range = group ? groupRange(group) : null;
    // Nur ganze Zahlen im möglichen Bereich zählen; leer = noch nicht eingetragen
    manualSums[index] = value != null && range && Number.isInteger(value) && value >= range.min && value <= range.max ? value : null;
    if (manualSums.filter(v => v != null).length === expr?.groups.length) {
      queueMicrotask(() => logDamage(r));
    }
  }

  function toggleCrit() {
    crit = !crit;
    groupResults = [];
    manualSums = [];
    twiceRolls = [];
    damageLogId = null;
  }

  const modeLabel: Record<AdvMode, string> = { normal: "Normal", advantage: "Vorteil", disadvantage: "Nachteil" };
</script>

{#if req}
  <Modal title={req.title} onclose={closeRoll} size="md">
    {#if req.subtitle}<p class="muted small sub">{req.subtitle}</p>{/if}

    {#if req.type === "d20"}
      <div class="row-between head">
        <div class="segmented" role="group" aria-label="Vorteil / Nachteil von Hand">
          {#each ["normal", "advantage", "disadvantage"] as const as m (m)}
            <button aria-pressed={userMode === m} onclick={() => setMode(req, m)}>{modeLabel[m]}</button>
          {/each}
        </div>
        <span class="badge badge-accent mono">
          W20 {formatMod(req.modifier + optionFlat)}{#if req.penalty}&nbsp;{formatMod(req.penalty)}{/if}{#each diceOptions as o (o.id)}&nbsp;{o.sign < 0 ? "−" : "+"}{diceLabel(o.dice)}{/each}
        </span>
      </div>
      {#if sourceNote}<p class="tiny muted mode-note">{sourceNote}</p>{/if}
      {#each req.notes ?? [] as note (note)}
        <p class="note small">{note}</p>
      {/each}

      {#if options.length}
        <div class="options">
          {#each options as o (o.id)}
            <label class="option" class:auto={o.auto} class:disabled={!o.auto && optionDisabled(o)}>
              <input type="checkbox" checked={selected.includes(o.id)} disabled={optionDisabled(o)} onchange={() => toggleOption(req, o)} />
              <span class="grow">
                <strong>{o.label}</strong>
                <span class="mono small">{optionText(o)}</span>
                {#if o.auto}<span class="badge badge-accent">aktiv</span>{/if}
                {#if o.detail}<span class="tiny muted block">{o.detail}</span>{/if}
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if req.physical}
        <p class="muted small">
          {#if needed === 1}Tippe die Zahl, die dein W20 zeigt.{:else}Würfle zwei W20 und tippe beide Ergebnisse an.{/if}
          {#if picks.length && !rolled}<strong> ({picks.length}/{needed})</strong>{/if}
        </p>
        <div class="d20-grid">
          {#each Array.from({ length: 20 }, (_, i) => i + 1) as n (n)}
            <button
              class="num"
              class:picked={picks.includes(n)}
              class:kept={rolled && kept === n}
              class:nat20={n === 20}
              class:nat1={n === 1}
              onclick={() => pick(req, n)}>{n}</button
            >
          {/each}
        </div>
      {:else if !rolled}
        <button class="btn btn-primary big-roll" onclick={() => rollD20Digital(req)}>
          <Icon name="roll" size={22} /> Würfeln
        </button>
      {/if}

      {#if req.physical && diceOptions.length}
        <div class="bonus-dice">
          {#each diceOptions as o (o.id)}
            {@const range = o.dice.reduce((r, g) => ({ min: r.min + groupRange(g).min, max: r.max + groupRange(g).max }), { min: 0, max: 0 })}
            <label class="small">
              {o.label}: {diceLabel(o.dice)}
              <input
                class="input input-sm mono"
                type="number"
                inputmode="numeric"
                min={range.min}
                max={range.max}
                placeholder="{range.min}–{range.max}"
                value={bonusRolls[o.id] ?? ""}
                onchange={e => setBonus(req, o, (e.currentTarget as HTMLInputElement).value)}
              />
            </label>
          {/each}
        </div>
      {/if}

      {#if rolled && kept != null && bonusMissing}
        <p class="muted small">Trage noch das Ergebnis der Bonuswürfel ein.</p>
      {:else if rolled && kept != null}
        {@const total = d20Total(req, kept)}
        <div class="result" class:crit={kept === 20} class:fumble={kept === 1}>
          <div class="total mono">{total}</div>
          <div class="breakdown mono">
            W20 {#if picks.length > 1}({picks.join(" / ")}) → {/if}{kept}
            {formatMod(req.modifier + optionFlat)}{#if req.penalty}&nbsp;{formatMod(req.penalty)}{/if}
            {#each diceOptions as o (o.id)}&nbsp;{o.sign < 0 ? "−" : "+"}{bonusRolls[o.id]} ({diceLabel(o.dice)}){/each}
          </div>
          {#if kept === 20}<div class="flag">Natürliche 20!</div>{/if}
          {#if kept === 1}<div class="flag">Natürliche 1 – Patzer</div>{/if}
          {#if req.target != null}
            <div class="flag">{total >= req.target ? "Erfolg" : "Misserfolg"} (Ziel {req.target})</div>
          {/if}
        </div>
        {#each req.target != null && total < req.target ? [] : active.filter(o => o.onSuccess) as o (o.id)}
          {#if successDone.includes(o.id)}
            <p class="small muted center">✓ {o.onSuccess!.label}</p>
          {:else}
            <div class="row actions">
              <button class="btn btn-sm" onclick={() => { o.onSuccess!.run(); successDone = [...successDone, o.id]; }}>Gelungen: {o.onSuccess!.label}</button>
            </div>
          {/if}
        {/each}
        <div class="row actions">
          <button class="btn" onclick={() => (req.physical ? resetD20() : rollD20Digital(req))}>
            <RotateCcw size={16} /> Nochmal
          </button>
          {#if req.followUp}
            <button class="btn btn-primary" onclick={() => toDamage(req)}>
              <Icon name="attack" size={16} /> {kept === 20 ? "Kritischen Schaden würfeln" : "Schaden würfeln"}
            </button>
          {/if}
        </div>
      {/if}
    {:else if req.type === "damage"}
      {#if !expr}
        <p class="note">Ungültiger Würfelausdruck: „{req.dice}“. Beispiel: 2d6+3</p>
      {:else}
        <div class="row-between head">
          <span class="badge badge-accent mono">{formatDice(expr)}{req.damageType ? ` · ${req.damageType}` : ""}</span>
          {#if req.canCrit !== false && !req.heal && !req.effect}
            <label class="checkbox small"><input type="checkbox" checked={crit} onchange={toggleCrit} /> Kritischer Treffer</label>
          {/if}
        </div>

        {#if req.twice && twiceExpr && req.physical}
          <p class="twice-note small">
            {req.twice.label}: Würfle die Waffenwürfel ({formatDice(twiceExpr)}) zweimal und trage das Ergebnis ein, das du nimmst.
          </p>
        {/if}

        {#if req.physical}
          {#each expr.groups as group, i (i)}
            {@const range = groupRange(group)}
            <div class="group">
              <div class="label">{group.count}W{group.sides} – Summe deiner Würfel</div>
              {#if range.max - range.min <= 47}
                <div class="sum-grid">
                  {#each Array.from({ length: range.max - range.min + 1 }, (_, k) => range.min + k) as n (n)}
                    <button class="num" class:kept={manualSums[i] === n} onclick={() => setManual(req, i, n)}>{n}</button>
                  {/each}
                </div>
              {:else}
                <input
                  class="input"
                  type="number"
                  inputmode="numeric"
                  min={range.min}
                  max={range.max}
                  placeholder="{range.min}–{range.max}"
                  value={manualSums[i] ?? ""}
                  onchange={e => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    setManual(req, i, v.trim() === "" ? null : Number(v));
                  }}
                />
              {/if}
            </div>
          {/each}
        {:else if !groupResults.length}
          <button class="btn btn-primary big-roll" onclick={() => rollDamageDigital(req)}>
            <Icon name="roll" size={22} /> {req.heal ? "Heilung würfeln" : req.effect ? "Würfeln" : "Schaden würfeln"}
          </button>
        {/if}

        {#if damageTotal != null}
          <div class="result" class:crit>
            <div class="total mono">{damageTotal}</div>
            <div class="breakdown mono">
              {#if !req.physical}
                {#each expr.groups as g, i (i)}
                  {#if i > 0}+ {/if}{g.count}W{g.sides} [{groupValues(i)?.join(", ")}]
                {/each}
              {:else}
                {expr.groups.map((g, i) => `${g.count}W${g.sides} (${manualSums[i]})`).join(" + ")}
              {/if}
              {#if expr.bonus}&nbsp;{formatMod(expr.bonus)}{/if}
            </div>
            <div class="flag">{req.heal ? "Trefferpunkte geheilt" : req.effect ? req.effect : `Schaden${req.damageType ? ` (${req.damageType})` : ""}`}</div>
          </div>
          {#if req.twice && twiceSets && !req.physical}
            <div class="twice">
              <span class="small muted">{req.twice.label}: Waffenwürfel zweimal gewürfelt. Welcher Wurf zählt?</span>
              <div class="segmented" role="group" aria-label="Wurf wählen">
                {#each twiceSets as set, k (k)}
                  <button aria-pressed={twiceChoice === k} onclick={() => chooseTwice(req, k as 0 | 1)}>
                    Wurf {k + 1}: <span class="mono">[{set.dice.join(", ")}] = {set.sum}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          {#if !req.physical}
            <div class="row actions">
              <button class="btn" onclick={() => rollDamageDigital(req)}><RotateCcw size={16} /> Nochmal</button>
            </div>
          {/if}
        {/if}
      {/if}
    {/if}
  </Modal>
{/if}

<style>
  .sub { margin-top: -0.3rem; }
  .twice { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.75rem; }
  .twice .segmented button { flex: 1; }
  .twice-note { margin: 0 0 0.6rem; padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); background: var(--accent-soft); }
  .head { margin-bottom: 0.75rem; }
  .mode-note { margin: 0.1rem 0 0.4rem; }
  .note {
    margin: 0 0 0.6rem;
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--danger-soft);
    color: var(--danger);
  }
  .d20-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
    margin-bottom: 0.9rem;
  }
  @media (min-width: 520px) {
    .d20-grid { grid-template-columns: repeat(10, 1fr); }
  }
  .sum-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 0.35rem;
  }
  .num {
    min-height: 46px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    font-weight: 700;
    font-size: 1.05rem;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .num:hover { border-color: var(--accent); }
  .num.nat20 { color: var(--success); }
  .num.nat1 { color: var(--danger); }
  .num.picked { background: var(--accent-soft); border-color: var(--accent); }
  .num.kept { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--accent-contrast); }
  .group { margin-bottom: 0.9rem; }
  .group .label { margin-bottom: 0.4rem; }
  .big-roll { width: 100%; min-height: 64px; font-size: 1.15rem; margin: 0.5rem 0 1rem; }
  .result {
    text-align: center;
    padding: 1rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    animation: reveal 0.25s ease-out;
  }
  .result.crit { background: color-mix(in oklab, var(--success) 18%, transparent); border-color: var(--success); }
  .result.fumble { background: var(--danger-soft); border-color: var(--danger); }
  .total { font-size: 3rem; font-weight: 800; line-height: 1.1; font-family: var(--font-display); }
  .breakdown { color: var(--muted); font-size: 0.9rem; }
  .flag { margin-top: 0.3rem; font-weight: 700; }
  .actions { justify-content: center; margin-top: 0.9rem; }
  .center { text-align: center; margin: 0.6rem 0 0; }
  .options { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; }
  .option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.4rem 0.55rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
  }
  .option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .option.disabled { opacity: 0.55; cursor: not-allowed; }
  .option input { margin-top: 0.2rem; accent-color: var(--accent-strong); }
  .option .badge { font-size: 0.66rem; margin-left: 0.25rem; }
  .block { display: block; }
  .bonus-dice { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 0.8rem; }
  .bonus-dice label { display: flex; align-items: center; gap: 0.4rem; }
  .bonus-dice input { width: 5.5rem; }
  @keyframes reveal { from { transform: scale(0.9); opacity: 0; } }
</style>
