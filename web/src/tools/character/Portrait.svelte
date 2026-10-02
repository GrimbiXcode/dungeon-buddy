<script lang="ts">
  import { ImagePlus, Trash2 } from "@lucide/svelte";
  import { del, upload } from "../../lib/api";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { toastError } from "../../lib/toast.svelte";
  import type { Attachment } from "../../lib/types";

  /** Porträt im Kopf des Charakterbogens; im Bearbeiten-Modus änderbar. */
  let {
    characterId,
    name,
    portraitId,
    editing,
    onchange,
  }: {
    characterId: string;
    name: string;
    portraitId: string | null;
    editing: boolean;
    onchange: (portraitId: string | null) => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);

  async function picked(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    busy = true;
    try {
      const a = await upload<Attachment>(`/api/characters/${characterId}/portrait`, file, {}, { method: "PUT" });
      onchange(a.id);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!(await confirmDialog(`Porträt von ${name} entfernen?`, { title: "Porträt entfernen", confirmLabel: "Entfernen" }))) return;
    try {
      await del(`/api/characters/${characterId}/portrait`);
      onchange(null);
    } catch (err) {
      toastError(err);
    }
  }
</script>

{#if portraitId || editing}
  <div class="portrait" class:busy>
    {#if editing}
      <button class="frame" onclick={() => input?.click()} aria-label={portraitId ? "Porträt ändern" : "Porträt hinzufügen"} disabled={busy}>
        {#if portraitId}
          <img src="/api/attachments/{portraitId}/content?variant=thumb" alt="Porträt von {name}" />
          <span class="overlay"><ImagePlus size={18} /></span>
        {:else}
          <ImagePlus size={22} />
        {/if}
      </button>
      {#if portraitId}
        <button class="btn btn-sm btn-ghost btn-icon remove" onclick={remove} aria-label="Porträt entfernen"><Trash2 size={13} /></button>
      {/if}
      <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" bind:this={input} onchange={picked} tabindex="-1" aria-hidden="true" />
    {:else}
      <a class="frame" href="/api/attachments/{portraitId}/content" target="_blank" rel="noopener">
        <img src="/api/attachments/{portraitId}/content?variant=thumb" alt="Porträt von {name}" />
      </a>
    {/if}
  </div>
{/if}

<style>
  .portrait { position: relative; flex: none; }
  .frame {
    position: relative;
    width: 72px;
    height: 72px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    overflow: hidden;
    cursor: pointer;
  }
  .frame img { width: 100%; height: 100%; object-fit: cover; }
  button.frame { border-style: dashed; }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .frame:hover .overlay, .frame:focus-visible .overlay { opacity: 1; }
  .busy .frame { opacity: 0.5; cursor: progress; }
  .remove { position: absolute; right: -10px; bottom: -6px; min-width: 28px; min-height: 28px; background: var(--surface); }
</style>
