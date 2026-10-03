import DOMPurify from "dompurify";
import { Marked } from "marked";

/**
 * Anhänge in Markdown: `![Karte](attachment:<id>)` zeigt das Vorschaubild
 * (Klick öffnet das Original), `[Regeln](attachment:<id>)` verlinkt die
 * Datei. Andere Bilder werden nicht angezeigt: Externe Bilder würden die
 * IP-Adresse an fremde Server weitergeben (und die CSP blockiert sie ohnehin).
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ATTACHMENT_REF = new RegExp(`^attachment:(${UUID})$`, "i");
const ATTACHMENT_URL = new RegExp(`^/api/attachments/${UUID}/content(\\?variant=thumb)?$`, "i");

export const attachmentUrl = (id: string, variant: "full" | "thumb" = "full") =>
  `/api/attachments/${id}/content${variant === "thumb" ? "?variant=thumb" : ""}`;

/** Markdown-Schnipsel für einen Anhang (zum Einfügen im Editor). */
export function attachmentMarkdown(a: { id: string; kind: "image" | "pdf"; title: string; originalName: string }) {
  const label = (a.title || a.originalName || (a.kind === "pdf" ? "PDF" : "Bild")).replace(/[[\]\\]/g, "");
  return a.kind === "image" ? `![${label}](attachment:${a.id})` : `[${label}](attachment:${a.id})`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const marked = new Marked({
  gfm: true,
  breaks: true,
  walkTokens(token) {
    if (token.type !== "link" && token.type !== "image") return;
    const m = ATTACHMENT_REF.exec(token.href);
    if (m) token.href = attachmentUrl(m[1]!);
  },
  renderer: {
    image({ href, text }) {
      if (!ATTACHMENT_URL.test(href)) return escapeHtml(text);
      const thumb = `${href}?variant=thumb`;
      return `<a href="${href}" class="attachment-image"><img src="${thumb}" alt="${escapeHtml(text)}"></a>`;
    },
  },
});

// Gilt für alle Aufrufe von DOMPurify (markdown.ts ist der einzige Nutzer).
DOMPurify.addHook("afterSanitizeAttributes", node => {
  if (node.tagName === "IMG") {
    // Auch rohes HTML im Markdown darf keine fremden Bilder laden
    if (!ATTACHMENT_URL.test(node.getAttribute("src") ?? "")) node.removeAttribute("src");
    node.removeAttribute("srcset");
    node.setAttribute("loading", "lazy");
  }
  if (node.tagName === "A" && ATTACHMENT_URL.test(node.getAttribute("href") ?? "")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener");
  }
});

/** Markdown → bereinigtes HTML (kein Skript, keine Event-Handler, keine fremden Bilder). */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source ?? "", { async: false }) as string, {
    FORBID_TAGS: ["style", "picture", "source"],
  });
}
