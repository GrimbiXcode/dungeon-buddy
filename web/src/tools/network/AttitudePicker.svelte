<script lang="ts">
  import { ATTITUDES } from "./attitude";

  let { value = $bindable(0), label = "Haltung", compact = false }: { value?: number; label?: string; compact?: boolean } = $props();
</script>

<div class="picker" class:compact role="group" aria-label={label}>
  {#each ATTITUDES as a (a.value)}
    <button
      type="button"
      class="opt"
      style="--c:{a.color}"
      aria-pressed={value === a.value}
      title={a.label}
      onclick={() => (value = a.value)}
    >
      <span class="dot"></span>
      <span class="txt">{a.soft}</span>
    </button>
  {/each}
</div>

<style>
  .picker {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    padding: 3px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .opt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    padding: 0.4rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .opt:hover { background: var(--surface-2); color: var(--text); }
  .opt[aria-pressed="true"] {
    background: color-mix(in oklab, var(--c) 18%, transparent);
    border-color: color-mix(in oklab, var(--c) 70%, transparent);
    color: color-mix(in oklab, var(--c) 70%, var(--text));
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--c) 25%, transparent);
  }
  .txt { max-width: 100%; text-align: center; line-height: 1.2; hyphens: manual; }
  .compact .opt { padding: 0.3rem 0.15rem; font-size: 0.72rem; }
  @media (max-width: 420px) {
    .opt { font-size: 0.68rem; }
  }
</style>
