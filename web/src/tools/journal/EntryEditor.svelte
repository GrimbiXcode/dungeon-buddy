<script lang="ts">
  import { Check, Plus } from "@lucide/svelte";
  import AttachmentPicker from "../../components/AttachmentPicker.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import Modal from "../../components/Modal.svelte";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { insertAtCursor } from "../../lib/textarea";
  import type { EntryDraft } from "./journal";

  let {
    campaignId,
    title,
    initial,
    baseline,
    onsave,
    onclose,
  }: {
    campaignId: string;
    title: string;
    initial: EntryDraft;
    /** Vergleichsstand für "ungespeicherte Änderungen" (Standard: initial) */
    baseline?: EntryDraft;
    onsave: (draft: EntryDraft) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const start = { ...initial };
  // svelte-ignore state_referenced_locally
  const base = { ...(baseline ?? initial) };
  let sessionNumber = $state<number | null>(start.sessionNumber);
  let sessionDate = $state(start.sessionDate ?? "");
  let ingameDay = $state<number | null>(start.ingameDay);
  let ingameDate = $state(start.ingameDate);
  let entryTitle = $state(start.title);
  let content = $state(start.content);
  let mode = $state<"write" | "preview">("write");
  let textarea: HTMLTextAreaElement | undefined = $state();
  let titleInput: HTMLInputElement | undefined = $state();
  let form: HTMLFormElement | undefined = $state();

  // Modal fokussiert das erste Feld (Session); der Titel ist sinnvoller
  $effect(() => {
    const t = setTimeout(() => titleInput?.focus());
    return () => clearTimeout(t);
  });

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  /** Leere/ungültige Zahlenfelder als null behandeln */
  function num(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function draft(): EntryDraft {
    return {
      sessionNumber: num(sessionNumber),
      sessionDate: sessionDate || null,
      ingameDay: num(ingameDay),
      ingameDate: ingameDate.trim(),
      title: entryTitle.trim(),
      content,
    };
  }

  const dirty = $derived(
    num(sessionNumber) !== base.sessionNumber ||
      (sessionDate || null) !== base.sessionDate ||
      num(ingameDay) !== base.ingameDay ||
      ingameDate.trim() !== base.ingameDate ||
      entryTitle.trim() !== base.title ||
      content !== base.content
  );

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onsave(draft());
  }

  async function requestClose() {
    if (dirty) {
      const ok = await confirmDialog("Deine Änderungen an diesem Eintrag gehen verloren.", {
        title: "Änderungen verwerfen?",
        confirmLabel: "Verwerfen",
      });
      if (!ok) return;
    }
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      // requestSubmit, damit die Browser-Validierung (min/max) greift
      form?.requestSubmit();
    }
  }

  function nextDay() {
    ingameDay = (num(ingameDay) ?? 0) + 1;
  }

  function setMode(m: "write" | "preview") {
    mode = m;
    if (m === "write") queueMicrotask(() => textarea?.focus());
  }
</script>

<Modal {title} size="lg" onclose={requestClose}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form id="journal-entry-form" onsubmit={submit} {onkeydown} bind:this={form}>
    <div class="meta-grid">
      <div class="field">
        <label for="j-session">Session</label>
        <input id="j-session" class="input" type="number" inputmode="numeric" min="0" max="100000" step="1" placeholder="Nr." bind:value={sessionNumber} />
      </div>
      <div class="field">
        <label for="j-date">Datum der Session</label>
        <input id="j-date" class="input" type="date" bind:value={sessionDate} />
      </div>
      <div class="field">
        <label for="j-day">Spieltag</label>
        <div class="with-btn">
          <input id="j-day" class="input" type="number" inputmode="numeric" step="1" placeholder="Tag" bind:value={ingameDay} />
          <button type="button" class="btn btn-icon" onclick={nextDay} aria-label="Nächster Spieltag" title="Nächster Spieltag">
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div class="field">
        <label for="j-ingame">Datum im Spiel</label>
        <input id="j-ingame" class="input" maxlength="200" placeholder="z. B. 3. Mirtul 1492 DR" bind:value={ingameDate} />
      </div>
    </div>

    <div class="field">
      <label for="j-title">Titel</label>
      <input id="j-title" class="input" maxlength="300" placeholder="z. B. Ankunft in Phandalin" bind:value={entryTitle} bind:this={titleInput} />
    </div>

    <div class="field content-field">
      <div class="row-between content-head">
        <label for="j-content" class="label">Eintrag</label>
        <div class="row tools">
          <AttachmentPicker {campaignId} oninsert={md => insertAtCursor(textarea, content, md, v => (content = v))} />
          <div class="segmented" role="group" aria-label="Editor-Modus">
            <button type="button" aria-pressed={mode === "write"} onclick={() => setMode("write")}>Schreiben</button>
            <button type="button" aria-pressed={mode === "preview"} onclick={() => setMode("preview")}>Vorschau</button>
          </div>
        </div>
      </div>
      {#if mode === "write"}
        <textarea
          id="j-content"
          class="textarea"
          maxlength="200000"
          placeholder={"Was ist passiert? Wen habt ihr getroffen? Was wollt ihr als Nächstes tun?\n\n- Stichpunkte gehen auch\n- **fett**, *kursiv*, ## Überschriften"}
          bind:value={content}
          bind:this={textarea}
        ></textarea>
      {:else}
        <div class="preview">
          {#if content.trim()}
            <Markdown source={content} />
          {:else}
            <p class="faint">Noch nichts geschrieben.</p>
          {/if}
        </div>
      {/if}
      <span class="tiny muted hint">
        <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer">Markdown</a>
        wird unterstützt: **fett**, *kursiv*, - Listen, ## Überschriften, &gt; Zitate.
      </span>
    </div>
  </form>

  {#snippet footer()}
    <span class="tiny faint shortcut">{isMac ? "⌘" : "Strg"} + Enter speichert</span>
    <button type="button" class="btn btn-ghost" onclick={requestClose}>Abbrechen</button>
    <button type="submit" form="journal-entry-form" class="btn btn-primary"><Check size={16} /> Speichern</button>
  {/snippet}
</Modal>

<style>
  .meta-grid {
    display: grid;
    gap: 0 0.75rem;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.6fr);
  }
  @media (max-width: 700px) {
    .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  .with-btn { display: flex; gap: 0.35rem; }
  .with-btn .input { min-width: 0; }
  .content-field { margin-bottom: 0; }
  .content-head { gap: 0.5rem; }
  .content-head .tools { gap: 0.4rem; }
  .textarea,
  .preview {
    min-height: 16rem;
  }
  .textarea,
  .preview { height: 40vh; max-height: 32rem; }
  @media (max-width: 600px) {
    .textarea,
    .preview { height: 34dvh; min-height: 12rem; }
    .shortcut { display: none; }
  }
  .preview {
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow-y: auto;
  }
  .hint { margin-top: 0.15rem; }
  .shortcut { margin-right: auto; align-self: center; }
</style>
