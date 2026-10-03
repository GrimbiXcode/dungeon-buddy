<script lang="ts">
  import { Camera, ExternalLink, FileText, Trash2, Upload, X } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import Modal from "../components/Modal.svelte";
  import { campaignApi, del, get, patch, upload } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { formatBytes, formatDate, uid } from "../lib/format";
  import { ensurePdfThumbnail } from "../lib/pdf-thumbnail";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Attachment, AttachmentCategory, Campaign } from "../lib/types";

  let { campaign }: { campaign: Campaign } = $props();

  const CATEGORIES: { key: AttachmentCategory; label: string }[] = [
    { key: "map", label: "Karte" },
    { key: "scene", label: "Szene" },
    { key: "portrait", label: "Porträt" },
    { key: "notes", label: "Notizen" },
    { key: "table", label: "Spieltisch" },
    { key: "rules", label: "Regeln" },
    { key: "adventure", label: "Abenteuer" },
    { key: "other", label: "Sonstiges" },
  ];
  const categoryLabel = (key: AttachmentCategory) => CATEGORIES.find(c => c.key === key)?.label ?? key;

  /** Was der Server annimmt. Ohne image/heic: iOS wandelt HEIC-Fotos dann beim Auswählen in JPEG um. */
  const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
  const MAX_IMAGE = 25 * 1024 ** 2;
  const MAX_PDF = 100 * 1024 ** 2;

  type QueueItem = { id: string; name: string; progress: number; error: string | null; abort: AbortController };

  let items = $state<Attachment[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let filter = $state<AttachmentCategory | "all">("all");
  let queue = $state<QueueItem[]>([]);
  let dragging = $state(false);
  let viewing = $state<Attachment | null>(null);
  let editing = $state<{ item: Attachment; title: string; category: AttachmentCategory; description: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let cameraInput: HTMLInputElement | undefined = $state();

  const api = $derived(campaignApi(campaign.id, "attachments"));
  const filtered = $derived(filter === "all" ? items : items.filter(a => a.category === filter));
  const counts = $derived(
    items.reduce<Partial<Record<AttachmentCategory, number>>>((acc, a) => ((acc[a.category] = (acc[a.category] ?? 0) + 1), acc), {})
  );
  const totalBytes = $derived(items.reduce((sum, a) => sum + a.sizeBytes, 0));

  $effect(() => {
    void load(campaign.id);
  });

  async function load(campaignId: string) {
    loading = true;
    loadError = null;
    try {
      const list = await get<Attachment[]>(campaignApi(campaignId, "attachments"));
      if (campaignId === campaign.id) {
        items = list;
        void backfillThumbnails(list);
      }
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function replaceItem(updated: Attachment | null) {
    if (updated) items = items.map(a => (a.id === updated.id ? updated : a));
  }

  /** Ältere PDFs ohne Vorschaubild nachziehen, nacheinander und begrenzt. */
  async function backfillThumbnails(list: Attachment[]) {
    for (const a of list.filter(x => x.kind === "pdf" && !x.hasThumb).slice(0, 10)) {
      replaceItem(await ensurePdfThumbnail(a));
    }
  }

  const contentUrl = (a: Attachment, variant: "full" | "thumb" = "full") =>
    `/api/attachments/${a.id}/content${variant === "thumb" ? "?variant=thumb" : ""}`;
  const label = (a: Attachment) => a.title || a.originalName || (a.kind === "pdf" ? "PDF" : "Bild");

  /** Dateien nacheinander hochladen; neue Anhänge erhalten die gerade gefilterte Kategorie. */
  async function addFiles(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    const category = filter === "all" ? "other" : filter;
    const jobs = list.map(file => ({ file, item: { id: uid(), name: file.name, progress: 0, error: null, abort: new AbortController() } }));
    queue = [...queue, ...jobs.map(j => j.item)];
    for (const { file, item } of jobs) {
      const entry = () => queue.find(q => q.id === item.id);
      const tooBig = file.type === "application/pdf" ? file.size > MAX_PDF : file.size > MAX_IMAGE;
      if (tooBig) {
        const e = entry();
        if (e) e.error = `Zu gross (höchstens ${formatBytes(file.type === "application/pdf" ? MAX_PDF : MAX_IMAGE)}).`;
        continue;
      }
      try {
        const created = await upload<Attachment>(api, file, { category }, {
          signal: item.abort.signal,
          onprogress: p => {
            const e = entry();
            if (e) e.progress = p;
          },
        });
        items = [created, ...items];
        queue = queue.filter(q => q.id !== item.id);
        if (created.kind === "pdf") void ensurePdfThumbnail(created, file).then(replaceItem);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          queue = queue.filter(q => q.id !== item.id);
        } else {
          const q = entry();
          if (q) q.error = (e as Error).message;
        }
      }
    }
  }

  function onPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    void addFiles(input.files);
    input.value = "";
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragging = true;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    void addFiles(e.dataTransfer?.files);
  }

  function startEdit(a: Attachment) {
    editing = { item: a, title: a.title, category: a.category, description: a.description };
  }

  async function saveEdit() {
    if (!editing) return;
    const { item, title, category, description } = editing;
    try {
      const updated = await patch<Attachment>(`/api/attachments/${item.id}`, { title, category, description });
      items = items.map(a => (a.id === updated.id ? updated : a));
      if (viewing?.id === updated.id) viewing = updated;
      editing = null;
    } catch (e) {
      toastError(e);
    }
  }

  type Usage = { journalEntries: number; npcs: number; characters: number; campaigns: number };

  /** "2 Tagebucheinträgen und 1 NPC" – wo der Anhang noch vorkommt. */
  function usageText(u: Usage) {
    const parts = [
      u.journalEntries && `${u.journalEntries} ${u.journalEntries === 1 ? "Tagebucheintrag" : "Tagebucheinträgen"}`,
      u.npcs && `${u.npcs} ${u.npcs === 1 ? "NPC" : "NPCs"}`,
      u.characters && `${u.characters} ${u.characters === 1 ? "Charakter" : "Charakteren"}`,
      u.campaigns && `der Beschreibung ${u.campaigns === 1 ? "einer Kampagne" : `von ${u.campaigns} Kampagnen`}`,
    ].filter(Boolean) as string[];
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}` : (parts[0] ?? "");
  }

  async function remove(a: Attachment) {
    const usage = await get<Usage>(`/api/attachments/${a.id}/usage`).catch(() => null);
    const used = usage ? usageText(usage) : "";
    const message = used
      ? `„${label(a)}“ wird noch in ${used} verwendet und fehlt dort danach. Trotzdem endgültig löschen?`
      : `„${label(a)}“ endgültig löschen?`;
    const ok = await confirmDialog(message, { title: "Anhang löschen" });
    if (!ok) return;
    try {
      await del(`/api/attachments/${a.id}`);
      items = items.filter(x => x.id !== a.id);
      if (viewing?.id === a.id) viewing = null;
      toast("Anhang gelöscht.", "success");
    } catch (e) {
      toastError(e);
    }
  }
</script>

<svelte:window ondragover={onDragOver} ondrop={onDrop} ondragleave={e => e.relatedTarget === null && (dragging = false)} />

<div class="page-header">
  <div>
    <h1>Anhänge</h1>
    <p class="muted">
      Karten, Szenenbilder, Fotos von Notizen und vom Spieltisch, Regel- und Abenteuer-PDFs. Fotos werden ohne
      Standort- und Kameradaten gespeichert.
    </p>
  </div>
  <div class="row">
    <button class="btn camera" onclick={() => cameraInput?.click()}><Camera size={16} /> Foto aufnehmen</button>
    <button class="btn btn-primary" onclick={() => fileInput?.click()}><Upload size={16} /> Hochladen</button>
  </div>
</div>

<input class="sr-only" type="file" multiple accept={ACCEPT} bind:this={fileInput} onchange={onPicked} tabindex="-1" aria-hidden="true" />
<input class="sr-only" type="file" accept="image/jpeg" capture="environment" bind:this={cameraInput} onchange={onPicked} tabindex="-1" aria-hidden="true" />

{#if items.length}
  <div class="chip-row filters" role="group" aria-label="Nach Kategorie filtern">
    <button class="chip" aria-pressed={filter === "all"} onclick={() => (filter = "all")}>Alle <span class="faint">{items.length}</span></button>
    {#each CATEGORIES as c (c.key)}
      {#if counts[c.key] || filter === c.key}
        <button class="chip" aria-pressed={filter === c.key} onclick={() => (filter = c.key)}>
          {c.label} <span class="faint">{counts[c.key] ?? 0}</span>
        </button>
      {/if}
    {/each}
  </div>
{/if}

{#if queue.length}
  <div class="stack queue" aria-live="polite">
    {#each queue as q (q.id)}
      <div class="card upload" class:failed={q.error}>
        <div class="grow">
          <span class="small truncate block">{q.name}</span>
          {#if q.error}
            <span class="tiny error">{q.error}</span>
          {:else}
            <progress max="1" value={q.progress} aria-label="Fortschritt {q.name}"></progress>
          {/if}
        </div>
        <button
          class="btn btn-sm btn-ghost btn-icon"
          aria-label={q.error ? "Meldung schliessen" : "Hochladen abbrechen"}
          onclick={() => (q.error ? (queue = queue.filter(x => x.id !== q.id)) : q.abort.abort())}
        >
          <X size={14} />
        </button>
      </div>
    {/each}
  </div>
{/if}

{#if loading}
  <div class="spinner"></div>
{:else if loadError}
  <div class="empty"><h3>Anhänge nicht verfügbar</h3><p>{loadError}</p></div>
{:else if items.length === 0}
  <button class="empty dropzone" onclick={() => fileInput?.click()}>
    <Icon name="attachments" size={32} class="faint" />
    <h3>Noch keine Anhänge</h3>
    <p>Dateien hierher ziehen oder auswählen: JPEG, PNG, WebP, GIF (bis 25 MB) und PDF (bis 100 MB).</p>
  </button>
{:else}
  <div class="gallery">
    {#each filtered as a (a.id)}
      <article class="card item">
        {#if a.kind === "image"}
          <button class="thumb" onclick={() => (viewing = a)} aria-label="{label(a)} ansehen">
            <img src={contentUrl(a, "thumb")} alt={label(a)} loading="lazy" decoding="async" />
          </button>
        {:else if a.hasThumb}
          <a class="thumb pdf-preview" href={contentUrl(a)} target="_blank" rel="noopener" aria-label="{label(a)} öffnen">
            <img src={contentUrl(a, "thumb")} alt={label(a)} loading="lazy" decoding="async" />
            <span class="pdf-badge tiny">PDF</span>
          </a>
        {:else}
          <a class="thumb pdf" href={contentUrl(a)} target="_blank" rel="noopener" aria-label="{label(a)} öffnen">
            <FileText size={40} />
            <span class="tiny">PDF</span>
          </a>
        {/if}
        <div class="meta">
          <strong class="truncate" title={label(a)}>{label(a)}</strong>
          <span class="tiny muted">{categoryLabel(a.category)} · {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}</span>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-ghost btn-icon" aria-label="{label(a)} bearbeiten" onclick={() => startEdit(a)}><Icon name="edit" size={14} /></button>
          <button class="btn btn-sm btn-ghost btn-icon" aria-label="{label(a)} löschen" onclick={() => remove(a)}><Trash2 size={14} /></button>
        </div>
      </article>
    {:else}
      <p class="muted small">Keine Anhänge in dieser Kategorie. Neue Uploads landen hier.</p>
    {/each}
  </div>
  <p class="tiny faint foot">{items.length} Anhänge · {formatBytes(totalBytes)}</p>
{/if}

{#if dragging}
  <div class="drop-overlay" aria-hidden="true">
    <Upload size={36} />
    <strong>Loslassen zum Hochladen</strong>
    {#if filter !== "all"}<span class="small">Kategorie: {categoryLabel(filter)}</span>{/if}
  </div>
{/if}

{#if viewing}
  {@const a = viewing}
  <Modal title={label(a)} size="lg" onclose={() => (viewing = null)}>
    <img class="full" src={contentUrl(a)} alt={label(a)} />
    {#if a.description}<p class="small description">{a.description}</p>{/if}
    <p class="tiny muted">
      {categoryLabel(a.category)}{#if a.width && a.height} · {a.width} × {a.height} px{/if} · {formatBytes(a.sizeBytes)} · {formatDate(a.createdAt)}
    </p>
    {#snippet footer()}
      <button class="btn btn-danger" onclick={() => remove(a)}><Trash2 size={16} /> Löschen</button>
      <a class="btn" href={contentUrl(a)} target="_blank" rel="noopener"><ExternalLink size={16} /> In neuem Tab</a>
      <button class="btn" onclick={() => startEdit(a)}><Icon name="edit" size={16} /> Bearbeiten</button>
    {/snippet}
  </Modal>
{/if}

{#if editing}
  <Modal title="Anhang bearbeiten" size="sm" onclose={() => (editing = null)}>
    <form id="attachment-edit" onsubmit={e => (e.preventDefault(), void saveEdit())}>
      <label class="field">
        <span class="label">Titel</span>
        <input class="input" bind:value={editing.title} maxlength="200" placeholder={editing.item.originalName} />
      </label>
      <div class="field">
        <span class="label">Kategorie</span>
        <div class="chip-row">
          {#each CATEGORIES as c (c.key)}
            <button type="button" class="chip" aria-pressed={editing.category === c.key} onclick={() => editing && (editing.category = c.key)}>{c.label}</button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span class="label">Beschreibung</span>
        <textarea class="textarea" bind:value={editing.description} maxlength="5000"></textarea>
      </label>
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (editing = null)}>Abbrechen</button>
      <button class="btn btn-primary" type="submit" form="attachment-edit">Speichern</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .block { display: block; }
  .filters { margin-bottom: 1rem; }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); }

  /* "Foto aufnehmen" nur auf Touch-Geräten; am Desktop öffnet capture nur den Dateidialog */
  .camera { display: none; }
  @media (pointer: coarse) { .camera { display: inline-flex; } }

  .queue { margin-bottom: 1rem; gap: 0.4rem; }
  .upload { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem; }
  .upload progress { width: 100%; height: 6px; accent-color: var(--accent-strong); }
  .upload.failed { border-color: var(--danger); }
  .error { color: var(--danger); }

  .dropzone {
    width: 100%;
    border: 2px dashed var(--border);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .dropzone:hover { border-color: var(--accent); }

  .gallery { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
  .item { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
  .thumb {
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 0;
    background: var(--surface-2);
    color: var(--muted);
    cursor: pointer;
  }
  /* Absolut positioniert, sonst setzt das Bild sein eigenes Seitenverhältnis durch */
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .thumb.pdf { gap: 0.2rem; align-content: center; }
  .thumb.pdf:hover { color: var(--accent-text); text-decoration: none; }
  .pdf-preview img { object-position: top; }
  .pdf-badge {
    position: absolute;
    left: 0.4rem;
    bottom: 0.4rem;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .meta { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.5rem 0.7rem 0; min-width: 0; }
  .actions { display: flex; justify-content: flex-end; padding: 0.1rem 0.3rem 0.3rem; }
  .foot { margin-top: 1rem; }

  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.4rem;
    background: color-mix(in oklab, var(--accent) 18%, rgb(5 3 10 / 0.6));
    color: #fff;
    pointer-events: none;
  }

  .full { display: block; max-width: 100%; max-height: 70dvh; margin: 0 auto; border-radius: var(--radius-sm); }
  .description { white-space: pre-wrap; }
</style>
