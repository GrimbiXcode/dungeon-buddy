<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { Check, ChevronDown, Link2, Play, Trash2 } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import { formatDice } from "../../lib/dice";
  import {
    AC_MODES,
    confirmLinkSuccess,
    dependentFeatures,
    describeRollMods,
    economySpent,
    featureDamageExpr,
    isAvailable,
    label,
    linkedFeatures,
    usesLeft,
    type Feature,
  } from "../../lib/features";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";

  let {
    feature,
    onedit,
    ondelete,
    onlibrary,
    compact = false,
  }: { feature: Feature; onedit?: () => void; ondelete?: () => void; onlibrary?: () => void; compact?: boolean } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);
  let open = $state(false);

  const left = $derived(usesLeft(c, feature));
  const available = $derived(isAvailable(c, feature));
  const spent = $derived(economySpent(c, feature.activation));
  const resource = $derived(feature.resourceId ? c.resources.find(r => r.id === feature.resourceId) : null);
  const activeEffect = $derived(c.combat.effects.find(e => e.featureId === feature.id));
  const dice = $derived(featureDamageExpr(c, feature));
  const links = $derived(linkedFeatures(c, feature));
  const dependents = $derived(dependentFeatures(c, feature));
  const mods = $derived(describeRollMods(feature.rollMods));

  function confirmSuccess(other: Feature) {
    confirmLinkSuccess(c, feature, other.id);
    toast(`${other.name}: Nutzung verbraucht.`, "success");
  }

  function togglePip(i: number) {
    const max = feature.uses.max ?? 0;
    const remaining = max - feature.uses.used;
    feature.uses.used = i < remaining ? max - i : max - i - 1;
  }
</script>

