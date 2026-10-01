<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { Plus, Swords, Trash2, Dices } from "@lucide/svelte";
  import { attackDamageBonus, attackToHit, newAttack, type Attack } from "../../lib/character";
  import { ABILITIES, ABILITY_SHORT, formatMod } from "../../lib/dnd";
  import { formatDice, parseDice } from "../../lib/dice";
  import { WEAPON_PROPERTIES, appliesToAttack } from "../../lib/features";
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);

  const MASTERIES = ["", "Auslaugen (Sap)", "Einkerben (Nick)", "Plagen (Vex)", "Spalten (Cleave)", "Streifen (Graze)", "Stossen (Push)", "Umstossen (Topple)", "Verlangsamen (Slow)"];

  function damageString(a: Attack) {
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

  function toggleProperty(a: Attack, p: string) {
    a.properties = a.properties.includes(p) ? a.properties.filter(x => x !== p) : [...a.properties, p];
  }

  /** Passende Fähigkeiten für diese Waffe (Hinweis in der Liste) */
  function featureCount(a: Attack) {
    return c.features.filter(f => appliesToAttack(f, a)).length;
  }

  function remove(id: string) {
    c.attacks = c.attacks.filter(a => a.id !== id);
  }
</script>

<section class="card">
  <div class="row-between head">
    <h3><Swords size={17} /> Angriffe</h3>
    {#if ctx.editing}
      <button class="btn btn-sm" onclick={() => c.attacks.push(newAttack({ name: "Neue Waffe" }))}><Plus size={14} /> Angriff</button>
    {/if}
  </div>

  {#if c.attacks.length === 0}
    <p class="muted small">Noch keine Angriffe. {#if !ctx.editing}Wechsle in „Bearbeiten“, um Waffen hinzuzufügen.{/if}</p>
  {:else if ctx.editing}
    <div class="stack">
      {#each c.attacks as a (a.id)}
        <div class="edit-attack">
          <div class="row">
            <input class="input input-sm grow" bind:value={a.name} placeholder="Name, z. B. Langschwert" aria-label="Name" />
            <button class="btn btn-sm btn-icon btn-danger" aria-label="Angriff entfernen" onclick={() => remove(a.id)}><Trash2 size={14} /></button>
          </div>
          <div class="fields">
            <label class="tiny muted">Attribut
              <select class="select input-sm" bind:value={a.ability}>
                {#each ABILITIES as ab (ab)}<option value={ab}>{ABILITY_SHORT[ab]}</option>{/each}
                <option value="spell">Zauber</option>
                <option value="none">keins</option>
              </select>
            </label>
            <label class="tiny muted">Bonus Treffer
              <input class="input input-sm mono" type="number" bind:value={a.toHitBonus} />
            </label>
            <label class="tiny muted">Schaden
              <input class="input input-sm mono" bind:value={a.damage} placeholder="1d8" />
            </label>
            <label class="tiny muted">Bonus Schaden
              <input class="input input-sm mono" type="number" bind:value={a.damageBonus} />
            </label>
            <label class="tiny muted">Schadensart
              <input class="input input-sm" bind:value={a.damageType} placeholder="Hieb" />
            </label>
            <label class="tiny muted">Art
              <select class="select input-sm" bind:value={a.kind}>
                <option value="melee">Nahkampf</option>
                <option value="ranged">Fernkampf</option>
              </select>
            </label>
            <label class="tiny muted">Reichweite
              <input class="input input-sm" bind:value={a.range} placeholder={unitSystem() === "metric" ? "1.5 m / 24/96 m" : "5 ft / 80/320 ft"} />
            </label>
            {#if a.properties.includes("Vielseitig")}
              <label class="tiny muted">Zweihändig
                <input class="input input-sm mono" bind:value={a.versatileDamage} placeholder="1d10" />
              </label>
            {/if}
            <label class="tiny muted">Zusatzschaden
              <input class="input input-sm mono" bind:value={a.extraDamage} placeholder="z. B. 2d6" />
            </label>
            <label class="tiny muted">Zusatz-Art
              <input class="input input-sm" bind:value={a.extraDamageType} placeholder="Feuer" />
            </label>
            {#if ctx.ruleset === "2024"}
              <label class="tiny muted">Meisterschaft
                <select class="select input-sm" bind:value={a.mastery}>
                  {#each MASTERIES as m (m)}<option value={m}>{m || "–"}</option>{/each}
                </select>
              </label>
            {/if}
          </div>
          <div class="chip-row" role="group" aria-label="Waffeneigenschaften">
            {#each WEAPON_PROPERTIES as p (p)}
              <button type="button" class="prop" aria-pressed={a.properties.includes(p)} onclick={() => toggleProperty(a, p)}>{p}</button>
            {/each}
          </div>
          <div class="row small">
            <label class="checkbox"><input type="checkbox" bind:checked={a.proficient} /> Geübt</label>
            <label class="checkbox"><input type="checkbox" bind:checked={a.addAbilityToDamage} /> Attribut auf Schaden</label>
          </div>
          <input class="input input-sm" bind:value={a.notes} placeholder="Notiz (Reichweite, Eigenschaften …)" aria-label="Notiz" />
        </div>
      {/each}
    </div>
  {:else}
    <div class="attacks">
      {#each c.attacks as a (a.id)}
        <div class="attack">
          <div class="grow info">
            <strong class="truncate">{a.name || "Angriff"}</strong>
            <span class="tiny muted">
              {damageString(a)} {a.damageType}{#if a.extraDamage} + {a.extraDamage} {a.extraDamageType}{/if}
              · {a.kind === "ranged" ? "Fernkampf" : "Nahkampf"}{#if a.range} {convertText(a.range, unitSystem())}{/if}
              {#if a.properties.length} · {a.properties.join(", ")}{/if}{#if a.mastery} · {a.mastery}{/if}{#if a.notes} · {a.notes}{/if}
            </span>
            {#if featureCount(a)}<span class="tiny accent">{featureCount(a)} passende Fähigkeit{featureCount(a) === 1 ? "" : "en"}</span>{/if}
          </div>
          <button class="btn btn-sm hit mono" onclick={() => ctx.openAttack(a)} aria-label="Angriffswurf {a.name}">
            <Dices size={14} /> {formatMod(attackToHit(c, a))}
          </button>
          {#if damageDice(a)}
            <button class="btn btn-sm btn-ghost mono" onclick={() => ctx.rollDamage(`${a.name} – Schaden`, damageDice(a), { damageType: a.damageType })}>
              Schaden
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .head { margin-bottom: 0.6rem; }
  h3 { margin: 0; display: inline-flex; align-items: center; gap: 0.4rem; }
  .attacks { display: flex; flex-direction: column; gap: 0.4rem; }
  .attack {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .hit { font-weight: 800; min-width: 4.4rem; }
  .edit-attack { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.7rem; border: 1px dashed var(--border); border-radius: var(--radius-sm); }
  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.45rem; }
  .fields label { display: flex; flex-direction: column; gap: 0.15rem; }
  .prop {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .prop[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }
  .accent { color: var(--accent-text); }
</style>
