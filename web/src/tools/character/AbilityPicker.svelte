<script lang="ts">
  import { ABILITY_SHORT, abilityMod, formatMod } from "../../lib/dnd";
  import { abilityChoices, damageAddLabel, pickedAbility, type AbilityPicks, type Feature } from "../../lib/features";
  import { sheet } from "./context";

  /** Attributwahl für Zuschläge mit mehreren Attributen, mit aktuellem Modifikator je Attribut */
  let { feature, picks = $bindable({}), disabled = false }: { feature: Feature; picks?: AbilityPicks; disabled?: boolean } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);
  const choices = $derived(abilityChoices(feature));
</script>

{#each choices as { add, index } (index)}
  {@const current = pickedAbility(c, add, picks[index])}
  <div class="pick">
    <span class="tiny muted">{damageAddLabel(add)}:</span>
    <div class="segmented" role="group" aria-label="Attribut für {feature.name || 'Fähigkeit'}">
      {#each add.abilities as ab (ab)}
        <button type="button" aria-pressed={current === ab} {disabled} onclick={() => (picks = { ...picks, [index]: ab })}>
          {ABILITY_SHORT[ab]} <span class="mono">{formatMod(abilityMod(c.abilities[ab]))}</span>
        </button>
      {/each}
    </div>
  </div>
{/each}

<style>
  .pick { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-top: 0.3rem; }
  .segmented button { display: inline-flex; align-items: center; gap: 0.3rem; }
</style>
