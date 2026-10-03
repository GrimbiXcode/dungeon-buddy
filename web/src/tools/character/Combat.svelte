<script lang="ts">
  import NumberField from "../../components/NumberField.svelte";
  import { Plus, Trash2 } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Modal from "../../components/Modal.svelte";
  import { hitDiceLeft, hitDicePools, hitDiceSummary, leftOf, mod, newResource, spendHitDie as markHitDie } from "../../lib/character";
  import { CONDITIONS } from "../../lib/dnd";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);
  let pickConditions = $state(false);

  function setDeath(kind: "successes" | "failures", n: number) {
    c.deathSaves[kind] = c.deathSaves[kind] === n ? n - 1 : n;
  }

  function toggleCondition(name: string) {
    c.conditions = c.conditions.includes(name) ? c.conditions.filter(x => x !== name) : [...c.conditions, name];
  }

  /** Trefferwürfel ausgeben: würfeln (Heilung) und als verbraucht markieren. */
  function spendHitDie(die: number) {
    if (!markHitDie(c, die)) return;
    const con = mod(c, "con");
    ctx.rollDamage(`Trefferwürfel W${die}`, `1d${die}${con ? (con > 0 ? `+${con}` : `${con}`) : ""}`, {
      heal: true,
      subtitle: "Ergebnis anschliessend unter „Heilen“ eintragen.",
    });
  }

  const pools = $derived(hitDicePools(c));

  /** Ressource entfernen; Fähigkeiten, die sie verbrauchten, verlieren den Bezug (statt unbegrenzt zu werden) */
  async function removeResource(id: string) {
    const users = c.features.filter(f => f.resourceId === id);
    const name = c.resources.find(r => r.id === id)?.name || "Ressource";
    if (users.length && !(await confirmDialog(`„${name}“ wird von ${users.map(f => f.name).join(", ")} verbraucht. Diese Fähigkeiten verbrauchen danach nichts mehr.`, { confirmLabel: "Entfernen" }))) return;
    for (const f of users) f.resourceId = null;
    c.resources = c.resources.filter(x => x.id !== id);
  }

  function setUsed(die: number, used: number) {
    c.hitDiceUsed = { ...c.hitDiceUsed, [die]: used };
  }
</script>

