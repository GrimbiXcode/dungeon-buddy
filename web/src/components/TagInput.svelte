<script lang="ts">
  import { X } from "@lucide/svelte";

  /**
   * Mehrfachauswahl mit Freitext: vorbereitete Vorschläge antippen oder eigenen
   * Text eingeben (Enter oder Komma übernimmt ihn).
   */
  let {
    values = $bindable([]),
    options = [],
    placeholder = "",
    label,
    id,
  }: { values?: string[]; options?: string[]; placeholder?: string; label: string; id?: string } = $props();

  let text = $state("");
  let focused = $state(false);
  let input: HTMLInputElement | undefined = $state();

  const norm = (s: string) => s.trim().toLocaleLowerCase("de");
  const suggestions = $derived(
    options.filter(o => !values.some(v => norm(v) === norm(o)) && (!text.trim() || norm(o).includes(norm(text))))
  );

  function add(raw: string) {
    const value = raw.replace(/,/g, " ").trim();
    text = "";
    if (!value || values.some(v => norm(v) === norm(value))) return;
    values = [...values, value];
  }

  function remove(i: number) {
    values = values.filter((_, j) => j !== i);
    input?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add(text);
    } else if (e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && values.length) {
      values = values.slice(0, -1);
    }
  }

  let blurTimer: ReturnType<typeof setTimeout> | undefined;

  function onblur() {
    add(text);
    // Kurz warten, damit ein angetippter Vorschlag noch ankommt
    blurTimer = setTimeout(() => (focused = false), 150);
  }

  function onfocus() {
    clearTimeout(blurTimer);
    focused = true;
  }
</script>

<div class="tag-input">
  <div class="box" class:focused>
    {#each values as v, i (v)}
      <span class="tag">
        {v}
        <button type="button" class="remove" aria-label="{v} entfernen" onclick={() => remove(i)}><X size={13} /></button>
      </span>
    {/each}
    <input
      {id}
      bind:this={input}
      bind:value={text}
      aria-label={label}
      placeholder={values.length ? "" : placeholder}
      enterkeyhint="done"
      {onfocus}
      {onblur}
      {onkeydown}
    />
  </div>
  {#if focused && suggestions.length}
    <div class="suggestions" role="group" aria-label="Vorschläge für {label}">
      {#each suggestions as s (s)}
        <!-- Fokus im Eingabefeld behalten, damit der Vorschlag ankommt -->
        <button type="button" class="suggestion" onmousedown={e => e.preventDefault()} onclick={() => { add(s); input?.focus(); }}>+ {s}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-input { display: flex; flex-direction: column; gap: 0.4rem; }
  .box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    min-height: 40px;
    padding: 0.25rem 0.4rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg);
    cursor: text;
  }
  .box.focused { border-color: var(--accent); outline: 2px solid var(--accent-soft); }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.2rem 0.15rem 0.55rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .remove {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .remove:hover { background: color-mix(in oklab, var(--accent) 25%, transparent); }
  input {
    flex: 1;
    min-width: 8rem;
    min-height: 30px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
  }
  .suggestions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .suggestion {
    min-height: 32px;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .suggestion:hover { border-style: solid; color: var(--text); }
</style>
