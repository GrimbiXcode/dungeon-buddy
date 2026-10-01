<script lang="ts">
  import Markdown from "../../components/Markdown.svelte";
  import type { CharacterData } from "../../lib/character";
  import { sheet } from "./context";

  type TextKey = "featureNotes" | "proficiencies" | "languages" | "equipment" | "appearance" | "personality" | "backstory" | "notes";

  let { fields }: { fields: { key: TextKey; label: string; placeholder?: string; alwaysEdit?: boolean }[] } = $props();

  const ctx = sheet();
  const c = $derived<CharacterData>(ctx.data);
</script>

<div class="blocks">
  {#each fields as f (f.key)}
    <section class="card">
      <h3>{f.label}</h3>
      {#if ctx.editing || f.alwaysEdit}
        <textarea class="textarea" bind:value={c[f.key]} placeholder={f.placeholder} aria-label={f.label}></textarea>
      {:else if c[f.key]}
        <Markdown source={c[f.key]} />
      {:else}
        <p class="faint small">–</p>
      {/if}
    </section>
  {/each}
</div>

<style>
  .blocks { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  .textarea { min-height: 160px; }
</style>
