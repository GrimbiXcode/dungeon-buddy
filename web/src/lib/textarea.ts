import { tick } from "svelte";

/**
 * Fügt `text` an der Cursorposition einer Textarea ein (oder am Ende, wenn
 * sie gerade nicht angezeigt wird) und setzt den Cursor dahinter. Bilder
 * u. ä. kommen auf eine eigene Zeile.
 */
export async function insertAtCursor(
  el: HTMLTextAreaElement | undefined,
  value: string,
  text: string,
  apply: (next: string) => void
) {
  const start = el && document.contains(el) ? el.selectionStart : value.length;
  const end = el && document.contains(el) ? el.selectionEnd : value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const trail = after.startsWith("\n") ? "" : "\n";
  apply(before + lead + text + trail + after);
  await tick();
  if (el && document.contains(el)) {
    const pos = (before + lead + text + trail).length;
    el.focus();
    el.setSelectionRange(pos, pos);
  }
}
