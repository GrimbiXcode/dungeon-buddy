<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";

  /** Zahl mit − und + daneben; ein Tipp auf die Zahl erlaubt direkte Eingabe. */
  let {
    value = $bindable(0),
    min = 0,
    max = 99999,
    label,
    warn = false,
    onchange,
  }: {
    value?: number;
    min?: number;
    max?: number;
    label: string;
    /** Zahl hervorheben, z. B. bei knappem Bestand */
    warn?: boolean;
    onchange?: (value: number) => void;
  } = $props();

  function set(n: number) {
    const next = Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : min)));
    if (next === value) return;
    value = next;
    onchange?.(next);
  }
</script>

<span class="stepper" class:warn>
  <button type="button" onclick={() => set(value - 1)} disabled={value <= min} aria-label="{label} verringern"><Minus size={14} /></button>
  <input
    class="mono"
    type="number"
    inputmode="numeric"
    {min}
    {max}
    value={value}
    aria-label={label}
    onchange={e => {
      set(Number(e.currentTarget.value));
      e.currentTarget.value = String(value);
    }}
    onfocus={e => e.currentTarget.select()}
  />
  <button type="button" onclick={() => set(value + 1)} disabled={value >= max} aria-label="{label} erhöhen"><Plus size={14} /></button>
</span>

<style>
  .stepper {
    display: inline-flex;
    align-items: stretch;
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-height: 32px;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent-text); }
  button:disabled { color: var(--faint); cursor: not-allowed; }
  input {
    width: 3.2rem;
    border: 0;
    border-inline: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    text-align: center;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .warn input { color: var(--danger); font-weight: 700; }
</style>