<article class="feature" class:unavailable={!available} class:compact>
  <div class="top">
    <button class="name-btn grow" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="name">{feature.name || "Ohne Namen"}</span>
      {#if activeEffect}<span class="badge badge-accent">aktiv</span>{/if}
      <ChevronDown size={14} class="chev {open ? 'open' : ''}" />
    </button>
    {#if feature.activation !== "passive"}
      <button
        class="btn btn-sm use"
        disabled={!available}
        title={spent ? `${label.activation(feature.activation)} in dieser Runde schon verbraucht` : undefined}
        onclick={() => ctx.useFeature(feature)}
      >
        <Play size={13} /> Einsetzen
      </button>
    {/if}
  </div>

  <div class="chip-row meta">
    <span class="badge act-{feature.activation}">{label.activation(feature.activation)}</span>
    <span class="badge">{label.effect(feature.effectType)}</span>
    {#each compact ? feature.categories.slice(1) : feature.categories as cat (cat)}<span class="badge">{cat}</span>{/each}
    {#if feature.target !== "self" || feature.targetText}<span class="badge">{convertText(feature.targetText, unitSystem()) || label.target(feature.target)}</span>{/if}
    {#if feature.duration.kind !== "instant"}<span class="badge">{label.duration(feature)}</span>{/if}
    {#if dice}<span class="badge mono">{formatDice(dice)}{feature.damageType ? ` ${feature.damageType}` : ""}</span>{/if}
    {#each feature.tags as t (t)}<span class="badge tag">#{t}</span>{/each}
  </div>

  {#if feature.benefit}<p class="benefit small">{convertText(feature.benefit, unitSystem())}</p>{/if}
  {#if feature.condition}<p class="condition tiny muted">Bedingung: {convertText(feature.condition, unitSystem())}</p>{/if}

  {#if links.length}
    <div class="links">
      {#each links as { link, feature: other } (other.id)}
        {@const otherLeft = usesLeft(c, other)}
        <div class="link small">
          <Link2 size={13} />
          <span class="grow">
            {link.cost}× <strong>{other.name}</strong> {link.when === "success" ? "wenn es gelingt" : "beim Einsetzen"}
            {#if otherLeft != null}<span class="muted">({otherLeft} übrig)</span>{/if}
          </span>
          {#if link.when === "success"}
            <button class="btn btn-sm" disabled={otherLeft != null && otherLeft < link.cost} onclick={() => confirmSuccess(other)} title="Nach einem gelungenen Einsatz">
              <Check size={13} /> Gelungen
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if feature.uses.max != null || resource}
    <div class="uses small">
      {#if feature.uses.max != null && feature.uses.max <= 12}
        <span class="pips">
          {#each Array.from({ length: feature.uses.max }, (_, i) => i) as i (i)}
            <button class="pip" class:on={i < feature.uses.max - feature.uses.used} aria-label="Nutzung {i + 1}" onclick={() => togglePip(i)}></button>
          {/each}
        </span>
      {/if}
      <span class="muted">
        {#if left != null}{left} übrig{/if}
        {#if feature.uses.max != null} · {label.reset(feature.uses.reset)}{/if}
        {#if resource} · kostet {feature.resourceCost} {resource.name} ({resource.max - resource.used} übrig){/if}
      </span>
    </div>
  {/if}

  {#if open}
    <div class="details small">
      {#if feature.save}<p><strong>Rettungswurf:</strong> {feature.save}</p>{/if}
      {#if feature.triggers.length}<p><strong>Auslöser:</strong> {feature.triggers.map(label.trigger).join(", ")}</p>{/if}
      {#if feature.appliesTo.scope !== "none"}
        <p>
          <strong>Angriffe:</strong>
          {feature.appliesTo.scope === "specific"
            ? c.attacks.filter(a => feature.appliesTo.attackIds.includes(a.id)).map(a => a.name).join(", ") || "keine Waffe gewählt"
            : { all: "alle", melee: "Nahkampf", ranged: "Fernkampf", weapon: "alle Waffen", spell: "Zauberangriffe" }[feature.appliesTo.scope]}
        </p>
      {/if}
      {#if mods}<p><strong>Würfe:</strong> {mods}</p>{/if}
      {#if feature.acMod.mode !== "none"}
        <p><strong>RK:</strong> {AC_MODES.find(m => m.key === feature.acMod.mode)?.label} {feature.acMod.value}</p>
      {/if}
      {#if dependents.length}<p><strong>Wird verwendet von:</strong> {dependents.map(d => d.name).join(", ")}</p>{/if}
      {#if feature.description}<Markdown source={convertText(feature.description, unitSystem())} />{/if}
      {#if onedit || ondelete || onlibrary}
        <div class="row actions">
          {#if onedit}<button class="btn btn-sm" onclick={onedit}><Icon name="edit" size={13} /> Bearbeiten</button>{/if}
          {#if onlibrary}<button class="btn btn-sm" onclick={onlibrary}><Icon name="library" size={13} /> In Bibliothek</button>{/if}
          {#if ondelete}<button class="btn btn-sm btn-danger" onclick={ondelete}><Trash2 size={13} /> Löschen</button>{/if}
        </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .feature {
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .feature.unavailable { opacity: 0.6; }
  .top { display: flex; align-items: center; gap: 0.5rem; }
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
  .use { flex: none; }
  .meta { gap: 0.25rem; }
  .meta .badge { font-size: 0.7rem; }
  .act-action { color: var(--accent-text); border-color: var(--accent); }
  .act-bonus { color: var(--warning); border-color: color-mix(in oklab, var(--warning) 50%, transparent); }
  .act-reaction { color: var(--success); border-color: color-mix(in oklab, var(--success) 50%, transparent); }
  .tag { background: transparent; }
  .benefit, .condition { margin: 0; }
  .uses { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .pips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .pip { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--faint); background: transparent; cursor: pointer; padding: 0; }
  .pip.on { background: var(--accent); border-color: var(--accent); }
  .links { display: flex; flex-direction: column; gap: 0.25rem; }
  .link { display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.4rem; border-radius: var(--radius-sm); background: var(--bg); border: 1px dashed var(--border); }
  .details { border-top: 1px dashed var(--border); padding-top: 0.45rem; }
  .details p { margin: 0 0 0.35rem; }
  .actions { margin-top: 0.4rem; }
</style>
