import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart, { type MultipartFile } from "@fastify/multipart";
import { z } from "zod";
import { sql } from "../db.js";
import { assertQuota, assertStorageQuota, countRows } from "../lib/abuse.js";
import { onlyGiven, requireCampaign } from "../lib/crud.js";
import { HttpError, idParam, noContent, notFound, parse } from "../lib/http.js";
import { getStorage, RangeNotSatisfiable } from "../lib/storage.js";
import { flushStorageDeletions } from "../lib/storage-cleanup.js";
import { processImage, processThumbnail, SNIFF_BYTES, sniff, UPLOAD_LIMITS } from "../lib/uploads.js";
import { requireCharacter } from "./characters.js";

/**
 * Anhänge (Bilder, PDFs) zu Kampagnen und Charakteren. Die Dateien gehen
 * beim Hochladen durch den Server: Typ prüfen, Bilder von Metadaten
 * befreien und verkleinern. Auch das Ausliefern läuft über den Server,
 * damit Sitzung, CSP und Browser-Cache wie beim Rest der App greifen.
 */

export const ATTACHMENT_CATEGORIES = ["portrait", "map", "notes", "table", "scene", "rules", "adventure", "other"] as const;

const metaSchema = z.object({
  title: z.string().trim().max(200).default(""),
  description: z.string().max(5000).default(""),
  category: z.enum(ATTACHMENT_CATEGORIES).default("other"),
});

/** Spalten für die API; Object-Keys bleiben intern. */
const columns = () => sql`
  id, campaign_id, character_id, kind, category, title, description, original_name,
  mime_type, size_bytes::int AS size_bytes, width, height, thumb_key IS NOT NULL AS has_thumb,
  created_at, updated_at
`;

type Target = { campaignId: string; characterId?: never } | { characterId: string; campaignId?: never };

const tooLarge = (bytes: number) => new HttpError(413, `Datei zu gross: höchstens ${Math.round(bytes / 1024 ** 2)} MB.`);

