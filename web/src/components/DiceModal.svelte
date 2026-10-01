<script lang="ts">
  import { Dices, RotateCcw, Swords } from "@lucide/svelte";
  import Modal from "./Modal.svelte";
  import {
    closeRoll,
    logRoll,
    openRoll,
    roller,
    type AdvMode,
    type D20Request,
    type DamageRequest,
  } from "../lib/roller.svelte";
  import { critExpr, formatDice, groupRange, parseDice, rollDie, rollGroup, type DiceExpr } from "../lib/dice";
  import { formatMod } from "../lib/dnd";

  const req = $derived(roller.request);

  // ── W20 ────────────────────────────────────────────────────────────────
  let mode = $state<AdvMode>("normal");
  let picks = $state<number[]>([]);
  let rolled = $state(false);

  // ── Schaden ────────────────────────────────────────────────────────────
  let crit = $state(false);
  /** Pro Würfelgruppe: Einzelwürfe (digital) bzw. Summe (physisch) */
  let groupResults = $state<(number[] | null)[]>([]);
  let manualSums = $state<(number | null)[]>([]);

  $effect(() => {
    // Zurücksetzen, sobald eine neue Anfrage geöffnet wird
    const r = roller.request;
    if (!r) return;
    picks = [];
    rolled = false;
    mode = r.type === "d20" ? (r.mode ?? "normal") : "normal";
    crit = r.type === "damage" ? Boolean(r.crit) : false;
    groupResults = [];
    manualSums = [];
  });

  const needed = $derived(mode === "normal" ? 1 : 2);

  function d20Kept(values: number[]) {
    if (values.length < needed) return null;
    if (mode === "advantage") return Math.max(...values);
    if (mode === "disadvantage") return Math.min(...values);
    return values[0]!;
  }

  const kept = $derived(d20Kept(picks));

  function d20Total(r: D20Request, k: number) {
    return k + r.modifier + (r.penalty ?? 0);
  }

  function finishD20(r: D20Request, values: number[]) {
    const k = d20Kept(values);
    if (k == null) return;
    rolled = true;
    const total = d20Total(r, k);
    r.onResult?.(k, total);
    logRoll({
      title: r.title,
      detail: `W20 ${values.join(" / ")}${mode !== "normal" ? (mode === "advantage" ? " (Vorteil)" : " (Nachteil)") : ""} ${formatMod(r.modifier)}${r.penalty ? ` ${formatMod(r.penalty)}` : ""}`,
      total,
      flag: k === 20 ? "crit" : k === 1 ? "fumble" : undefined,
    });
  }

  function rollD20Digital(r: D20Request) {
    picks = Array.from({ length: needed }, () => rollDie(20));
    finishD20(r, picks);
  }

  function pick(r: D20Request, n: number) {
    if (rolled) {
      picks = [];
      rolled = false;
    }
    picks = [...picks, n];
    if (picks.length >= needed) finishD20(r, picks);
  }

  function setMode(m: AdvMode) {
    mode = m;
    picks = [];
    rolled = false;
  }

  function resetD20() {
    picks = [];
    rolled = false;
  }

  function toDamage(r: D20Request) {
    if (!r.followUp) return;
    openRoll({ ...r.followUp, type: "damage", physical: r.physical, crit: kept === 20 });
  }

  // ── Schaden ───────────────────────────────────────────────────────────
  const baseExpr = $derived(req?.type === "damage" ? parseDice(req.dice) : null);
  const expr = $derived<DiceExpr | null>(baseExpr ? (crit ? critExpr(baseExpr) : baseExpr) : null);

  const damageTotal = $derived.by(() => {
    if (!expr || !req || req.type !== "damage") return null;
    let sum = expr.bonus;
    for (let i = 0; i < expr.groups.length; i++) {
      const value = req.physical ? manualSums[i] : groupResults[i]?.reduce((a, b) => a + b, 0);
      if (value == null) return null;
      sum += value;
    }
    return Math.max(0, sum);
  });

  function rollDamageDigital(r: DamageRequest) {
    if (!expr) return;
    groupResults = expr.groups.map(g => rollGroup(g));
    logDamage(r);
  }

  function logDamage(r: DamageRequest) {
    if (!expr || damageTotal == null) return;
    logRoll({
      title: r.title,
      detail: `${formatDice(expr)}${crit ? " (kritisch)" : ""}${r.damageType ? ` ${r.damageType}` : ""}`,
      total: damageTotal,
    });
  }

  function setManual(r: DamageRequest, index: number, value: number) {
    manualSums[index] = value;
    if (manualSums.filter(v => v != null).length === expr?.groups.length) {
      queueMicrotask(() => logDamage(r));
    }
  }

  function toggleCrit() {
    crit = !crit;
    groupResults = [];
    manualSums = [];
  }

  const modeLabel: Record<AdvMode, string> = { normal: "Normal", advantage: "Vorteil", disadvantage: "Nachteil" };
