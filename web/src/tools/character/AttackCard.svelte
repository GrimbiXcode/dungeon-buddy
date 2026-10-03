<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { ChevronDown, Trash2 } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import { attackAbility, attackDamageBonus, attackRange, attackToHit, isFinesse, offhandWeapons, type Attack } from "../../lib/character";
  import { formatDice, parseDice } from "../../lib/dice";
  import { ABILITY_SHORT, formatMod, type Ability } from "../../lib/dnd";
  import { appliesToAttack } from "../../lib/features";
  import { LOW_STOCK, attackConsumption, hasStock } from "../../lib/inventory";
  import { sheet } from "./context";

  let {
    attack,
    onedit,
    ondelete,
    onlibrary,
  }: { attack: Attack; onedit?: () => void; ondelete?: () => void; onlibrary?: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);
  let open = $state(false);

  const matching = $derived(c.features.filter(f => appliesToAttack(f, attack)));
  const offhand = $derived(offhandWeapons(c, attack, ctx.ruleset));
  const use = $derived(attackConsumption(c, attack));
  const stocked = $derived(hasStock(c, attack));

  function damageText(a: Attack) {
    const expr = parseDice(a.damage);
    if (!expr) return a.damage || "–";
    return formatDice({ ...expr, bonus: expr.bonus + attackDamageBonus(c, a) });
  }

  function damageDice(a: Attack) {
    const expr = parseDice(a.damage);
    if (!expr) return "";
    const bonus = expr.bonus + attackDamageBonus(c, a);
    return `${expr.groups.map(g => `${g.count}d${g.sides}`).join("+")}${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ""}`;
  }

  const abilityLabel = $derived.by(() => {
    const ab = attackAbility(c, attack);
    return ab === "spell" ? "Zauber" : ab === "none" ? "" : ABILITY_SHORT[ab as Ability];
  });
</script>

<article class="attack">
  <div class="top">
    <button class="name-btn grow" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="name">{attack.name || "Angriff"}</span>
      <ChevronDown size={14} class="chev {open ? 'open' : ''}" />
    </button>
    <button class="btn btn-sm hit mono" onclick={() => ctx.openAttack(attack)} aria-label="Angriff mit {attack.name}">
      <Icon name="roll" size={14} /> {formatMod(attackToHit(c, attack))}
    </button>
    {#if damageDice(attack)}
      <button class="btn btn-sm btn-ghost mono dmg" onclick={() => ctx.rollDamage(`${attack.name} – Schaden`, damageDice(attack), { damageType: attack.damageType })}>
        {damageText(attack)}
      </button>
    {/if}
  </div>

  <div class="chip-row meta">
    <span class="badge">{attack.kind === "ranged" ? "Fernkampf" : "Nahkampf"}{attackRange(attack, unitSystem()) ? ` ${attackRange(attack, unitSystem())}` : ""}</span>
    {#if abilityLabel}<span class="badge">{abilityLabel}{#if isFinesse(attack)} (Finesse){/if}</span>{/if}
    <span class="badge mono">{damageText(attack)}{attack.damageType ? ` ${attack.damageType}` : ""}</span>
    {#if attack.extraDamage}<span class="badge mono">+{attack.extraDamage} {attack.extraDamageType}</span>{/if}
    {#each attack.properties.filter(p => p !== "Finesse") as p (p)}<span class="badge tag">{p}</span>{/each}
    {#if attack.mastery}<span class="badge">{attack.mastery}</span>{/if}
    {#if use}
      <span class="badge" class:badge-danger={!stocked || use.item.quantity <= LOW_STOCK} title="Verbraucht {use.amount} pro Angriff">
        {use.item.ammo ? "➶ " : ""}{use.item.quantity} {use.item.name}
      </span>
    {/if}
  </div>

  {#if matching.length}<p class="tiny accent">{matching.length} passende Fähigkeit{matching.length === 1 ? "" : "en"}</p>{/if}

  {#if open}
    <div class="details small">
      {#if attack.notes}<p>{attack.notes}</p>{/if}
      {#if attack.versatileDamage}<p><strong>Zweihändig:</strong> {attack.versatileDamage}</p>{/if}
      {#if matching.length}<p><strong>Fähigkeiten:</strong> {matching.map(f => f.name).join(", ")}</p>{/if}
      {#if offhand.length}<p><strong>Zusatzangriff möglich mit:</strong> {offhand.map(a => a.name).join(", ")}</p>{/if}
      <div class="row actions">
        {#if onedit}<button class="btn btn-sm" onclick={onedit}><Icon name="edit" size={13} /> Bearbeiten</button>{/if}
        {#if onlibrary}<button class="btn btn-sm" onclick={onlibrary}><Icon name="library" size={13} /> In Bibliothek</button>{/if}
        {#if ondelete}<button class="btn btn-sm btn-danger" onclick={ondelete}><Trash2 size={13} /> Löschen</button>{/if}
      </div>
    </div>
  {/if}
</article>

<style>
  .attack {
    padding: 0.6rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .top { display: flex; align-items: center; gap: 0.4rem; }
  .name-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }
  .name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name-btn :global(.chev) { flex: none; color: var(--faint); transition: transform 0.15s; }
  .name-btn :global(.chev.open) { transform: rotate(180deg); }
  .hit { font-weight: 800; min-width: 4.2rem; flex: none; }
  .dmg { flex: none; }
  .meta { gap: 0.25rem; }
  .meta .badge { font-size: 0.7rem; }
  .tag { background: transparent; }
  .accent { color: var(--accent-text); margin: 0; }
  .details { border-top: 1px dashed var(--border); padding-top: 0.45rem; }
  .details p { margin: 0 0 0.35rem; }
  .actions { margin-top: 0.4rem; }
</style>
