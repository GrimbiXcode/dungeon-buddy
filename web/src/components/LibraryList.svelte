<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronDown } from "@lucide/svelte";
  import Icon from "./Icon.svelte";
  import Markdown from "./Markdown.svelte";
  import { LIBRARY_KINDS, kindLabel, librarySummary, type LibraryItem, type LibraryKind } from "../lib/library";
  import { rulesetLabel } from "../lib/themes";

  /** Durchsuchbare Liste von Bibliothekseinträgen mit Aktionen pro Eintrag. */
  let { items, actions, empty }: { items: LibraryItem[]; actions: Snippet<[LibraryItem]>; empty?: Snippet } = $props();

  let search = $state("");
  let kinds = $state<LibraryKind[]>([]);
  let open = $state<string | null>(null);

  const present = $derived(LIBRARY_KINDS.filter(k => items.some(i => i.kind === k.key)));
  const filtered = $derived(
    items.filter(
      i =>
        (!kinds.length || kinds.includes(i.kind)) &&
        (!search.trim() || `${i.name} ${librarySummary(i)} ${i.sourceName}`.toLowerCase().includes(search.trim().toLowerCase()))
    )
  );

  function toggleKind(k: LibraryKind) {
    kinds = kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k];
  }

  /** Längerer Text zum Aufklappen */
  function details(item: LibraryItem): string {
    const d = item.data as Record<string, unknown>;
    if (item.kind === "spell") return String((d.data as Record<string, unknown> | undefined)?.description ?? "");
    if (item.kind === "feature") return [d.condition ? `*Bedingung:* ${d.condition}` : "", String(d.description ?? "")].filter(Boolean).join("\n\n");
    return String(d.notes ?? "");
  }
</script>

{#if items.length === 0}
  {#if empty}{@render empty()}{/if}
{:else}
  <div class="filters">
    <div class="search">
      <Icon name="search" size={15} />
      <input class="input input-sm" placeholder="Suchen …" bind:value={search} aria-label="Bibliothek durchsuchen" />
    </div>
    <div class="chip-row">
      {#each present as k (k.key)}
        <button class="chip" aria-pressed={kinds.includes(k.key)} onclick={() => toggleKind(k.key)}>{k.plural}</button>
      {/each}
    </div>
  </div>
  <div class="list">
    {#each filtered as item (item.id)}
      {@const text = details(item)}
      <article class="item">
        <div class="top">
          <button class="name-btn grow" onclick={() => (open = open === item.id ? null : item.id)} aria-expanded={open === item.id} disabled={!text}>
            <strong>{item.name}</strong>
            <span class="badge">{kindLabel(item.kind)}</span>
            {#if item.ruleset}<span class="badge">{rulesetLabel(item.ruleset)}</span>{/if}
            {#if text}<ChevronDown size={14} class="chev {open === item.id ? 'open' : ''}" />{/if}
          </button>
          <div class="row actions">{@render actions(item)}</div>
        </div>
        <span class="tiny muted">{librarySummary(item)}{item.sourceName ? ` · von ${item.sourceName}` : ""}</span>
        {#if open === item.id && text}
          <div class="details small"><Markdown source={text} /></div>
        {/if}
      </article>
    {:else}
      <p class="muted small">Nichts gefunden.</p>
    {/each}
  </div>
{/if}

<style>
  .filters { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.8rem; }
  .search { position: relative; display: flex; align-items: center; max-width: 24rem; }
  .search :global(svg) { position: absolute; left: 0.55rem; color: var(--faint); }
  .search input { padding-left: 1.9rem; }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .list { display: flex; flex-direction: column; gap: 0.45rem; }
  .item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .name-btn {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }
  .name-btn:disabled { cursor: default; }
  .name-btn .badge { font-size: 0.68rem; }
  .name-btn :global(.chev) { color: var(--faint); transition: transform 0.15s; }
  .name-btn :global(.chev.open) { transform: rotate(180deg); }
  .actions { gap: 0.3rem; }
  .details { border-top: 1px dashed var(--border); padding-top: 0.4rem; margin-top: 0.2rem; }
</style>
