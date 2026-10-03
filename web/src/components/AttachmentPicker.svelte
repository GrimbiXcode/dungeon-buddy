<script lang="ts">
  import { FileText, Paperclip, Upload } from "@lucide/svelte";
  import Modal from "./Modal.svelte";
  import { campaignApi, get, upload } from "../lib/api";
  import { formatDate } from "../lib/format";
  import { attachmentMarkdown, attachmentUrl } from "../lib/markdown";
  import { session } from "../lib/session.svelte";
  import { toastError } from "../lib/toast.svelte";
  import type { Attachment } from "../lib/types";

  /**
   * Knopf "Datei einfügen" für Markdown-Felder: wählt einen Anhang der
   * Kampagne (oder lädt einen hoch) und liefert das Markdown-Schnipsel.
   */
  let { campaignId, oninsert }: { campaignId: string; oninsert: (markdown: string) => void } = $props();

  const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

  let open = $state(false);
  let items = $state<Attachment[] | null>(null);
  let uploading = $state<number | null>(null);
  let input: HTMLInputElement | undefined = $state();

  async function show() {
    open = true;
    try {
      items = await get<Attachment[]>(campaignApi(campaignId, "attachments"));
    } catch (e) {
      toastError(e);
      open = false;
    }
  }

  function pick(a: Attachment) {
    open = false;
    oninsert(attachmentMarkdown(a));
  }

  async function picked(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    uploading = 0;
    try {
      const a = await upload<Attachment>(campaignApi(campaignId, "attachments"), file, {}, { onprogress: p => (uploading = p) });
      pick(a);
    } catch (err) {
      toastError(err);
    } finally {
      uploading = null;
    }
  }
</script>

{#if session.info?.attachments}
  <button type="button" class="btn btn-sm btn-ghost" onclick={show}><Paperclip size={14} /> Datei einfügen</button>
{/if}

{#if open}
  <Modal title="Datei einfügen" onclose={() => (open = false)}>
    <div class="row-between head">
      <p class="small muted">Bilder erscheinen im Text, PDFs als Link.</p>
      <button type="button" class="btn btn-sm btn-primary" onclick={() => input?.click()} disabled={uploading !== null}>
        <Upload size={14} />
        {uploading === null ? "Neu hochladen" : `${Math.round(uploading * 100)} %`}
      </button>
      <input class="sr-only" type="file" accept={ACCEPT} bind:this={input} onchange={picked} tabindex="-1" aria-hidden="true" />
    </div>
    {#if items === null}
      <div class="spinner"></div>
    {:else if items.length === 0}
      <p class="muted small">Noch keine Anhänge in dieser Kampagne.</p>
    {:else}
      <div class="grid">
        {#each items as a (a.id)}
          <button type="button" class="item" onclick={() => pick(a)}>
            {#if a.hasThumb}
              <img src={attachmentUrl(a.id, "thumb")} alt="" loading="lazy" />
            {:else}
              <span class="icon"><FileText size={28} /></span>
            {/if}
            <span class="tiny truncate">{a.title || a.originalName}</span>
            <span class="tiny faint">{formatDate(a.createdAt)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </Modal>
{/if}

<style>
  .head { margin-bottom: 0.8rem; }
  .head p { margin: 0; }
  .grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: inherit;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .item:hover, .item:focus-visible { border-color: var(--accent); }
  .item img, .icon { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 4px; }
  .icon { display: grid; place-items: center; color: var(--muted); background: var(--bg); }
</style>
