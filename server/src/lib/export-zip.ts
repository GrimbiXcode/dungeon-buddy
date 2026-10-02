import { Readable } from "node:stream";
import yazl from "yazl";
import { sql } from "../db.js";
import { getStorage } from "./storage.js";

/** Teil eines Pfads im ZIP: ohne Trenn- und Steuerzeichen, nicht leer. */
export function safeSegment(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Hängt " (2)", " (3)" … an, bis der Name frei ist (ohne Gross/Klein). */
function uniqueIn(used: Set<string>, name: string, ext = "") {
  let candidate = name + ext;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${name} (${i})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * ZIP mit allen Daten eines Kontos: daten.json (wie der JSON-Export) und
 * die Anhänge, sortiert nach Kampagne bzw. Charakter. Die Dateien werden
 * erst beim Schreiben aus dem Storage geholt und nicht erneut komprimiert
 * (WebP und PDF sind es bereits).
 */
export async function buildExportZip(userId: string, data: unknown) {
  const storage = getStorage()!;
  const rows = await sql<
    {
      id: string;
      kind: string;
      title: string;
      originalName: string;
      objectKey: string;
      createdAt: Date;
      campaignId: string | null;
      campaignName: string | null;
      characterId: string | null;
      characterName: string | null;
    }[]
  >`
    SELECT a.id, a.kind, a.title, a.original_name, a.object_key, a.created_at,
      a.campaign_id, c.name AS campaign_name, a.character_id, ch.name AS character_name
    FROM attachments a
    LEFT JOIN campaigns c ON c.id = a.campaign_id
    LEFT JOIN characters ch ON ch.id = a.character_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at
  `;

  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2)), "daten.json");

  // Gleichnamige Kampagnen/Charaktere bekommen getrennte Ordner
  const folders = new Map<string, string>();
  const usedFolders = new Set<string>();
  const folderFor = (a: (typeof rows)[number]) => {
    const key = a.campaignId ?? a.characterId!;
    let folder = folders.get(key);
    if (!folder) {
      folder = a.campaignId
        ? `Anhänge/Kampagnen/${uniqueIn(usedFolders, safeSegment(a.campaignName, "Kampagne"))}`
        : `Anhänge/Charaktere/${uniqueIn(usedFolders, safeSegment(a.characterName, "Charakter"))}`;
      folders.set(key, folder);
    }
    return folder;
  };

  const usedFiles = new Set<string>();
  for (const a of rows) {
    const base = safeSegment(a.title || a.originalName.replace(/\.[^.]+$/, ""), "Anhang");
    const path = uniqueIn(usedFiles, `${folderFor(a)}/${base}`, a.kind === "pdf" ? ".pdf" : ".webp");
    zip.addReadStreamLazy(path, { compress: false, mtime: new Date(a.createdAt) }, cb => {
      storage.get(a.objectKey).then(
        obj => {
          if (obj) return cb(null, obj.body);
          console.warn(`[export] Objekt fehlt im Speicher: ${a.objectKey}`);
          cb(null, Readable.from([Buffer.from("Diese Datei fehlt im Speicher.\n")]));
        },
        err => cb(err as Error, undefined as never)
      );
    });
  }
  zip.end();
  return zip;
}
