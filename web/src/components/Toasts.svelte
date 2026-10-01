<script lang="ts">
  import { toasts } from "../lib/toast.svelte";
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast {t.kind}">{t.message}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    z-index: 200;
    left: 50%;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(420px, calc(100vw - 2rem));
    pointer-events: none;
  }
  .toast {
    padding: 0.7rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    animation: up 0.15s ease-out;
  }
  .error { border-color: var(--danger); color: var(--danger); }
  .success { border-color: var(--success); }
  @keyframes up { from { transform: translateY(8px); opacity: 0; } }
  @media (max-width: 767px) {
    .toasts { bottom: calc(5rem + env(safe-area-inset-bottom)); }
  }
</style>