/** Dateiname ohne Pfad und Steuerzeichen, nur zur Anzeige. */
function cleanName(name: string) {
  return (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
}

/** Mehrteilige Formularfelder (vor der Datei gesendet) als einfaches Objekt. */
function fieldValues(fields: MultipartFile["fields"]) {
  const out: Record<string, string> = {};
  for (const [name, field] of Object.entries(fields)) {
    const f = Array.isArray(field) ? field[0] : field;
    if (f && f.type === "field" && typeof f.value === "string") out[name] = f.value;
  }
  return out;
}

const isFileTooLarge = (e: unknown) => (e as { code?: string })?.code === "FST_REQ_FILE_TOO_LARGE";

/**
 * Rest einer abgewiesenen Datei lesen und verwerfen. Sonst bleibt der
 * Request-Body halb gelesen liegen und die Keep-alive-Verbindung endet
 * später mit einem Reset. (resume() genügt nicht: Der Iterator hält einen
 * "readable"-Listener, solange er besteht.)
 */
async function discard(chunks: AsyncIterator<Buffer>) {
  try {
    while (!(await chunks.next()).done);
  } catch {
    /* z. B. Grössengrenze erreicht – der Rest wird dann ohnehin verworfen */
  }
}

type UploadOptions = {
  /** Kategorie fest vorgeben (überschreibt das Formularfeld) */
  category?: (typeof ATTACHMENT_CATEGORIES)[number];
  /** Nur Bilder annehmen, z. B. für Porträts */
  imagesOnly?: boolean;
};

async function receiveUpload(req: FastifyRequest, target: Target, opts: UploadOptions = {}) {
  const storage = getStorage()!;
  if (!req.isMultipart()) throw new HttpError(415, "Erwartet wird ein Formular mit Datei (multipart/form-data).");
  // Schon voll? Dann gar nicht erst lesen.
  await assertStorageQuota(req, 0);

  const part = await req.file();
  if (!part) throw new HttpError(400, "Keine Datei gesendet.");
  const chunks = part.file[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const stored: string[] = [];
  try {
    const meta = parse(metaSchema, fieldValues(part.fields));
    if (opts.category) meta.category = opts.category;
    const originalName = cleanName(part.filename);

    // Die ersten Bytes lesen und den Typ daran erkennen
    const head: Buffer[] = [];
    let headLength = 0;
    while (headLength < SNIFF_BYTES) {
      const next = await chunks.next();
      if (next.done) break;
      head.push(next.value);
      headLength += next.value.length;
    }
    const headBuf = Buffer.concat(head);
    const type = sniff(headBuf);
    if (type?.kind === "heic") {
      throw new HttpError(415, "HEIC-Fotos werden nicht unterstützt. Bitte als JPEG speichern oder direkt aus der Kamera-Auswahl hochladen.");
    }
    if (!type) throw new HttpError(415, "Dateityp nicht unterstützt. Erlaubt sind JPEG, PNG, WebP, GIF und PDF.");
    if (opts.imagesOnly && type.kind !== "image") throw new HttpError(415, "Hier sind nur Bilder möglich (JPEG, PNG, WebP, GIF).");

    const id = randomUUID();
    let row: Record<string, unknown>;
    if (type.kind === "image") {
      // Bilder komplett lesen (mit eigener, kleinerer Grenze) und verarbeiten
      const parts: Buffer[] = [headBuf];
      let total = headBuf.length;
      for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
        total += next.value.length;
        if (total > UPLOAD_LIMITS.imageBytes) throw tooLarge(UPLOAD_LIMITS.imageBytes);
        parts.push(next.value);
      }
      const maxEdge = meta.category === "map" ? UPLOAD_LIMITS.mapEdge : UPLOAD_LIMITS.imageEdge;
      const image = await processImage(Buffer.concat(parts), { maxEdge }).catch(() => {
        throw new HttpError(400, "Das Bild konnte nicht gelesen werden (beschädigt oder zu gross).");
      });
      const size = image.full.length + image.thumb.length;
      await assertStorageQuota(req, size);
      const objectKey = `a/${id}/full.webp`;
      const thumbKey = `a/${id}/thumb.webp`;
      stored.push(objectKey, thumbKey);
      await storage.put(objectKey, image.full, "image/webp");
      await storage.put(thumbKey, image.thumb, "image/webp");
      row = {
        kind: "image",
        mimeType: "image/webp",
        sizeBytes: size,
        width: image.width,
        height: image.height,
        objectKey,
        thumbKey,
      };
    } else {
      // PDFs unverändert durchreichen und dabei mitzählen
      let size = 0;
      const body = Readable.from(
        (async function* () {
          size += headBuf.length;
          yield headBuf;
          for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
            size += next.value.length;
            yield next.value;
          }
        })()
      );
      const objectKey = `a/${id}/file.pdf`;
      stored.push(objectKey);
      await storage.put(objectKey, body, type.mime);
      if (part.file.truncated) throw tooLarge(UPLOAD_LIMITS.pdfBytes);
      await assertStorageQuota(req, size);
      row = { kind: "pdf", mimeType: type.mime, sizeBytes: size, objectKey };
    }

    const [created] = await sql`
      INSERT INTO attachments ${sql({
        id,
        userId: req.user!.id,
        campaignId: target.campaignId ?? null,
        characterId: target.characterId ?? null,
        ...meta,
        originalName,
        ...row,
      })}
      RETURNING ${columns()}
    `;
    return created!;
  } catch (e) {
    await discard(chunks);
    // Nichts Halbes im Storage zurücklassen
    if (stored.length) await storage.delete(stored).catch(() => {});
    if (isFileTooLarge(e)) throw tooLarge(UPLOAD_LIMITS.pdfBytes);
    throw e;
  }
}

/**
 * Setzt ein Bild (Porträt eines Charakters, Bild eines NPCs) und löscht
 * das bisherige samt Dateien.
 */
