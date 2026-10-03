<script lang="ts">
  import { onMount } from "svelte";
  import { Link2, List, Network as NetworkIcon, Plus, X } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import { campaignApi, get } from "../lib/api";
  import { attachmentUrl } from "../lib/markdown";
  import { route } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { toastError } from "../lib/toast.svelte";
  import type { Campaign, Npc, NpcRelation, NpcStatus } from "../lib/types";
  import AttitudePill from "./network/AttitudePill.svelte";
  import NetworkGraph from "./network/NetworkGraph.svelte";
  import NpcDetail from "./network/NpcDetail.svelte";
  import NpcEditor from "./network/NpcEditor.svelte";
  import { ATTITUDES, STATUSES, attitudeColor, initials, statusLabel } from "./network/attitude";

  let { campaign }: { campaign: Campaign } = $props();

  const VIEW_KEY = "dungeon-buddy:network-view";

  let npcs = $state<Npc[]>([]);
  let relations = $state<NpcRelation[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let view = $state<"list" | "graph">(readView());

  let query = $state("");
  let factionFilter = $state("");
  let locationFilter = $state("");
  let attitudeFilter = $state("");
  let statusFilter = $state("");

  let detailId = $state<string | null>(null);
  /** undefined = zu, null = neu, Npc = bearbeiten */
  let editing = $state<Npc | null | undefined>(undefined);
  /** nach dem Bearbeiten wieder zur Detailansicht zurück */
  let returnToDetail = false;

  function readView(): "list" | "graph" {
    try {
      return localStorage.getItem(VIEW_KEY) === "graph" ? "graph" : "list";
    } catch {
      return "list";
    }
  }

  function setView(v: "list" | "graph") {
    view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* Speicher nicht verfügbar */
    }
  }

  onMount(() => {
    void load();
  });

  async function load() {
    loading = true;
    loadError = null;
    try {
      const [n, r] = await Promise.all([
        get<Npc[]>(campaignApi(campaign.id, "npcs")),
        get<NpcRelation[]>(campaignApi(campaign.id, "relations")),
      ]);
      npcs = n;
      relations = r;
      const wanted = new URLSearchParams(route.search).get("npc");
      if (wanted && n.some(x => x.id === wanted)) detailId = wanted;
    } catch (e) {
      loadError = (e as Error).message;
      toastError(e);
    } finally {
      loading = false;
    }
  }

  // ── Abgeleitete Daten ──────────────────────────────────────────────
  const collator = new Intl.Collator("de", { sensitivity: "base" });
  const uniqueSorted = (values: string[]) =>
    [...new Set(values.map(v => v.trim()).filter(Boolean))].sort(collator.compare);

  const factions = $derived(uniqueSorted(npcs.map(n => n.faction)));
  const locations = $derived(uniqueSorted(npcs.map(n => n.location)));
  const allTags = $derived(uniqueSorted(npcs.flatMap(n => n.tags)));
  const usedStatuses = $derived(STATUSES.filter(s => npcs.some(n => n.status === s.value)));
  const usedAttitudes = $derived(ATTITUDES.filter(a => npcs.some(n => n.attitude === a.value)));

  const relationCount = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of relations) {
      m.set(r.fromNpcId, (m.get(r.fromNpcId) ?? 0) + 1);
      m.set(r.toNpcId, (m.get(r.toNpcId) ?? 0) + 1);
    }
    return m;
  });

  const filtersActive = $derived(
    Boolean(query.trim() || factionFilter || locationFilter || attitudeFilter || statusFilter)
  );

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return npcs.filter(n => {
      if (factionFilter && n.faction.trim() !== factionFilter) return false;
      if (locationFilter && n.location.trim() !== locationFilter) return false;
      if (attitudeFilter !== "" && n.attitude !== Number(attitudeFilter)) return false;
      if (statusFilter && n.status !== (statusFilter as NpcStatus)) return false;
      if (!q) return true;
      const hay = [n.name, n.role, n.faction, n.location, n.description, n.relation, ...n.tags]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  });

  // Filter auf verschwundene Werte zurücksetzen (z. B. nach dem Löschen)
  $effect(() => {
    if (factionFilter && !factions.includes(factionFilter)) factionFilter = "";
    if (locationFilter && !locations.includes(locationFilter)) locationFilter = "";
  });

  function resetFilters() {
    query = "";
    factionFilter = "";
    locationFilter = "";
    attitudeFilter = "";
    statusFilter = "";
  }

  const detailNpc = $derived(detailId ? (npcs.find(n => n.id === detailId) ?? null) : null);

  // ── Aktionen ───────────────────────────────────────────────────────
  function openNew() {
    returnToDetail = false;
    editing = null;
  }

  function openEdit(npc: Npc) {
    returnToDetail = true;
    detailId = null;
    editing = npc;
  }

  function closeEditor() {
    const prev = editing;
    editing = undefined;
    if (returnToDetail && prev) detailId = prev.id;
    returnToDetail = false;
  }

  function onSaved(saved: Npc) {
    npcs = [...npcs.filter(n => n.id !== saved.id), saved].sort((a, b) => collator.compare(a.name, b.name));
    editing = undefined;
    returnToDetail = false;
    detailId = saved.id;
  }

  function onDeleted(id: string) {
    npcs = npcs.filter(n => n.id !== id);
    relations = relations.filter(r => r.fromNpcId !== id && r.toNpcId !== id);
    detailId = null;
  }

  function onRelationSaved(r: NpcRelation) {
    const i = relations.findIndex(x => x.id === r.id);
    if (i >= 0) relations[i] = r;
    else relations = [...relations, r];
  }

  function onRelationDeleted(id: string) {
    relations = relations.filter(r => r.id !== id);
  }
