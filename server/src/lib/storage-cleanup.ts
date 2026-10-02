import { sql } from "../db.js";
import { getStorage } from "./storage.js";

/**
 * Löscht vorgemerkte Objekte (Tabelle storage_deletions, befüllt per
 * Trigger beim Löschen von Anhängen) aus dem Storage. Schlägt das Löschen
 * fehl, bleiben die Einträge stehen und der nächste Lauf versucht es erneut.
 */
export async function processStorageDeletions(batch = 200): Promise<number> {
  const storage = getStorage();
  if (!storage) return 0;
  let total = 0;
  for (;;) {
    const done = await sql.begin(async tx => {
      const rows = await tx<{ objectKey: string }[]>`
        SELECT object_key FROM storage_deletions ORDER BY queued_at LIMIT ${batch} FOR UPDATE SKIP LOCKED
      `;
      if (!rows.length) return 0;
      const keys = rows.map(r => r.objectKey);
      await storage.delete(keys);
      await tx`DELETE FROM storage_deletions WHERE object_key IN ${tx(keys)}`;
      return keys.length;
    });
    total += done;
    if (done < batch) return total;
  }
}

/** Löschen im Hintergrund anstossen, ohne auf den regelmässigen Job zu warten. */
export function flushStorageDeletions() {
  void processStorageDeletions().catch(e => console.warn("[storage] Löschen fehlgeschlagen:", (e as Error).message));
}

/**
 * Entfernt Objekte ohne zugehörigen Anhang, z. B. nach einem Absturz
 * mitten im Hochladen. Nur ältere Objekte, damit laufende Uploads (Objekt
 * schon da, Zeile noch nicht) nicht erfasst werden.
 */
export async function removeOrphanedObjects(minAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const storage = getStorage();
  if (!storage) return 0;
  const cutoff = Date.now() - minAgeMs;
  const candidates: string[] = [];
  for await (const obj of storage.list("a/")) {
    if (obj.lastModified.getTime() <= cutoff) candidates.push(obj.key);
  }
  let removed = 0;
  for (let i = 0; i < candidates.length; i += 1000) {
    const chunk = candidates.slice(i, i + 1000);
    const orphans = await sql<{ k: string }[]>`
      SELECT k FROM unnest(${sql.array(chunk)}::text[]) AS k
      WHERE NOT EXISTS (SELECT 1 FROM attachments a WHERE a.object_key = k OR a.thumb_key = k)
    `;
    if (orphans.length) {
      await storage.delete(orphans.map(o => o.k));
      removed += orphans.length;
    }
  }
  return removed;
}
