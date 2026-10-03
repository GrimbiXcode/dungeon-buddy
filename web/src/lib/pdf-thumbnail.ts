import { upload } from "./api";
import type { Attachment } from "./types";

/**
 * Vorschaubilder für PDFs, im Browser aus der ersten Seite gerendert und
 * dann hochgeladen. So braucht der Server keinen PDF-Renderer. pdf.js
 * (~1.7 MB) wird erst geladen, wenn ein PDF ohne Vorschaubild auftaucht.
 */
async function renderFirstPage(source: Blob | string, width = 600): Promise<Blob> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    // Per URL lädt pdf.js dank Range-Anfragen nur die nötigen Teile
    ...(typeof source === "string"
      ? { url: source, withCredentials: true, disableAutoFetch: true }
      : { data: new Uint8Array(await source.arrayBuffer()) }),
    // WebAssembly bräuchte 'wasm-unsafe-eval' in der CSP; ohne fehlen nur seltene Bildformate
    useWasm: false,
    enableXfa: false,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    // Sehr lange Seiten (Endlos-Scans) abschneiden
    canvas.height = Math.min(Math.ceil(viewport.height), width * 2);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Vorschaubild konnte nicht erzeugt werden."))), "image/png")
    );
  } finally {
    // Beendet auch den Worker
    await task.destroy();
  }
}

/** Pro Seitenaufruf nur ein Versuch je PDF (z. B. verschlüsselte Dateien). */
const attempted = new Set<string>();

/**
 * Erzeugt das Vorschaubild für ein PDF, falls es noch keins hat. `file` ist
 * die gerade hochgeladene Datei (spart das erneute Laden). Liefert den
 * aktualisierten Anhang oder null.
 */
export async function ensurePdfThumbnail(a: Attachment, file?: Blob): Promise<Attachment | null> {
  if (a.kind !== "pdf" || a.hasThumb || attempted.has(a.id)) return null;
  attempted.add(a.id);
  try {
    const png = await renderFirstPage(file ?? `/api/attachments/${a.id}/content`);
    return await upload<Attachment>(`/api/attachments/${a.id}/thumb`, new File([png], "vorschau.png", { type: "image/png" }), {}, { method: "PUT" });
  } catch (e) {
    console.warn("[pdf] Kein Vorschaubild:", (e as Error).message);
    return null;
  }
}
