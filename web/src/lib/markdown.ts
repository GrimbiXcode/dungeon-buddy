import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/** Markdown → bereinigtes HTML (kein Skript, keine Event-Handler). */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source ?? "", { async: false }) as string, {
    FORBID_TAGS: ["style", "img"],
  });
}
