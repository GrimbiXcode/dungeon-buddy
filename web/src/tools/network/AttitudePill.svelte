<script lang="ts">
  import { attitudeInfo } from "./attitude";

  let { value, small = false }: { value: number; small?: boolean } = $props();
  const info = $derived(attitudeInfo(value));
</script>

<span class="pill" class:small style="--c:{info.color}"><span class="dot"></span>{info.label}</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.08rem 0.55rem 0.08rem 0.45rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 650;
    white-space: nowrap;
    background: color-mix(in oklab, var(--c) 15%, transparent);
    color: color-mix(in oklab, var(--c) 72%, var(--text));
    border: 1px solid color-mix(in oklab, var(--c) 35%, transparent);
  }
  .small { font-size: 0.7rem; padding: 0 0.45rem 0 0.35rem; }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--c); flex: none; }
</style>
