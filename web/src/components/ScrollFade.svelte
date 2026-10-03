<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";

  /**
   * Waagrecht scrollbarer Bereich (z. B. Reiter auf dem Handy). Ragt der
   * Inhalt über den Rand, wird er dort ausgeblendet und ein Pfeil zeigt, dass
   * es weitergeht; ein Tipp auf den Pfeil scrollt ein Stück weiter.
   */
  let { children }: { children: Snippet } = $props();

  let el: HTMLDivElement | undefined = $state();
  let canLeft = $state(false);
  let canRight = $state(false);

  function update() {
    if (!el) return;
    canLeft = el.scrollLeft > 2;
    canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  }

  $effect(() => {
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  });

  function step(dir: 1 | -1) {
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  }
</script>

<div class="scroll-fade">
  <div bind:this={el} class="scroller" class:fade-left={canLeft} class:fade-right={canRight} onscroll={update}>
    {@render children()}
  </div>
  {#if canLeft}
    <button type="button" class="edge left" tabindex="-1" aria-label="Nach links scrollen" onclick={() => step(-1)}><ChevronLeft size={18} /></button>
  {/if}
  {#if canRight}
    <button type="button" class="edge right" tabindex="-1" aria-label="Nach rechts scrollen" onclick={() => step(1)}><ChevronRight size={18} /></button>
  {/if}
</div>

<style>
  .scroll-fade { position: relative; }
  .scroller {
    overflow-x: auto;
    scrollbar-width: none;
    --fade: 3rem;
  }
  .scroller::-webkit-scrollbar { display: none; }
  .scroller.fade-right { mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent); }
  .scroller.fade-left { mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent); }
  .scroller.fade-left.fade-right {
    mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  }
  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    /* Gut tippbar; Hintergrund verdeckt den ausgeblendeten Text unter dem Pfeil */
    width: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent-text);
    cursor: pointer;
  }
  .edge.left { left: 0; justify-content: flex-start; background: linear-gradient(to right, var(--bg) 45%, transparent); }
  .edge.right { right: 0; justify-content: flex-end; background: linear-gradient(to left, var(--bg) 45%, transparent); }
</style>