</script>

{#if req}
  <Modal title={req.title} onclose={closeRoll} size="md">
    {#if req.subtitle}<p class="muted small sub">{req.subtitle}</p>{/if}

    {#if req.type === "d20"}
      <div class="row-between head">
        <div class="segmented" role="group" aria-label="Vorteil / Nachteil">
          {#each ["normal", "advantage", "disadvantage"] as const as m (m)}
            <button aria-pressed={mode === m} onclick={() => setMode(m)}>{modeLabel[m]}</button>
          {/each}
        </div>
        <span class="badge badge-accent mono">
          W20 {formatMod(req.modifier)}{#if req.penalty}&nbsp;{formatMod(req.penalty)}{/if}
        </span>
      </div>
      {#each req.notes ?? [] as note (note)}
        <p class="note small">{note}</p>
      {/each}

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
          <Dices size={22} /> Würfeln
        </button>
      {/if}

      {#if rolled && kept != null}
        {@const total = d20Total(req, kept)}
        <div class="result" class:crit={kept === 20} class:fumble={kept === 1}>
          <div class="total mono">{total}</div>
          <div class="breakdown mono">
            W20 {#if picks.length > 1}({picks.join(" / ")}) → {/if}{kept}
            {formatMod(req.modifier)}{#if req.penalty}&nbsp;{formatMod(req.penalty)}{/if}
          </div>
          {#if kept === 20}<div class="flag">Natürliche 20!</div>{/if}
          {#if kept === 1}<div class="flag">Natürliche 1 – Patzer</div>{/if}
          {#if req.target != null}
            <div class="flag">{total >= req.target ? "Erfolg" : "Misserfolg"} (Ziel {req.target})</div>
          {/if}
        </div>
        <div class="row actions">
          <button class="btn" onclick={() => (req.physical ? resetD20() : rollD20Digital(req))}>
            <RotateCcw size={16} /> Nochmal
          </button>
          {#if req.followUp}
            <button class="btn btn-primary" onclick={() => toDamage(req)}>
              <Swords size={16} /> {kept === 20 ? "Kritischen Schaden würfeln" : "Schaden würfeln"}
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
          {#if req.canCrit !== false && !req.heal}
            <label class="checkbox small"><input type="checkbox" checked={crit} onchange={toggleCrit} /> Kritischer Treffer</label>
          {/if}
        </div>

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
                  onchange={e => setManual(req, i, Number((e.currentTarget as HTMLInputElement).value))}
                />
              {/if}
            </div>
          {/each}
        {:else if !groupResults.length}
          <button class="btn btn-primary big-roll" onclick={() => rollDamageDigital(req)}>
            <Dices size={22} /> {req.heal ? "Heilung würfeln" : "Schaden würfeln"}
          </button>
        {/if}

        {#if damageTotal != null}
          <div class="result" class:crit>
            <div class="total mono">{damageTotal}</div>
            <div class="breakdown mono">
              {#if !req.physical}
                {#each expr.groups as g, i (i)}
                  {#if i > 0}+ {/if}{g.count}W{g.sides} [{groupResults[i]?.join(", ")}]
                {/each}
              {:else}
                {expr.groups.map((g, i) => `${g.count}W${g.sides} (${manualSums[i]})`).join(" + ")}
              {/if}
              {#if expr.bonus}&nbsp;{formatMod(expr.bonus)}{/if}
            </div>
            <div class="flag">{req.heal ? "Trefferpunkte geheilt" : `Schaden${req.damageType ? ` (${req.damageType})` : ""}`}</div>
          </div>
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
  .head { margin-bottom: 0.75rem; }
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
  @keyframes reveal { from { transform: scale(0.9); opacity: 0; } }
</style>
