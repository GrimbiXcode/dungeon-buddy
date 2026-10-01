<script lang="ts">
  import { CalendarDays, ChevronDown, Pencil, Sun, Trash2 } from "@lucide/svelte";
  import Markdown from "../../components/Markdown.svelte";
  import { formatDate } from "../../lib/format";
  import type { JournalEntry } from "../../lib/types";
  import type { JournalView } from "./journal";

  let {
    entry,
    view,
    pending = false,
    highlight = false,
    onedit,
    ondelete,
  }: {
    entry: JournalEntry;
    /** Ansicht, in der die Karte steht – Angaben aus dem Gruppenkopf werden nicht wiederholt */
    view: JournalView;
    pending?: boolean;
    highlight?: boolean;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  const COLLAPSED_PX = 260;

  let expanded = $state(false);
  let innerHeight = $state(0);
  const overflowing = $derived(innerHeight > COLLAPSED_PX + 40);
  const collapsed = $derived(overflowing && !expanded);

  const showSession = $derived(view !== "session" && entry.sessionNumber != null);
  const showDay = $derived(view !== "day" && entry.ingameDay != null);
  const showIngameDate = $derived(view !== "day" && !!entry.ingameDate);
  const showRealDate = $derived(view !== "session" && !!entry.sessionDate);
  const hasMeta = $derived(showSession || showDay || showIngameDate || showRealDate);
</script>

<article class="card entry" class:pending class:highlight aria-busy={pending}>
  <header class="entry-head">
    <div class="grow">
      {#if hasMeta}
        <div class="chip-row meta">
          {#if showSession}<span class="badge badge-accent">Session {entry.sessionNumber}</span>{/if}
          {#if showDay}<span class="badge badge-accent"><Sun size={12} /> Tag {entry.ingameDay}</span>{/if}
          {#if showIngameDate}<span class="badge">{entry.ingameDate}</span>{/if}
          {#if showRealDate}
            <span class="badge" title="Datum der Spielsitzung"><CalendarDays size={12} /> {formatDate(entry.sessionDate)}</span>
          {/if}
        </div>
      {/if}
      <h3 class:untitled={!entry.title.trim()}>{entry.title.trim() || "Ohne Titel"}</h3>
    </div>
    <div class="actions">
      <button class="btn btn-ghost btn-sm btn-icon" onclick={onedit} disabled={pending} aria-label="Eintrag bearbeiten" title="Bearbeiten">
        <Pencil size={15} />
      </button>
      <button class="btn btn-ghost btn-sm btn-icon btn-danger" onclick={ondelete} disabled={pending} aria-label="Eintrag löschen" title="Löschen">
        <Trash2 size={15} />
      </button>
    </div>
  </header>

  {#if entry.content.trim()}
    <div class="content" class:collapsed style:max-height={collapsed ? `${COLLAPSED_PX}px` : null}>
      <div bind:clientHeight={innerHeight}>
        <Markdown source={entry.content} />
      </div>
    </div>
    {#if overflowing}
      <button class="btn btn-ghost btn-sm more" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
        <ChevronDown size={15} style="transform: rotate({expanded ? 180 : 0}deg)" />
        {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
      </button>
    {/if}
  {:else}
    <p class="faint small empty-content">Kein Inhalt.</p>
  {/if}
</article>

<style>
  .entry {
    padding: 0.9rem 1rem 1rem;
    transition: opacity 0.2s, box-shadow 0.4s, border-color 0.4s;
  }
  .entry.pending { opacity: 0.6; }
  .entry.highlight {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .entry-head {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .meta { margin-bottom: 0.4rem; }
  h3 {
    margin: 0;
    font-size: 1.08rem;
    overflow-wrap: anywhere;
  }
  h3.untitled { color: var(--muted); font-style: italic; }
  .actions {
    display: flex;
    gap: 0.15rem;
    margin: -0.25rem -0.4rem 0 0;
    flex: none;
  }
  .content {
    position: relative;
    margin-top: 0.6rem;
    overflow: hidden;
  }
  .content.collapsed::after {
    content: "";
    position: absolute;
    inset: auto 0 0 0;
    height: 4.5rem;
    background: linear-gradient(to bottom, transparent, var(--surface));
    pointer-events: none;
  }
  .content :global(.prose > :first-child) { margin-top: 0; }
  .content :global(.prose > :last-child) { margin-bottom: 0; }
  .content :global(.prose h1) { font-size: 1.2rem; }
  .content :global(.prose h2) { font-size: 1.08rem; }
  .content :global(.prose h3) { font-size: 0.98rem; }
  .more {
    margin: 0.35rem 0 -0.35rem -0.5rem;
    color: var(--accent-text);
  }
  .empty-content { margin: 0.5rem 0 0; }
</style>