async function setImage(table: "characters" | "npcs", column: "portrait_id" | "image_id", rowId: string, attachmentId: string) {
  const replaced = await sql.begin(async tx => {
    const [row] = await tx<{ old: string | null }[]>`SELECT ${tx(column)} AS old FROM ${tx(table)} WHERE id = ${rowId} FOR UPDATE`;
    await tx`UPDATE ${tx(table)} SET ${tx(column)} = ${attachmentId}, updated_at = now() WHERE id = ${rowId}`;
    if (!row?.old) return false;
    await tx`DELETE FROM attachments WHERE id = ${row.old}`;
    return true;
  });
  if (replaced) flushStorageDeletions();
}

/** Kleines Bild aus einem Formular lesen (für PDF-Vorschaubilder). */
async function readSmallImage(req: FastifyRequest, maxBytes: number): Promise<Buffer> {
  if (!req.isMultipart()) throw new HttpError(415, "Erwartet wird ein Formular mit Datei (multipart/form-data).");
  const part = await req.file();
  if (!part) throw new HttpError(400, "Keine Datei gesendet.");
  const chunks = part.file[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const parts: Buffer[] = [];
  let total = 0;
  try {
    for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
      total += next.value.length;
      if (total > maxBytes) throw tooLarge(maxBytes);
      parts.push(next.value);
    }
  } catch (e) {
    await discard(chunks);
    throw isFileTooLarge(e) ? tooLarge(maxBytes) : e;
  }
  const buf = Buffer.concat(parts);
  if (sniff(buf)?.kind !== "image") throw new HttpError(415, "Hier sind nur Bilder möglich (JPEG, PNG, WebP, GIF).");
  return buf;
}

async function requireAttachment(req: FastifyRequest) {
  const [row] = await sql<
    { id: string; kind: "image" | "pdf"; mimeType: string; title: string; originalName: string; objectKey: string; thumbKey: string | null }[]
  >`
    SELECT id, kind, mime_type, title, original_name, object_key, thumb_key
    FROM attachments WHERE id = ${idParam(req)} AND user_id = ${req.user!.id}
  `;
  if (!row) throw notFound("Anhang");
  return row;
}

