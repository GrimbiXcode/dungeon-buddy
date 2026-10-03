<script lang="ts">
  import { cssLogoColors, doorSvg } from "../lib/logo";

  let { size = 28, withText = true }: { size?: number; withText?: boolean } = $props();
  const id = $props.id();
  // Folgt dem Akzent, also Farbschema und Kampagnen-Theme
  const svg = doorSvg(cssLogoColors(), { id, attrs: 'width="100%" height="100%" aria-hidden="true"' });
</script>

<span class="logo">
  <span class="mark" style:width="{size}px" style:height="{size}px">{@html svg}</span>
  {#if withText}<span class="text"><span class="dungeon">Dungeon</span> <span class="buddy">Buddy</span></span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text); }
  .mark { display: block; flex: none; }
  .mark :global(svg) { display: block; overflow: visible; }
  .text { display: grid; font-family: var(--font-display); text-transform: uppercase; line-height: 1; white-space: nowrap; }
  .dungeon { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.42em; }
  .buddy { font-size: 1.15rem; font-weight: 700; letter-spacing: 0.1em; }

  /* Beim Drüberfahren blinzelt der Buddy im Tor */
  @media (prefers-reduced-motion: no-preference) {
    .logo:hover .mark :global(.eyes) {
      animation: blink 0.35s ease-in-out;
      transform-box: fill-box;
      transform-origin: center;
    }
  }
  @keyframes blink {
    50% { transform: scaleY(0.1); }
  }
</style>