<div class="combat">
  <section class="card">
    <div class="row-between head">
      <h3>Zustände</h3>
      <button class="btn btn-sm" onclick={() => (pickConditions = true)}><Plus size={14} /> Zustand</button>
    </div>
    {#if c.conditions.length}
      <div class="chip-row">
        {#each c.conditions as cond (cond)}
          <button class="badge badge-danger cond" onclick={() => toggleCondition(cond)} aria-label="{cond} entfernen">{cond} ✕</button>
        {/each}
      </div>
    {:else}
      <p class="muted small">Keine Zustände aktiv.</p>
    {/if}
  </section>

  <section class="card">
    <h3><Icon name="death" size={16} /> Todesrettungswürfe</h3>
    <div class="death">
      <div class="row">
        <span class="small muted w">Erfolge</span>
        {#each [1, 2, 3] as n (n)}
          <button class="pip success" class:on={c.deathSaves.successes >= n} aria-label="Erfolg {n}" onclick={() => setDeath("successes", n)}></button>
        {/each}
      </div>
      <div class="row">
        <span class="small muted w">Fehlschläge</span>
        {#each [1, 2, 3] as n (n)}
          <button class="pip failure" class:on={c.deathSaves.failures >= n} aria-label="Fehlschlag {n}" onclick={() => setDeath("failures", n)}></button>
        {/each}
      </div>
      <button class="btn btn-sm" onclick={() => ctx.rollD20("Todesrettungswurf", 0, "deathSave", { target: 10, subtitle: "10 oder mehr: Erfolg. Natürliche 20: 1 TP. Natürliche 1: zwei Fehlschläge." })}>
        Würfeln
      </button>
    </div>
  </section>

  <section class="card">
    <h3><Icon name="hp" size={16} /> Trefferwürfel</h3>
    <p class="small"><strong>{hitDiceLeft(c)}</strong> von {hitDiceSummary(c)} übrig</p>
    {#if ctx.editing}
      <div class="row">
        {#each pools as p (p.die)}
          <label class="tiny muted">W{p.die} verbraucht <NumberField class="input input-sm mono used" min={0} max={p.total} bind:value={() => p.used, v => setUsed(p.die, v ?? 0)} /></label>
        {/each}
      </div>
    {:else}
      <div class="row">
        {#each pools as p (p.die)}
          <button class="btn btn-sm" disabled={p.used >= p.total} onclick={() => spendHitDie(p.die)}>W{p.die} ausgeben ({p.total - p.used} übrig)</button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card resources">
    <div class="row-between head">
      <h3>Ressourcen</h3>
      {#if ctx.editing}
        <button class="btn btn-sm" onclick={() => c.resources.push(newResource({ name: "Neue Ressource" }))}><Plus size={14} /> Ressource</button>
      {/if}
    </div>
    {#if c.resources.length === 0}
      <p class="muted small">Klassenressourcen wie Kampfrausch, Ki/Fokus, Kanalisieren … {#if !ctx.editing}(im Bearbeiten-Modus hinzufügen){/if}</p>
    {/if}
    {#each c.resources as r (r.id)}
      {#if ctx.editing}
        <div class="res-edit">
          <input class="input input-sm grow" bind:value={r.name} aria-label="Name" />
          <NumberField class="input input-sm mono num" min={0} aria-label="Maximum" bind:value={r.max} />
          <select class="select input-sm reset" bind:value={r.reset} aria-label="Zurücksetzen bei">
            <option value="short">Kurze Rast</option>
            <option value="long">Lange Rast</option>
            <option value="none">Nie</option>
          </select>
          <button class="btn btn-sm btn-icon btn-danger" aria-label="Entfernen" onclick={() => removeResource(r.id)}><Trash2 size={14} /></button>
        </div>
      {:else}
        <div class="res">
          <span class="grow small">{r.name} <span class="tiny faint">{r.reset === "short" ? "kurze Rast" : r.reset === "long" ? "lange Rast" : ""}</span></span>
          {#if r.max <= 10}
            <span class="pips">
              {#each Array.from({ length: r.max }, (_, i) => i) as i (i)}
                <button class="pip" class:on={i < leftOf(r)} aria-label="{r.name} {i + 1}" onclick={() => (r.used = i < leftOf(r) ? r.max - i : r.max - i - 1)}></button>
              {/each}
            </span>
          {:else}
            <span class="row counter">
              <button class="btn btn-sm btn-icon" aria-label="verbrauchen" onclick={() => (r.used = Math.min(r.max, r.used + 1))}>−</button>
              <span class="mono">{leftOf(r)}/{r.max}</span>
              <button class="btn btn-sm btn-icon" aria-label="zurückgewinnen" onclick={() => (r.used = Math.max(0, r.used - 1))}>+</button>
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </section>
</div>

{#if pickConditions}
  <Modal title="Zustände" size="sm" onclose={() => (pickConditions = false)}>
    <div class="cond-grid">
      {#each CONDITIONS as cond (cond)}
        <label class="checkbox"><input type="checkbox" checked={c.conditions.includes(cond)} onchange={() => toggleCondition(cond)} /> {cond}</label>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  .combat { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  h3 { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0 0 0.6rem; }
  .head { margin-bottom: 0.6rem; }
  .head h3 { margin: 0; }
  .cond { cursor: pointer; font: inherit; font-size: 0.78rem; }
  .death { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .w { width: 6.5rem; }
  .pip {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--faint);
    background: transparent;
    cursor: pointer;
    padding: 0;
  }
  .pip.on { background: var(--accent); border-color: var(--accent); }
  .pip.success.on { background: var(--success); border-color: var(--success); }
  .pip.failure.on { background: var(--danger); border-color: var(--danger); }
  .combat :global(.used) { width: 5rem; display: block; margin-top: 0.2rem; }
  .res, .res-edit { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid var(--border); }
  .res:last-child, .res-edit:last-child { border-bottom: 0; }
  .pips { display: flex; gap: 0.25rem; flex-wrap: wrap; justify-content: flex-end; }
  .pips .pip { width: 18px; height: 18px; }
  .combat :global(.num) { width: 4rem; }
  .reset { width: 8.5rem; }
  .counter { gap: 0.35rem; }
  @media (max-width: 480px) {
    .res-edit { flex-wrap: wrap; }
    .res-edit .grow { flex-basis: 100%; }
  }
  .cond-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
</style>
