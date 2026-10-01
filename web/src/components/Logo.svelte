<script lang="ts">
  let { size = 28, withText = true }: { size?: number; withText?: boolean } = $props();
</script>

<span class="logo">
  <img src="/favicon.svg" alt="" width={size} height={size} />
  {#if withText}<span class="text">Dungeon Buddy</span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 0.55rem; color: var(--text); }
  .text { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; letter-spacing: 0.02em; }
</style>
