<script lang="ts">
  import type { Snippet } from "svelte";
  import { GitFork } from "@lucide/svelte";
  import Icon from "./Icon.svelte";
  import { classSummary, normalizeCharacter, totalLevel } from "../lib/character";
  import { armorClass } from "../lib/armor";
  import { session } from "../lib/session.svelte";
  import { rulesetLabel } from "../lib/themes";
  import type { CharacterRecord } from "../lib/types";

  let {
    character,
    href,
    dimmed = false,
    meta,
    actions,
  }: {
    character: CharacterRecord;
    href: string;
    dimmed?: boolean;
    meta?: Snippet;
    actions?: Snippet;
  } = $props();

  const d = $derived(normalizeCharacter(character.data));
  const portrait = $derived(character.portraitId && session.info?.attachments ? character.portraitId : null);
</script>

<div class="card char" class:dimmed class:dead={character.status === "dead"}>
  <a {href} class="main">
    {#if portrait}
      <span class="level portrait">
        <img src="/api/attachments/{portrait}/content?variant=thumb" alt="" loading="lazy" decoding="async" />
        <span class="level-badge" title="Stufe">{#if character.status === "dead"}<Icon name="death" size={11} />{:else}{totalLevel(d)}{/if}</span>
      </span>
    {:else}
      <span class="level" title="Stufe">
        {#if character.status === "dead"}<Icon name="death" size={20} />{:else}{totalLevel(d)}{/if}
      </span>
    {/if}
    <span class="grow info">
      <strong class="block truncate">{character.name}</strong>
      <span class="small muted block truncate">{[d.species, classSummary(d) || `Stufe ${totalLevel(d)}`].filter(Boolean).join(" · ")}</span>
    </span>
  </a>
  <div class="chip-row badges">
    <span class="badge">{rulesetLabel(character.ruleset)}</span>
    {#if character.status === "dead"}<span class="badge badge-danger">Verstorben</span>{/if}
    {#if character.status === "retired"}<span class="badge">Im Ruhestand</span>{/if}
    {#if character.forkedFrom || character.forkedFromName}
      <span class="badge" title="Eigenständige Kopie"><GitFork size={11} /> {character.forkedFromName ? `Kopie von ${character.forkedFromName}` : "Kopie"}</span>
    {/if}
    <span class="badge"><Icon name="hp" size={11} /> {d.hp.current}/{d.hp.max}</span>
    <span class="badge"><Icon name="armor" size={11} /> {armorClass(d).total}</span>
  </div>
  {#if meta}<div class="meta">{@render meta()}</div>{/if}
  {#if actions}<div class="row actions">{@render actions()}</div>{/if}
</div>

<style>
  .char { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.9rem; }
  .char.dimmed { opacity: 0.7; }
  .main { display: flex; gap: 0.8rem; align-items: center; color: inherit; }
  .main:hover { text-decoration: none; }
  .main:hover strong { color: var(--accent-text); }
  .info { min-width: 0; }
  .level {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.2rem;
    background: var(--accent-soft);
    color: var(--accent-text);
    border: 2px solid var(--accent);
  }
  .dead .level { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }
  .portrait { position: relative; width: 52px; height: 52px; }
  .portrait img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .dead .portrait img { filter: grayscale(1); }
  .level-badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    background: var(--surface);
    border: 2px solid var(--accent);
  }
  .dead .level-badge { border-color: var(--danger); }
  .block { display: block; }
  .badges { gap: 0.3rem; }
  .badges .badge { font-size: 0.7rem; }
  .meta { font-size: 0.8rem; }
  .actions { gap: 0.35rem; border-top: 1px solid var(--border); padding-top: 0.55rem; }
</style>
