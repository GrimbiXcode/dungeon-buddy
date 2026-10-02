import { randomUUID } from "node:crypto";
import { sql } from "../db.js";
import { STORAGE_BYTES_PER_USER, storageUsedBy } from "./abuse.js";
import { getStorage, streamToBuffer } from "./storage.js";

/**
 * Kopiert einen Anhang samt Dateien zu einem anderen Charakter (z. B. das
 * Porträt bei einer Kopie des Charakters). Liefert die neue ID oder null,
 * wenn nicht kopiert werden konnte (Speicher aus oder voll, Datei fehlt) –
 * die Kopie des Charakters soll daran nicht scheitern.
 */
export async function copyAttachmentToCharacter(userId: string, sourceId: string, characterId: string): Promise<string | null> {
  const storage = getStorage();
  if (!storage) return null;
  const [src] = await sql`SELECT * FROM attachments WHERE id = ${sourceId} AND user_id = ${userId}`;
  if (!src) return null;
  if ((await storageUsedBy(userId)) + Number(src.sizeBytes) > STORAGE_BYTES_PER_USER) return null;

  const id = randomUUID();
  const newKey = (key: string) => `a/${id}/${key.split("/").pop()}`;
  const written: string[] = [];
  try {
    for (const key of [src.objectKey, src.thumbKey].filter(Boolean) as string[]) {
      const obj = await storage.get(key);
      if (!obj) throw new Error(`Objekt fehlt: ${key}`);
      const target = newKey(key);
      written.push(target);
      await storage.put(target, await streamToBuffer(obj.body), key.endsWith(".pdf") ? "application/pdf" : "image/webp");
    }
    await sql`
      INSERT INTO attachments ${sql({
        id,
        userId,
        characterId,
        kind: src.kind,
        category: src.category,
        title: src.title,
        description: src.description,
        originalName: src.originalName,
        mimeType: src.mimeType,
        sizeBytes: src.sizeBytes,
        width: src.width,
        height: src.height,
        objectKey: newKey(src.objectKey),
        thumbKey: src.thumbKey ? newKey(src.thumbKey) : null,
      })}
    `;
    return id;
  } catch (e) {
    console.warn("[storage] Anhang nicht kopiert:", (e as Error).message);
    if (written.length) await storage.delete(written).catch(() => {});
    return null;
  }
}