</script>

<div class="network">
  <div class="page-header">
    <div>
      <h1>Soziales Netzwerk</h1>
      <p class="muted">Wer ist wer – und wer steht zu wem.</p>
    </div>
    <div class="row header-actions">
      {#if npcs.length}
        <div class="segmented" role="group" aria-label="Ansicht">
          <button aria-pressed={view === "list"} onclick={() => setView("list")}><List size={15} /> Liste</button>
          <button aria-pressed={view === "graph"} onclick={() => setView("graph")}><NetworkIcon size={15} /> Netz</button>
        </div>
      {/if}
      <button class="btn btn-primary" onclick={openNew}><Plus size={16} /> NPC hinzufügen</button>
    </div>
  </div>

  {#if loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if loadError}
    <div class="empty">
      <h3>Netzwerk konnte nicht geladen werden</h3>
      <p>{loadError}</p>
      <button class="btn" onclick={load}>Erneut versuchen</button>
    </div>
  {:else if !npcs.length}
    <div class="empty">
      <div class="empty-icon"><Icon name="network" size={30} /></div>
      <h3>Noch keine NPCs</h3>
      <p>
        Halte fest, wem ihr begegnet seid: Rolle, Fraktion, wo man sie findet, wie sie zu euch stehen
        – und wie sie untereinander verbunden sind.
      </p>
      <button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Ersten NPC hinzufügen</button>
    </div>
  {:else if view === "graph"}
    <NetworkGraph {npcs} {relations} onopen={id => (detailId = id)} />
  {:else}
    <div class="filters">
      <label class="search">
        <span class="sr-only">Suchen</span>
        <Icon name="search" size={16} />
        <input class="input" type="search" bind:value={query} placeholder="Name, Rolle, Ort, Schlagwort …" />
      </label>
      <div class="selects">
        <label>
          <span class="sr-only">Fraktion</span>
          <select class="select" bind:value={factionFilter} disabled={!factions.length}>
            <option value="">Alle Fraktionen</option>
            {#each factions as f (f)}<option value={f}>{f}</option>{/each}
          </select>
        </label>
        <label>
          <span class="sr-only">Ort</span>
          <select class="select" bind:value={locationFilter} disabled={!locations.length}>
            <option value="">Alle Orte</option>
            {#each locations as l (l)}<option value={l}>{l}</option>{/each}
          </select>
        </label>
        <label>
          <span class="sr-only">Haltung</span>
          <select class="select" bind:value={attitudeFilter}>
            <option value="">Jede Haltung</option>
            {#each usedAttitudes as a (a.value)}<option value={String(a.value)}>{a.label}</option>{/each}
          </select>
        </label>
        <label>
          <span class="sr-only">Status</span>
          <select class="select" bind:value={statusFilter}>
            <option value="">Jeder Status</option>
            {#each usedStatuses as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
          </select>
        </label>
      </div>
    </div>

    <div class="row-between result-bar small muted">
      <span>
        {#if filtersActive}{filtered.length} von {npcs.length} NPCs{:else}{npcs.length} {npcs.length === 1 ? "NPC" : "NPCs"} · {relations.length} {relations.length === 1 ? "Beziehung" : "Beziehungen"}{/if}
      </span>
      {#if filtersActive}
        <button class="btn btn-ghost btn-sm" onclick={resetFilters}><X size={14} /> Filter zurücksetzen</button>
      {/if}
    </div>

    {#if filtered.length}
      <div class="cards">
        {#each filtered as n (n.id)}
          {@const rc = relationCount.get(n.id) ?? 0}
          <button class="card npc" class:dead={n.status === "dead"} style="--c:{attitudeColor(n.attitude)}" onclick={() => (detailId = n.id)}>
            <div class="npc-top">
              <span class="avatar" aria-hidden="true">
                {#if n.imageId && session.info?.attachments}<img src={attachmentUrl(n.imageId, "thumb")} alt="" loading="lazy" />{:else}{initials(n.name)}{/if}
              </span>
              <span class="grow npc-title">
                <strong class="name">{n.name}</strong>
                {#if n.role}<span class="small muted role">{n.role}</span>{/if}
              </span>
            </div>
            <div class="row pills">
              <AttitudePill value={n.attitude} />
              {#if n.status !== "alive"}
                <span class="badge" class:badge-danger={n.status === "dead"}>{statusLabel(n.status)}</span>
              {/if}
            </div>
            {#if n.faction || n.location}
              <div class="where small muted">
                {#if n.faction}<span class="iconed"><Icon name="faction" size={13} /> <span class="truncate">{n.faction}</span></span>{/if}
                {#if n.location}<span class="iconed"><Icon name="location" size={13} /> <span class="truncate">{n.location}</span></span>{/if}
              </div>
            {/if}
            {#if n.relation}
              <p class="small rel-text">{n.relation}</p>
            {/if}
            <div class="npc-foot">
              <div class="chip-row tags">
                {#each n.tags.slice(0, 4) as t (t)}<span class="badge">{t}</span>{/each}
                {#if n.tags.length > 4}<span class="badge">+{n.tags.length - 4}</span>{/if}
              </div>
              <span class="tiny faint iconed rc" title="{rc} {rc === 1 ? 'Beziehung' : 'Beziehungen'}">
                <Link2 size={13} /> {rc}
              </span>
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <h3>Keine Treffer</h3>
        <p>Kein NPC passt zu Suche und Filtern.</p>
        <button class="btn" onclick={resetFilters}>Filter zurücksetzen</button>
      </div>
    {/if}
  {/if}

  {#if detailNpc}
    <NpcDetail
      campaignId={campaign.id}
      npc={detailNpc}
      {npcs}
      {relations}
      onclose={() => (detailId = null)}
      onedit={() => openEdit(detailNpc)}
      ondelete={() => onDeleted(detailNpc.id)}
      onselect={id => (detailId = id)}
      onrelationsaved={onRelationSaved}
      onrelationdeleted={onRelationDeleted}
      onimagechange={imageId => onSaved({ ...detailNpc, imageId })}
    />
  {/if}

  {#if editing !== undefined}
    <NpcEditor
      campaignId={campaign.id}
      npc={editing}
      {factions}
      {locations}
      tagSuggestions={allTags}
      onclose={closeEditor}
      onsaved={onSaved}
    />
  {/if}
</div>

<style>
  /* Farben der Haltungsskala (hell/dunkel) – gelten auch für die Dialoge darin */
  .network {
    --att-n2: var(--danger);
    --att-n1: #fb923c;
    --att-0: #9a93a8;
    --att-p1: #a3e635;
    --att-p2: var(--success);
  }
  :global(:root[data-mode="light"]) .network {
    --att-n1: #ea580c;
    --att-0: #8a8293;
    --att-p1: #65a30d;
  }

  .header-actions { gap: 0.6rem; }
  .segmented button { display: inline-flex; align-items: center; gap: 0.35rem; }
  .loading { display: grid; place-items: center; padding: 4rem 0; }
  .empty-icon {
    display: inline-grid;
    place-items: center;
    width: 3.4rem;
    height: 3.4rem;
    margin-bottom: 0.6rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .empty p { max-width: 34rem; margin-inline: auto; }

  .filters {
    display: grid;
    grid-template-columns: minmax(220px, 1.3fr) 3fr;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
  .search .input { padding-left: 2.1rem; }
  .selects { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; }
  .selects .select { text-overflow: ellipsis; }
  .result-bar { min-height: 30px; margin-bottom: 0.7rem; }

  .cards {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  }
  .npc {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-width: 0;
    text-align: left;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    padding: 0.9rem 0.95rem 0.8rem;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .npc::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    background: var(--c);
    opacity: 0.85;
  }
  .npc:hover {
    border-color: color-mix(in oklab, var(--c) 60%, var(--border));
    transform: translateY(-1px);
    box-shadow: var(--shadow);
  }
  .npc-top { display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
  .avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .avatar {
    flex: none;
    overflow: hidden;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.85rem;
    color: color-mix(in oklab, var(--c) 70%, var(--text));
    background: color-mix(in oklab, var(--c) 16%, var(--surface));
    border: 2px solid var(--c);
  }
  .npc-title { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 1.02rem; line-height: 1.3; overflow-wrap: anywhere; }
  .role { line-height: 1.3; }
  .pills { gap: 0.4rem; }
  .where { display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem; min-width: 0; }
  .iconed { display: inline-flex; align-items: center; gap: 0.25rem; min-width: 0; max-width: 100%; }
  .iconed :global(svg) { flex: none; }
  .rel-text {
    margin: 0;
    color: var(--muted);
    font-style: italic;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .npc-foot { display: flex; align-items: flex-end; gap: 0.5rem; margin-top: auto; }
  .tags { flex: 1; min-width: 0; }
  .rc { flex: none; margin-left: auto; }
  .dead .avatar { filter: grayscale(1); border-style: dashed; opacity: 0.75; }
  .dead .name { text-decoration: line-through; text-decoration-color: var(--faint); }

  @media (max-width: 900px) {
    .filters { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .selects { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .header-actions { width: 100%; justify-content: space-between; }
  }
</style>
