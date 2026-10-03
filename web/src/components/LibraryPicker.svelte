<script lang="ts">
  import { onMount } from "svelte";
  import { Search } from "@lucide/svelte";
  import Modal from "./Modal.svelte";
  import { get } from "../lib/api";
  import { LIBRARY_KINDS, librarySummary, type LibraryItem, type LibraryKind } from "../lib/library";
  import { rulesetLabel } from "../lib/themes";
  import { toastError } from "../lib/toast.svelte";
  import type { Ruleset } from "../lib/types";

  /** Eintrag aus der eigenen Bibliothek auswählen (z. B. für den Charakterbogen). */
  let {
    kind,
    ruleset,
    onpick,
    onclose,
  }: { kind: LibraryKind; ruleset: Ruleset; onpick: (item: LibraryItem) => void; onclose: () => void } = $props();

  let items = $state<LibraryItem[] | null>(null);
  let search = $state("");

  const plural = $derived(LIBRARY_KINDS.find(k => k.key === kind)?.plural ?? "Einträge");
  const filtered = $derived(
    (items ?? []).filter(i => !search.trim() || `${i.name} ${librarySummary(i)}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  onMount(async () => {
    try {
      items = await get<LibraryItem[]>(`/api/library?kind=${kind}`);
    } catch (e) {
      toastError(e);
      items = [];
    }
  });
</script>

<Modal title="{plural} aus der Bibliothek" {onclose}>
  {#if items === null}
    <div class="spinner"></div>
  {:else if items.length === 0}
    <p class="muted small">
      Noch keine {plural} in deiner Bibliothek. Im Bogen fügst du Einträge über „In Bibliothek“ hinzu, unter
      <a href="/bibliothek">Bibliothek</a> übernimmst du welche von Freunden.
    </p>
  {:else}
    <div class="search">
      <Search size={15} />
      <input class="input input-sm" placeholder="Suchen …" bind:value={search} aria-label="Bibliothek durchsuchen" />
    </div>
    <div class="list">
      {#each filtered as item (item.id)}
        <button class="item" onclick={() => onpick(item)}>
          <span class="grow">
            <strong>{item.name}</strong>
            {#if item.ruleset}<span class="badge" class:warn={item.ruleset !== ruleset}>{rulesetLabel(item.ruleset)}</span>{/if}
            <span class="tiny muted block">{librarySummary(item)}{item.sourceName ? ` · von ${item.sourceName}` : ""}</span>
          </span>
        </button>
      {:else}
        <p class="muted small">Nichts gefunden.</p>
      {/each}
    </div>
  {/if}
</Modal>

<style>
  .search { position: relative; display: flex; align-items: center; margin-bottom: 0.6rem; }
  .search :global(svg) { position: absolute; left: 0.55rem; color: var(--faint); }
  .search input { padding-left: 1.9rem; }
  .list { display: flex; flex-direction: column; gap: 0.35rem; }
  .item {
    display: flex;
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .item:hover { border-color: var(--accent); }
  .badge { font-size: 0.68rem; margin-left: 0.3rem; }
  .badge.warn { color: var(--warning); border-color: var(--warning); }
  .block { display: block; }
</style>
