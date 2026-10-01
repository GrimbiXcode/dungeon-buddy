<script lang="ts">
  import { useRegisterSW } from "virtual:pwa-register/svelte";

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Stündlich nach Updates schauen
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });
</script>

{#if $needRefresh}
  <div class="pwa card" role="status">
    <span>Eine neue Version ist verfügbar.</span>
    <button class="btn btn-primary btn-sm" onclick={() => updateServiceWorker(true)}>Aktualisieren</button>
    <button class="btn btn-ghost btn-sm" onclick={() => needRefresh.set(false)}>Später</button>
  </div>
{/if}

<style>
  .pwa {
    position: fixed;
    z-index: 150;
    right: 1rem;
    top: 1rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    box-shadow: var(--shadow);
    max-width: calc(100vw - 2rem);
  }
</style>
