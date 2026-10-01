<script lang="ts" module>
  let openCount = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "@lucide/svelte";

  let {
    title,
    onclose,
    size = "md",
    children,
    footer,
  }: {
    title: string;
    onclose: () => void;
    size?: "sm" | "md" | "lg";
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let panel: HTMLDivElement | undefined = $state();

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = "hidden";
    // Ersten Eingabefokus setzen, sonst den Dialog selbst
    queueMicrotask(() => {
      const first = panel?.querySelector<HTMLElement>("[autofocus], input, select, textarea");
      (first ?? panel)?.focus();
    });
    return () => {
      openCount--;
      // Erst freigeben, wenn kein Dialog mehr offen ist (verschachtelte Dialoge)
      if (openCount === 0) document.body.style.overflow = "";
      previous?.focus?.();
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onkeydown={onkeydown} onclick={e => e.target === e.currentTarget && onclose()} role="presentation">
  <div class="panel {size}" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
    <header>
      <h2>{title}</h2>
      <button class="btn btn-ghost btn-icon" onclick={onclose} aria-label="Schliessen"><X size={18} /></button>
    </header>
    <div class="body">
      {@render children()}
    </div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgb(5 3 10 / 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fade 0.12s ease-out;
  }
  .panel {
    width: 100%;
    max-height: calc(100dvh - 2rem);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    outline: none;
    animation: pop 0.14s ease-out;
  }
  .sm { max-width: 420px; }
  .md { max-width: 560px; }
  .lg { max-width: 820px; }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.8rem 0.8rem 0.4rem 1.1rem;
  }
  header h2 { margin: 0; font-size: 1.15rem; }
  .body { padding: 0.5rem 1.1rem 1.1rem; overflow-y: auto; }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.8rem 1.1rem;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 600px) {
    .overlay { align-items: flex-end; padding: 0; }
    .panel {
      max-width: none;
      max-height: 92dvh;
      border-radius: var(--radius) var(--radius) 0 0;
      padding-bottom: env(safe-area-inset-bottom);
      animation: slide 0.18s ease-out;
    }
  }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(0.97); } }
  @keyframes slide { from { transform: translateY(30%); opacity: 0.5; } }
</style>
