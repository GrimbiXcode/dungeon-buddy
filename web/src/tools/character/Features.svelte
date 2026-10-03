<script lang="ts">
  import { Plus, X } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Modal from "../../components/Modal.svelte";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { rulesTerms } from "../../lib/dnd";
  import { FEATURE_PRESETS, buildPreset } from "../../lib/feature-presets";
  import {
    ACTIVATIONS,
    EFFECT_TYPES,
    matchesFilter,
    newFeature,
    type Activation,
    type Feature,
  } from "../../lib/features";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";
  import FeatureCard from "./FeatureCard.svelte";
  import FeatureEditor from "./FeatureEditor.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  const speciesLabel = $derived(rulesTerms(ctx.ruleset).species);

  let search = $state("");
  let categories = $state<string[]>([]);
  let tags = $state<string[]>([]);
  let effectTypes = $state<string[]>([]);
  let activation = $state<Activation | "">("");
  let editing = $state<Feature | null>(null);
  let showPresets = $state(false);

  const allCategories = $derived([...new Set(c.features.map(f => f.category))].sort((a, b) => a.localeCompare(b, "de")));
  const allTags = $derived([...new Set(c.features.flatMap(f => f.tags))].sort((a, b) => a.localeCompare(b, "de")));
  const usedEffects = $derived(EFFECT_TYPES.filter(e => c.features.some(f => f.effectType === e.key)));

  const filtered = $derived(
    c.features.filter(
      f => matchesFilter(f, { search, categories, tags, effectTypes }) && (!activation || f.activation === activation)
    )
  );
  const groups = $derived(
    [...new Set(filtered.map(f => f.category))]
      .sort((a, b) => a.localeCompare(b, "de"))
      .map(cat => ({ cat, list: filtered.filter(f => f.category === cat).sort((a, b) => a.name.localeCompare(b.name, "de")) }))
  );
  const filtering = $derived(Boolean(search || categories.length || tags.length || effectTypes.length || activation));

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter(x => x !== value) : [...list, value];
  }

  function save(f: Feature) {
    const i = c.features.findIndex(x => x.id === f.id);
    if (i >= 0) c.features[i] = f;
    else c.features.push(f);
    editing = null;
  }

  async function remove(f: Feature) {
    if (!(await confirmDialog(`„${f.name}“ aus dem Bogen entfernen?`, { title: "Fähigkeit löschen" }))) return;
    c.features = c.features.filter(x => x.id !== f.id);
    for (const x of c.features) x.links = x.links.filter(l => l.featureId !== f.id);
    c.combat.effects = c.combat.effects.filter(e => e.featureId !== f.id);
  }

  function addPreset(key: string) {
    const f = buildPreset(key, ctx.ruleset, speciesLabel, c.features);
    showPresets = false;
    editing = f;
    toast("Vorlage geladen – passe die Werte an und speichere.");
  }

  function reset() {
    search = "";
    categories = [];
    tags = [];
    effectTypes = [];
    activation = "";
  }

  const presetGroups = $derived([...new Set(FEATURE_PRESETS.map(p => p.group))]);
</script>

