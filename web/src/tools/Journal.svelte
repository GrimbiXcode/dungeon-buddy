<script lang="ts">
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarPlus, Plus, ScrollText, Search, X } from "@lucide/svelte";
  import { campaignApi, del, get, patch, post } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { formatDate, todayIso, uid } from "../lib/format";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign, JournalEntry } from "../lib/types";
  import EntryCard from "./journal/EntryCard.svelte";
  import EntryEditor from "./journal/EntryEditor.svelte";
  import { groupEntries, matchesQuery, maxOf, normalizeEntry, plural, type EntryDraft, type JournalView } from "./journal/journal";

  let { campaign }: { campaign: Campaign } = $props();

  const VIEW_KEY = "dungeon-buddy:journal:view";
  const ORDER_KEY = "dungeon-buddy:journal:newest-first";

  let entries = $state<JournalEntry[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let query = $state("");
  let view = $state<JournalView>(readStored(VIEW_KEY) === "day" ? "day" : "session");
  let newestFirst = $state(readStored(ORDER_KEY) !== "false");
  let highlightId = $state<string | null>(null);
  let searchInput: HTMLInputElement | undefined = $state();
  const pending = new SvelteSet<string>();

  type EditorState = { heading: string; initial: EntryDraft; baseline?: EntryDraft; entry: JournalEntry | null };
  let editor = $state<EditorState | null>(null);

  const api = $derived(campaignApi(campaign.id, "journal"));

  const filtered = $derived(entries.filter(e => matchesQuery(e, query)));
  const groups = $derived(groupEntries(filtered, view, newestFirst));

  const sessionCount = $derived(new Set(entries.map(e => e.sessionNumber).filter(n => n != null)).size);
  const maxSession = $derived(maxOf(entries.map(e => e.sessionNumber)));
  const maxDay = $derived(maxOf(entries.map(e => e.ingameDay)));
  const stats = $derived(
    [
      plural(entries.length, "Eintrag", "Einträge"),
      sessionCount ? plural(sessionCount, "Session", "Sessions") : "",
      maxDay != null ? `Spieltag ${maxDay}` : "",
    ]
      .filter(Boolean)
      .join(" · ")
  );

  // Neu laden, wenn die Kampagne wechselt
  $effect(() => {
    void load(campaign.id);
  });

  function readStored(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function store(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* z. B. privater Modus */
    }
  }

  async function load(campaignId: string) {
    loading = true;
    loadError = null;
    try {
      const list = await get<JournalEntry[]>(campaignApi(campaignId, "journal"));
      if (campaignId === campaign.id) entries = list.map(normalizeEntry);
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function setView(v: JournalView) {
    view = v;
    store(VIEW_KEY, v);
  }

  function toggleOrder() {
    newestFirst = !newestFirst;
    store(ORDER_KEY, String(newestFirst));
  }

  /** Zuletzt erstellter Eintrag – Grundlage für Vorbelegungen */
  function latestEntry() {
    let latest: JournalEntry | null = null;
    for (const e of entries) if (!latest || e.createdAt > latest.createdAt) latest = e;
    return latest;
  }

  /** Bezeichnung des Spieltags (z. B. "3. Mirtul"), falls schon einmal erfasst */
  function labelForDay(day: number | null) {
    if (day == null) return "";
    const withLabel = entries
      .filter(e => e.ingameDay === day && e.ingameDate.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return withLabel[0]?.ingameDate ?? "";
  }

  function openNewEntry() {
    const latest = latestEntry();
    const ingameDay = latest?.ingameDay ?? null;
    editor = {
      heading: "Neuer Eintrag",
      entry: null,
      initial: {
        sessionNumber: latest ? latest.sessionNumber : 1,
        sessionDate: todayIso(),
        ingameDay,
        ingameDate: latest?.ingameDate || labelForDay(ingameDay),
        title: "",
        content: "",
      },
    };
  }

  function openNewSession() {
    const sessionNumber = (maxSession ?? 0) + 1;
    editor = {
      heading: "Neue Session",
      entry: null,
      initial: {
        sessionNumber,
        sessionDate: todayIso(),
        ingameDay: maxDay,
        ingameDate: labelForDay(maxDay),
        title: "",
        content: "",
      },
    };
  }

  function openEdit(entry: JournalEntry) {
    editor = {
      heading: "Eintrag bearbeiten",
      entry,
      initial: {
        sessionNumber: entry.sessionNumber,
        sessionDate: entry.sessionDate,
        ingameDay: entry.ingameDay,
        ingameDate: entry.ingameDate,
        title: entry.title,
        content: entry.content,
      },
    };
  }

  function replaceEntry(id: string, next: JournalEntry) {
    const i = entries.findIndex(e => e.id === id);
    if (i >= 0) entries[i] = next;
  }

  async function flash(id: string) {
    highlightId = id;
    await tick();
    document.getElementById(`entry-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setTimeout(() => {
      if (highlightId === id) highlightId = null;
    }, 1800);
  }

  /** Optimistisch speichern: Liste sofort aktualisieren, bei Fehler zurückrollen und Editor wieder öffnen. */
  async function save(draft: EntryDraft) {
    const current = editor;
    if (!current) return;
    editor = null;
    const original = current.entry;

    if (original) {
      replaceEntry(original.id, { ...original, ...draft });
      pending.add(original.id);
      try {
        const saved = await patch<JournalEntry>(`${api}/${original.id}`, draft);
        replaceEntry(original.id, normalizeEntry(saved));
        void flash(saved.id);
      } catch (e) {
        replaceEntry(original.id, original);
        toastError(e);
        editor = { ...current, initial: draft, baseline: current.baseline ?? current.initial };
      } finally {
        pending.delete(original.id);
      }
      return;
    }

    const now = new Date().toISOString();
    const tempId = `tmp-${uid()}`;
    const temp: JournalEntry = { id: tempId, campaignId: campaign.id, createdAt: now, updatedAt: now, ...draft };
    if (!matchesQuery(temp, query)) query = "";
    entries = [temp, ...entries];
    pending.add(tempId);
    void flash(tempId);
    try {
      const saved = await post<JournalEntry>(api, draft);
      replaceEntry(tempId, normalizeEntry(saved));
      if (highlightId === tempId) highlightId = saved.id;
    } catch (e) {
      entries = entries.filter(x => x.id !== tempId);
      toastError(e);
      editor = { ...current, initial: draft, baseline: current.baseline ?? current.initial };
    } finally {
      pending.delete(tempId);
    }
  }

  async function remove(entry: JournalEntry) {
    const name = entry.title.trim() ? `„${entry.title.trim()}“` : "diesen Eintrag";
    const ok = await confirmDialog(`Möchtest du ${name} wirklich löschen?`, { title: "Eintrag löschen" });
    if (!ok) return;
    entries = entries.filter(e => e.id !== entry.id);
    try {
      await del(`${api}/${entry.id}`);
      toast("Eintrag gelöscht.", "success", 2500);
    } catch (e) {
      entries = [...entries, entry];
      toastError(e);
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== "/" || editor || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    searchInput?.focus();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="page-header">
  <div>
    <h1>Tagebuch</h1>
    <p class="muted">
      {#if loading}
        Wird geladen …
      {:else if entries.length}
        {stats}
      {:else}
        Was in euren Sessions passiert ist.
      {/if}
    </p>
  </div>
  <div class="row header-actions">
    <button class="btn" onclick={openNewSession} disabled={loading}><CalendarPlus size={16} /> Neue Session</button>
    <button class="btn btn-primary" onclick={openNewEntry} disabled={loading}><Plus size={16} /> Neuer Eintrag</button>
  </div>
</div>

{#if loading}
  <div class="loading"><div class="spinner"></div></div>
{:else if loadError}
  <div class="empty">
    <h3>Tagebuch konnte nicht geladen werden</h3>
    <p>{loadError}</p>
    <button class="btn" onclick={() => load(campaign.id)}>Erneut versuchen</button>
  </div>
{:else if entries.length === 0}
  <div class="empty intro">
    <span class="intro-icon"><ScrollText size={28} /></span>
    <h3>Noch keine Einträge</h3>
    <p>
      Halte nach jeder Spielsitzung fest, was passiert ist: Begegnungen, Hinweise, Beute, offene Fragen.
      Ordne Einträge einer <strong>Session</strong> und einem <strong>Tag im Spiel</strong> zu – so findest du
      später alles nach Sitzung oder als Zeitleiste der Spielwelt wieder.
    </p>
    <div class="row intro-actions">
      <button class="btn btn-primary" onclick={openNewSession}><Plus size={16} /> Erste Session festhalten</button>
    </div>
  </div>
{:else}
  <div class="toolbar">
    <label class="search">
      <span class="sr-only">Tagebuch durchsuchen</span>
      <Search size={16} />
      <input
        class="input"
        type="search"
        placeholder="Suchen in Titel, Text, Datum …"
        bind:value={query}
        bind:this={searchInput}
      />
      {#if query}
        <button class="btn btn-ghost btn-sm btn-icon clear" onclick={() => (query = "")} aria-label="Suche leeren">
          <X size={15} />
        </button>
      {/if}
    </label>
    <div class="row toolbar-right">
      <div class="segmented" role="group" aria-label="Gruppierung">
        <button aria-pressed={view === "session"} onclick={() => setView("session")}>Nach Session</button>
        <button aria-pressed={view === "day"} onclick={() => setView("day")}>Nach Spieltag</button>
      </div>
      <button
        class="btn btn-icon"
        onclick={toggleOrder}
        aria-label={newestFirst ? "Neueste zuerst – umschalten auf älteste zuerst" : "Älteste zuerst – umschalten auf neueste zuerst"}
        title={newestFirst ? "Neueste zuerst" : "Älteste zuerst"}
      >
        {#if newestFirst}<ArrowDownWideNarrow size={17} />{:else}<ArrowUpNarrowWide size={17} />{/if}
      </button>
    </div>
  </div>

  {#if query.trim()}
    <p class="small muted results" aria-live="polite">
      {plural(filtered.length, "Treffer", "Treffer")} für „{query.trim()}“
    </p>
  {/if}

  {#if filtered.length === 0}
    <div class="empty">
      <h3>Nichts gefunden</h3>
      <p>Kein Eintrag enthält „{query.trim()}“.</p>
      <button class="btn" onclick={() => (query = "")}>Suche zurücksetzen</button>
    </div>
  {:else}
    <div class="groups" class:timeline={view === "day"}>
      {#each groups as group (group.key)}
        <section class="group" aria-label={group.title}>
          <header class="group-head">
            <span class="dot" aria-hidden="true"></span>
            <h2>{group.title}</h2>
            {#if group.subtitle}<span class="muted subtitle">· {group.subtitle}</span>{/if}
            <span class="badge count">{group.entries.length}</span>
          </header>
          <div class="stack">
            {#each group.entries as entry (entry.id)}
              <div id="entry-{entry.id}" class="entry-wrap">
                <EntryCard
                  {entry}
                  {view}
                  pending={pending.has(entry.id)}
                  highlight={highlightId === entry.id}
                  onedit={() => openEdit(entry)}
                  ondelete={() => remove(entry)}
                />
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
{/if}

{#if editor}
  <EntryEditor title={editor.heading} initial={editor.initial} baseline={editor.baseline} onsave={save} onclose={() => (editor = null)} />
{/if}

<style>
  .header-actions { gap: 0.5rem; }
  .loading { display: grid; place-items: center; padding: 3rem 0; }

  .intro { padding: 2.5rem 1.25rem; }
  .intro p { max-width: 34rem; margin: 0 auto 1.2rem; }
  .intro-icon {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    margin-bottom: 0.8rem;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .intro-actions { justify-content: center; }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 0.75rem;
    align-items: center;
    margin-bottom: 1.25rem;
  }
  .search {
    position: relative;
    flex: 1 1 260px;
    display: flex;
    align-items: center;
    color: var(--faint);
  }
  .search > :global(svg) { position: absolute; left: 0.7rem; pointer-events: none; }
  .search .input { padding-left: 2.2rem; padding-right: 2.2rem; }
  .search .input::-webkit-search-cancel-button { display: none; }
  .search .clear { position: absolute; right: 0.25rem; color: var(--muted); }
  .toolbar-right { gap: 0.5rem; flex-wrap: nowrap; }
  .results { margin: -0.5rem 0 1rem; }

  .groups { display: flex; flex-direction: column; gap: 1.75rem; }
  .group-head {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    margin-bottom: 0.7rem;
    min-width: 0;
  }
  .group-head h2 { margin: 0; font-size: 1.15rem; white-space: nowrap; }
  .subtitle { font-size: 0.88rem; min-width: 0; overflow-wrap: anywhere; }
  .count { margin-left: auto; align-self: center; }
  .dot { display: none; }

  /* Zeitleiste in der Spieltag-Ansicht */
  .timeline .group {
    position: relative;
    padding-left: 1.5rem;
  }
  .timeline .group::before {
    content: "";
    position: absolute;
    left: 0.34rem;
    top: 0.9rem;
    bottom: -1.75rem;
    width: 2px;
    background: var(--border);
  }
  .timeline .group:last-child::before { bottom: 0; }
  .timeline .dot {
    display: block;
    position: absolute;
    left: 0;
    top: 0.32rem;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--accent-strong);
    box-shadow: 0 0 0 4px var(--bg);
  }

  .entry-wrap { scroll-margin: 5rem 0 6rem; }

  @media (max-width: 600px) {
    .header-actions { width: 100%; }
    .header-actions .btn { flex: 1; }
    .toolbar-right { width: 100%; }
    .toolbar-right .segmented { flex: 1; }
    .toolbar-right .segmented button { flex: 1; }
    .timeline .group { padding-left: 1.25rem; }
  }
</style>
