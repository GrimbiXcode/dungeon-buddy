<script lang="ts">
  import { unitSystem } from "../../lib/session.svelte";
  import { convertText } from "../../lib/units";
  import { Check, ChevronDown, Plus } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import Modal from "../../components/Modal.svelte";
  import { SPELL_LEVEL_NAMES } from "../../lib/dnd";
  import type { Ruleset, Spell, SrdSpell, SrdSpellList } from "../../lib/types";
  import { className, loadSrd, saveLabel, schoolName } from "./spells";

  let {
    ruleset,
    spells,
    characterId,
    targetLabel,
    onadd,
    onclose,
  }: {
    ruleset: Ruleset;
    spells: Spell[];
    characterId: string | null;
    targetLabel: string;
    onadd: (spell: SrdSpell) => Promise<void>;
    onclose: () => void;
  } = $props();

  const PAGE = 60;

  let list = $state<SrdSpellList | null>(null);
  let error = $state<string | null>(null);
  let query = $state("");
  let level = $state("");
  let klass = $state("");
  let limit = $state(PAGE);
  let open = $state<string | null>(null);
  let busy = $state<Record<string, boolean>>({});

  $effect(() => {
    let alive = true;
    loadSrd(ruleset)
      .then(l => alive && (list = l))
      .catch(e => alive && (error = (e as Error).message));
    return () => {
      alive = false;
    };
  });

  const classes = $derived(
    [...new Set((list?.spells ?? []).flatMap(s => s.classes))].sort((a, b) => className(a).localeCompare(className(b), "de"))
  );

  const results = $derived.by(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    return list.spells.filter(
      s =>
        (!q || s.name.toLowerCase().includes(q)) &&
        (level === "" || s.level === Number(level)) &&
        (!klass || s.classes.includes(klass))
    );
  });

  const added = $derived(new Set(spells.filter(s => s.srdKey && s.characterId === characterId).map(s => s.srdKey!)));

  // Bei neuen Filtern wieder mit der ersten Seite beginnen
  $effect(() => {
    void query;
    void level;
    void klass;
    limit = PAGE;
  });

  async function add(s: SrdSpell) {
    busy[s.key] = true;
    try {
      await onadd(s);
    } finally {
      busy[s.key] = false;
    }
  }
</script>

<Modal title="Zauber aus dem SRD" {onclose} size="lg">
  <p class="small muted target">Hinzufügen zu: <strong>{targetLabel}</strong></p>
  <div class="filters">
    <label class="search">
      <span class="sr-only">Zaubername suchen</span>
      <Icon name="search" size={16} />
      <input class="input" type="search" placeholder="Name suchen …" bind:value={query} />
    </label>
    <label>
      <span class="sr-only">Grad</span>
      <select class="select" bind:value={level}>
        <option value="">Alle Grade</option>
        {#each SPELL_LEVEL_NAMES as name, i (i)}
          <option value={String(i)}>{name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="sr-only">Klasse</span>
      <select class="select" bind:value={klass}>
        <option value="">Alle Klassen</option>
        {#each classes as c (c)}
          <option value={c}>{className(c)}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if error}
    <p class="empty">{error}</p>
  {:else if !list}
    <div class="loading"><div class="spinner"></div></div>
  {:else}
    <p class="tiny faint count">{results.length} Zauber</p>
    {#if !results.length}
      <p class="empty">Keine Zauber gefunden.</p>
    {/if}
    <ul class="results">
      {#each results.slice(0, limit) as s (s.key)}
        {@const isAdded = added.has(s.key)}
        <li class:open={open === s.key}>
          <div class="item">
            <button class="info" aria-expanded={open === s.key} onclick={() => (open = open === s.key ? null : s.key)}>
              <span class="text">
              <span class="name-line">
                <span class="name">{s.name}</span>
                {#if s.concentration}<span class="tag" title="Konzentration">K</span>{/if}
                {#if s.ritual}<span class="tag" title="Ritual">R</span>{/if}
              </span>
              <span class="small muted">
                {s.level === 0 ? "Zaubertrick" : `Grad ${s.level}`} · {schoolName(s.school)}
                {#if s.save}· {saveLabel(s.save)}{/if}
                {#if s.attack}· Zauberangriff{/if}
              </span>
              </span>
              <ChevronDown size={16} class="chev" />
            </button>
            {#if isAdded}
              <span class="badge badge-accent added"><Check size={13} /> Im Buch</span>
            {:else}
              <button class="btn btn-sm btn-primary" disabled={busy[s.key]} onclick={() => add(s)}>
                <Plus size={14} /> Hinzufügen
              </button>
            {/if}
          </div>
          {#if open === s.key}
            <div class="desc">
              <p class="small muted">
                {s.castingTime} · {convertText(s.range, unitSystem())} · {convertText(s.components, unitSystem())} · {s.duration}<br />
                {s.classes.map(className).join(", ")}
              </p>
              <Markdown source={convertText(s.description, unitSystem())} />
              {#if s.higherLevel}
                <h4>Auf höheren Graden</h4>
                <Markdown source={convertText(s.higherLevel, unitSystem())} />
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if results.length > limit}
      <div class="more">
        <button class="btn" onclick={() => (limit += PAGE)}>Mehr anzeigen ({results.length - limit} weitere)</button>
      </div>
    {/if}
    <p class="tiny faint license">{list.source}: {list.license}</p>
  {/if}
</Modal>

<style>
  .target { margin: -0.2rem 0 0.6rem; }
  .filters {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%); color: var(--faint); }
  .search .input { padding-left: 2.1rem; }
  @media (max-width: 600px) {
    .filters { grid-template-columns: 1fr 1fr; }
    .search { grid-column: 1 / -1; }
  }
  .loading { display: grid; place-items: center; padding: 2rem; }
  .count { margin: 0 0 0.3rem; }
  .results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  li { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
  li.open { border-color: color-mix(in oklab, var(--accent) 45%, var(--border)); }
  .item { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem 0.35rem 0.7rem; }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    background: none;
    text-align: left;
    padding: 0.1rem 0;
    cursor: pointer;
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
  .name-line { display: flex; align-items: center; gap: 0.35rem; max-width: 100%; }
  .name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--accent-soft);
    color: var(--accent-text);
    cursor: help;
  }
  .item :global(.chev) { color: var(--faint); flex: none; transition: transform 0.15s; }
  li.open .item :global(.chev) { transform: rotate(180deg); }
  .added { flex: none; padding: 0.2rem 0.55rem; }
  .desc { padding: 0.2rem 0.8rem 0.8rem; font-size: 0.92rem; border-top: 1px solid var(--border); }
  .desc > p:first-child { margin-top: 0.5rem; }
  .desc h4 { margin-top: 0.7rem; }
  .more { display: flex; justify-content: center; margin-top: 0.7rem; }
  .license { margin: 1rem 0 0; line-height: 1.4; }
  .empty { margin: 0.5rem 0; padding: 1.5rem 1rem; }
</style>