<section class="card">
  <div class="row-between head">
    <div>
      <h3>Fähigkeiten, Merkmale &amp; Talente</h3>
      <p class="tiny muted">
        Klassenmerkmale, {speciesLabel}, Hintergrund, Talente, Ausrüstung … mit Einsatz, Wirkung, Dauer und Nutzungen. Der
        Kampf-Assistent schlägt sie passend vor.
      </p>
    </div>
    <div class="row">
      <button class="btn btn-sm" onclick={() => (showPresets = true)}><Icon name="library" size={14} /> Aus Vorlage</button>
      <button class="btn btn-sm" onclick={() => ctx.openLibrary("feature")}><Icon name="library" size={14} /> Aus Bibliothek</button>
      <button class="btn btn-sm btn-primary" onclick={() => (editing = newFeature({ category: categories[0] ?? "Klasse" }))}>
        <Plus size={14} /> Neue Fähigkeit
      </button>
    </div>
  </div>

  {#if c.features.length}
    <div class="filters">
      <div class="search">
        <Icon name="search" size={15} />
        <input class="input input-sm" placeholder="Suchen …" bind:value={search} aria-label="Fähigkeiten durchsuchen" />
      </div>
      <select class="select input-sm act" bind:value={activation} aria-label="Aktionsart">
        <option value="">Alle Aktionsarten</option>
        {#each ACTIVATIONS as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
      </select>
      {#if filtering}<button class="btn btn-sm btn-ghost" onclick={reset}><X size={14} /> Filter zurücksetzen</button>{/if}
    </div>
    <div class="chip-row chips">
      {#each allCategories as cat (cat)}
        <button class="chip" aria-pressed={categories.includes(cat)} onclick={() => (categories = toggle(categories, cat))}>{cat}</button>
      {/each}
      {#each usedEffects as e (e.key)}
        <button class="chip effect" aria-pressed={effectTypes.includes(e.key)} onclick={() => (effectTypes = toggle(effectTypes, e.key))}>{e.label}</button>
      {/each}
      {#each allTags as t (t)}
        <button class="chip tag" aria-pressed={tags.includes(t)} onclick={() => (tags = toggle(tags, t))}>#{t}</button>
      {/each}
    </div>
  {/if}

  {#if c.features.length === 0}
    <div class="empty">
      <p>Noch keine Fähigkeiten erfasst.</p>
      <div class="row center-row">
        <button class="btn" onclick={() => (showPresets = true)}><Icon name="library" size={15} /> Vorlage wählen</button>
        <button class="btn btn-primary" onclick={() => (editing = newFeature())}><Plus size={15} /> Selbst anlegen</button>
      </div>
    </div>
  {:else if groups.length === 0}
    <p class="muted small">Keine Fähigkeit passt zu den Filtern.</p>
  {:else}
    {#each groups as g (g.cat)}
      <div class="group">
        <h4 class="label">{g.cat} <span class="faint">({g.list.length})</span></h4>
        <div class="list">
          {#each g.list as f (f.id)}
            <FeatureCard feature={f} compact onedit={() => (editing = f)} ondelete={() => remove(f)} onlibrary={() => ctx.addToLibrary("feature", f)} />
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</section>

{#if editing}
  <FeatureEditor feature={editing} onsave={save} onclose={() => (editing = null)} />
{/if}

{#if showPresets}
  <Modal title="Vorlage wählen" onclose={() => (showPresets = false)}>
    <p class="small muted">
      Häufige Fähigkeiten als Startpunkt ({ctx.ruleset === "2024" ? "5e 2024" : "5e 2014"}). Alles lässt sich danach anpassen.
    </p>
    {#each presetGroups as group (group)}
      <h4 class="label preset-group">{group}</h4>
      <div class="presets">
        {#each FEATURE_PRESETS.filter(p => p.group === group) as p (p.key)}
          {@const f = p.build(ctx.ruleset)}
          <button class="preset" onclick={() => addPreset(p.key)}>
            <strong>{f.name}</strong>
            <span class="tiny muted">{f.benefit}</span>
          </button>
        {/each}
      </div>
    {/each}
  </Modal>
{/if}

<style>
  .head { align-items: flex-start; margin-bottom: 0.8rem; }
  h3 { margin: 0 0 0.2rem; }
  .head p { margin: 0; max-width: 38rem; }
  .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .search { position: relative; flex: 1; min-width: 12rem; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 0.55rem; color: var(--faint); }
  .search input { padding-left: 1.9rem; }
  .act { width: auto; }
  .chips { margin-bottom: 0.9rem; }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip.effect { border-style: dashed; }
  .chip.tag { background: transparent; }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .group { margin-bottom: 1rem; }
  .group h4 { margin-bottom: 0.4rem; }
  .list { display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
  .empty { padding: 1.5rem 1rem; }
  .center-row { justify-content: center; }
  .preset-group { margin: 0.9rem 0 0.4rem; }
  .presets { display: grid; gap: 0.4rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .preset {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .preset:hover { border-color: var(--accent); }
</style>