/** Name für "Speichern unter": Titel oder Originalname mit passender Endung. */
function downloadName(a: { kind: string; title: string; originalName: string }) {
  const base = (a.title || a.originalName.replace(/\.[^.]+$/, "") || "anhang").replace(/["\\]/g, "");
  return `${base}.${a.kind === "pdf" ? "pdf" : "webp"}`;
}

async function sendContent(req: FastifyRequest, reply: FastifyReply) {
  const a = await requireAttachment(req);
  const { variant } = parse(z.object({ variant: z.enum(["full", "thumb"]).default("full") }), req.query);
  const key = variant === "thumb" ? a.thumbKey : a.objectKey;
  if (!key) throw notFound("Vorschaubild");
  const mime = variant === "thumb" ? "image/webp" : a.mimeType;

  // Inhalt eines Keys ändert sich nie: dauerhaft im Browser cachen
  const etag = `"${a.id}-${variant}"`;
  reply
    .header("ETag", etag)
    .header("Cache-Control", "private, max-age=31536000, immutable")
    .header("Accept-Ranges", "bytes");
  if (req.headers["if-none-match"] === etag) return reply.code(304).send();

  const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
  let obj;
  try {
    obj = await getStorage()!.get(key, range);
  } catch (e) {
    if (e instanceof RangeNotSatisfiable) return reply.code(416).send();
    throw e;
  }
  if (!obj) throw notFound("Datei");

  if (a.kind === "pdf") {
    // Die globale CSP (object-src 'none') hindert manche Browser daran, das
    // PDF in ihrem eingebauten Viewer anzuzeigen. helmet setzt sie direkt auf
    // der Node-Antwort, daher dort entfernen.
    reply.raw.removeHeader("Content-Security-Policy");
  } else {
    reply.header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  }
  reply
    .header("Content-Type", mime)
    .header("Content-Length", obj.contentLength)
    .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(downloadName(a))}`);
  if (obj.contentRange) reply.code(206).header("Content-Range", obj.contentRange);
  return reply.send(obj.body);
}

export async function attachmentRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: UPLOAD_LIMITS.pdfBytes,
      files: 1,
      fields: 5,
      fieldSize: 10_000,
      parts: 6,
    },
  });

  // Gilt nur für die Routen in diesem Plugin
  app.addHook("onRequest", async () => {
    if (!getStorage()) throw new HttpError(503, "Anhänge sind auf dieser Instanz nicht eingerichtet.");
  });

  // ── Kampagne ────────────────────────────────────────────────────────────
  app.get("/api/campaigns/:campaignId/attachments", async req => {
    const campaign = await requireCampaign(req);
    return sql`SELECT ${columns()} FROM attachments WHERE campaign_id = ${campaign.id} ORDER BY created_at DESC`;
  });

  app.post("/api/campaigns/:campaignId/attachments", async (req, reply) => {
    const campaign = await requireCampaign(req);
    await assertQuota(req, "attachmentsPerCampaign", () => countRows("attachments", "campaign_id", campaign.id));
    return reply.code(201).send(await receiveUpload(req, { campaignId: campaign.id }));
  });

  // ── Charakter (wandert mit ihm durch alle Kampagnen) ────────────────────
  app.get("/api/characters/:characterId/attachments", async req => {
    const ch = await requireCharacter(req);
    return sql`SELECT ${columns()} FROM attachments WHERE character_id = ${ch.id} ORDER BY created_at DESC`;
  });

  app.post("/api/characters/:characterId/attachments", async (req, reply) => {
    const ch = await requireCharacter(req);
    await assertQuota(req, "attachmentsPerCharacter", () => countRows("attachments", "character_id", ch.id));
    return reply.code(201).send(await receiveUpload(req, { characterId: ch.id }));
  });

  // ── Porträt: ersetzt ein vorhandenes ────────────────────────────────────
  app.put("/api/characters/:characterId/portrait", async req => {
    const ch = await requireCharacter(req);
    await assertQuota(req, "attachmentsPerCharacter", () => countRows("attachments", "character_id", ch.id));
    const attachment = await receiveUpload(req, { characterId: ch.id }, { category: "portrait", imagesOnly: true });
    await setImage("characters", "portrait_id", ch.id, attachment.id as string);
    return attachment;
  });

  app.delete("/api/characters/:characterId/portrait", async (req, reply) => {
    const ch = await requireCharacter(req);
    const result = await sql`DELETE FROM attachments WHERE id = (SELECT portrait_id FROM characters WHERE id = ${ch.id})`;
    if (result.count === 0) throw notFound("Porträt");
    flushStorageDeletions();
    return noContent(reply);
  });

  // ── Bild eines NPCs (ein Anhang der Kampagne) ───────────────────────────
  const requireNpc = async (req: FastifyRequest) => {
    const campaign = await requireCampaign(req);
    const [npc] = await sql<{ id: string }[]>`SELECT id FROM npcs WHERE id = ${idParam(req)} AND campaign_id = ${campaign.id}`;
    if (!npc) throw notFound("NPC");
    return { campaign, npc };
  };

  app.put("/api/campaigns/:campaignId/npcs/:id/image", async req => {
    const { campaign, npc } = await requireNpc(req);
    await assertQuota(req, "attachmentsPerCampaign", () => countRows("attachments", "campaign_id", campaign.id));
    const attachment = await receiveUpload(req, { campaignId: campaign.id }, { category: "portrait", imagesOnly: true });
    await setImage("npcs", "image_id", npc.id, attachment.id as string);
    return attachment;
  });

  app.delete("/api/campaigns/:campaignId/npcs/:id/image", async (req, reply) => {
    const { npc } = await requireNpc(req);
    const result = await sql`DELETE FROM attachments WHERE id = (SELECT image_id FROM npcs WHERE id = ${npc.id})`;
    if (result.count === 0) throw notFound("Bild");
    flushStorageDeletions();
    return noContent(reply);
  });

  // ── Einzelner Anhang ────────────────────────────────────────────────────
  app.patch("/api/attachments/:id", async req => {
    const input = onlyGiven(parse(metaSchema.partial(), req.body), req.body);
    const id = idParam(req);
    const [row] = Object.keys(input).length
      ? await sql`
          UPDATE attachments SET ${sql(input)}, updated_at = now()
          WHERE id = ${id} AND user_id = ${req.user!.id}
          RETURNING ${columns()}
        `
      : await sql`SELECT ${columns()} FROM attachments WHERE id = ${id} AND user_id = ${req.user!.id}`;
    if (!row) throw notFound("Anhang");
    return row;
  });

  app.delete("/api/attachments/:id", async (req, reply) => {
    const result = await sql`DELETE FROM attachments WHERE id = ${idParam(req)} AND user_id = ${req.user!.id}`;
    if (result.count === 0) throw notFound("Anhang");
    // Der Trigger hat die Objekte vorgemerkt
    flushStorageDeletions();
    return noContent(reply);
  });

  /**
   * Vorschaubild für ein PDF, im Browser aus der ersten Seite gerendert.
   * Nur einmal setzbar: Inhalte unter einem Key ändern sich nie (Cache).
   */
  app.put("/api/attachments/:id/thumb", async req => {
    const a = await requireAttachment(req);
    if (a.kind !== "pdf") throw new HttpError(400, "Vorschaubilder werden nur für PDFs nachgereicht.");
    if (a.thumbKey) throw new HttpError(409, "Dieses PDF hat bereits ein Vorschaubild.");
    const thumb = await processThumbnail(await readSmallImage(req, 5 * 1024 * 1024)).catch(e => {
      throw e instanceof HttpError ? e : new HttpError(400, "Das Bild konnte nicht gelesen werden.");
    });
    await assertStorageQuota(req, thumb.length);
    const key = `a/${a.id}/thumb.webp`;
    await getStorage()!.put(key, thumb, "image/webp");
    const [row] = await sql`
      UPDATE attachments SET thumb_key = ${key}, size_bytes = size_bytes + ${thumb.length}, updated_at = now()
      WHERE id = ${a.id} AND thumb_key IS NULL
      RETURNING ${columns()}
    `;
    if (!row) {
      // Gleichzeitig von anderswo gesetzt: unser Objekt wieder entfernen
      await getStorage()!.delete([key]).catch(() => {});
      throw new HttpError(409, "Dieses PDF hat bereits ein Vorschaubild.");
    }
    return row;
  });

  /** Wo ein Anhang verwendet wird (Warnung vor dem Löschen). */
  app.get("/api/attachments/:id/usage", async req => {
    const a = await requireAttachment(req);
    const pattern = `%attachment:${a.id}%`;
    const userId = req.user!.id;
    const [row] = await sql`
      SELECT
        (SELECT count(*)::int FROM journal_entries j JOIN campaigns c ON c.id = j.campaign_id
          WHERE c.user_id = ${userId} AND j.content LIKE ${pattern}) AS journal_entries,
        (SELECT count(*)::int FROM npcs n JOIN campaigns c ON c.id = n.campaign_id
          WHERE c.user_id = ${userId} AND (n.image_id = ${a.id} OR n.description LIKE ${pattern} OR n.notes LIKE ${pattern})) AS npcs,
        (SELECT count(*)::int FROM characters ch
          WHERE ch.user_id = ${userId} AND (ch.portrait_id = ${a.id} OR ch.data::text LIKE ${pattern})) AS characters,
        (SELECT count(*)::int FROM campaigns c WHERE c.user_id = ${userId} AND c.description LIKE ${pattern}) AS campaigns
    `;
    return row;
  });

  app.get("/api/attachments/:id/content", { compress: false }, sendContent);
}
