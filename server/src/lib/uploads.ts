import sharp from "sharp";

/** Grenzen für hochgeladene Dateien. */
export const UPLOAD_LIMITS = {
  /** Bilder werden komplett in den Speicher gelesen und verarbeitet. */
  imageBytes: 25 * 1024 * 1024,
  /** PDFs werden unverändert zum Storage gestreamt. */
  pdfBytes: 100 * 1024 * 1024,
  /** Schutz gegen Dekompressionsbomben (≈ 10 000 × 10 000 Pixel) */
  imagePixels: 100_000_000,
  /** Lange Kante des gespeicherten Bildes; Karten dürfen grösser sein. */
  imageEdge: 4096,
  mapEdge: 8192,
  thumbEdge: 480,
} as const;

/** Wie viele Bytes die Typerkennung braucht. */
export const SNIFF_BYTES = 16;

export type SniffResult =
  | { kind: "image"; mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }
  | { kind: "pdf"; mime: "application/pdf" }
  | { kind: "heic" }
  | null;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0));

/**
 * Bestimmt den Dateityp anhand der ersten Bytes. Endung und vom Browser
 * gemeldeter Typ werden bewusst ignoriert.
 */
export function sniff(head: Buffer): SniffResult {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png" };
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return { kind: "image", mime: "image/gif" };
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return { kind: "image", mime: "image/webp" };
  if (startsWith(head, ascii("%PDF-"))) return { kind: "pdf", mime: "application/pdf" };
  // HEIC/HEIF (iPhone-Fotos): ISO-BMFF mit passender Marke
  if (startsWith(head, ascii("ftyp"), 4)) {
    const brand = head.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "heic" };
  }
  return null;
}

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
};

/**
 * Normalisiert ein Bild: dreht es gemäss EXIF, entfernt alle Metadaten
 * (GPS, Kamera, Zeitpunkt), begrenzt die Grösse und speichert als WebP.
 * Animierte GIFs werden auf das erste Bild reduziert.
 */
export async function processImage(input: Buffer, opts: { maxEdge: number }): Promise<ProcessedImage> {
  // sharp schreibt ohne keepMetadata()/withMetadata() keine Metadaten.
  const base = sharp(input, { limitInputPixels: UPLOAD_LIMITS.imagePixels, animated: false, failOn: "error" }).rotate();
  const fit = (edge: number) => ({ width: edge, height: edge, fit: "inside" as const, withoutEnlargement: true });
  const full = await base.clone().resize(fit(opts.maxEdge)).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize(fit(UPLOAD_LIMITS.thumbEdge)).webp({ quality: 75 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

/** Nur ein Vorschaubild (z. B. für PDFs, im Browser gerendert), ohne Metadaten. */
export async function processThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: UPLOAD_LIMITS.imagePixels, animated: false, failOn: "error" })
    .rotate()
    .resize({ width: UPLOAD_LIMITS.thumbEdge, height: UPLOAD_LIMITS.thumbEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}
