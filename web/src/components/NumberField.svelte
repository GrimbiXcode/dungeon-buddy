<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  /**
   * Zahlenfeld für gespeicherte Werte. Anders als `bind:value` an einem
   * `<input type="number">` schreibt es nie `null` oder NaN: Ein geleertes Feld
   * lässt den Wert unverändert und zeigt ihn beim Verlassen wieder an
   * (ausser `nullable`). `min`/`max` gelten beim Verlassen des Felds.
   */
  let {
    value = $bindable(),
    min,
    max,
    nullable = false,
    integer = true,
    ...rest
  }: Omit<HTMLInputAttributes, "value" | "min" | "max" | "type"> & {
    value: number | null;
    min?: number;
    max?: number;
    nullable?: boolean;
    integer?: boolean;
  } = $props();

  const inRange = (n: number) => (min == null || n >= min) && (max == null || n <= max);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, integer ? Math.trunc(n) : n));
  const show = (el: HTMLInputElement) => (el.value = value == null ? "" : String(value));

  function oninput(e: Event & { currentTarget: HTMLInputElement }) {
    const el = e.currentTarget;
    if (el.value === "") {
      if (nullable) value = null;
      return;
    }
    const n = el.valueAsNumber;
    if (Number.isFinite(n) && inRange(n)) value = integer ? Math.trunc(n) : n;
  }

  function onchange(e: Event & { currentTarget: HTMLInputElement }) {
    const el = e.currentTarget;
    const n = el.valueAsNumber;
    if (el.value !== "" && Number.isFinite(n)) value = clamp(n);
    show(el);
  }
</script>

<input {...rest} type="number" {min} {max} value={value ?? ""} {oninput} {onchange} />
