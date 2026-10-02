<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "@lucide/svelte";
  import AppShell from "../components/AppShell.svelte";
  import { get } from "../lib/api";
  import type { CharacterRecord } from "../lib/types";
  import CharacterSheet from "../tools/CharacterSheet.svelte";
  import Spellbook from "../tools/Spellbook.svelte";

  /** Charakterbogen bzw. Zauberbuch eines Charakters ausserhalb einer Kampagne. */
  let { characterId, section = "bogen" }: { characterId: string; section?: "bogen" | "zauber" } = $props();

  let character = $state<CharacterRecord | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    if (section !== "zauber") return;
    try {
      character = await get<CharacterRecord>(`/api/characters/${characterId}`);
    } catch (e) {
      error = (e as Error).message;
    }
  });
</script>

<AppShell>
  {#if section === "bogen"}
    <CharacterSheet {characterId} />
  {:else if error}
    <div class="empty"><h3>Charakter nicht gefunden</h3><p>{error}</p><a class="btn" href="/charaktere">Zurück</a></div>
  {:else if character}
    <a class="btn btn-ghost btn-sm back" href="/charaktere/{character.id}"><ArrowLeft size={15} /> {character.name}</a>
    <Spellbook {character} />
  {:else}
    <div class="spinner"></div>
  {/if}
</AppShell>

<style>
  .back { margin: -0.5rem 0 0.8rem -0.5rem; }
</style>
