import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import yauzl from "yauzl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { migrate, sql } from "./db.js";
import { SESSION_COOKIE, signSession } from "./auth/session.js";
import { findOrCreateUser } from "./lib/users.js";
import { resetRateLimits } from "./lib/rate-limit.js";
import { MemoryStorage, setStorage } from "./lib/storage.js";
import { processStorageDeletions, removeOrphanedObjects } from "./lib/storage-cleanup.js";

/**
 * Anhänge (Integrationstests gegen PostgreSQL wie api.test.ts; der Storage
 * liegt im Arbeitsspeicher).
 */
let app: FastifyInstance;
const storage = new MemoryStorage();

async function cookieFor(telegramId: number) {
  const user = await findOrCreateUser(telegramId, `User ${telegramId}`);
  return { user, cookie: `${SESSION_COOKIE}=${await signSession({ userId: user.id, tokenVersion: user.tokenVersion })}` };
}

/** multipart/form-data von Hand: Felder zuerst, dann die Datei. */
function form(file: Buffer, filename: string, fields: Record<string, string> = {}) {
  const boundary = `----dungeonbuddy${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function photoWithGps() {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: "#335577" } })
    .jpeg()
    .withExif({ IFD0: { Make: "Handy" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "47/1 22/1 0/1" } })
    .toBuffer();
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

async function upload(cookie: string, url: string, file: Buffer, filename: string, fields: Record<string, string> = {}) {
  const f = form(file, filename, fields);
  return app.inject({ method: "POST", url, payload: f.payload, headers: { ...f.headers, cookie } });
}

/** ZIP lesen: Pfad → Inhalt */
function unzip(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const files = new Map<string, Buffer>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          const chunks: Buffer[] = [];
          stream.on("data", c => chunks.push(c));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(files));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

async function newCharacter(cookie: string, name = "Elara") {
  const res = await app.inject({ method: "POST", url: "/api/characters", headers: { cookie }, payload: { name } });
  return res.json().id as string;
}

async function setPortrait(cookie: string, characterId: string, file: Buffer, filename = "portrait.jpg") {
  const f = form(file, filename);
  return app.inject({ method: "PUT", url: `/api/characters/${characterId}/portrait`, payload: f.payload, headers: { ...f.headers, cookie } });
}

async function newCampaign(cookie: string) {
  const res = await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "Strahd" } });
  return res.json().id as string;
}

beforeAll(async () => {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate();
  setStorage(storage);
  app = await buildApp();
});

afterAll(async () => {
  setStorage(null);
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  resetRateLimits();
  setStorage(storage);
  storage.objects.clear();
  await sql`DELETE FROM users`;
  await sql`DELETE FROM storage_deletions`;
});

describe("Hochladen", () => {
  it("Foto: Metadaten entfernt, als WebP mit Vorschaubild gespeichert", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const res = await upload(cookie, `/api/campaigns/${campaignId}/attachments`, await photoWithGps(), "C:\\Fotos\\Spieltisch.jpg", {
      title: "Sitzung 3",
      category: "table",
    });
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a).toMatchObject({ kind: "image", category: "table", title: "Sitzung 3", originalName: "Spieltisch.jpg", hasThumb: true });
    expect(a.width).toBe(640);
    expect(a.objectKey).toBeUndefined();
    expect(storage.objects.size).toBe(2);
    // Keys ohne Dateinamen und ohne Benutzer
    for (const key of storage.objects.keys()) expect(key).toMatch(new RegExp(`^a/${a.id}/(full|thumb)\\.webp$`));

    const full = await app.inject({ method: "GET", url: `/api/attachments/${a.id}/content`, headers: { cookie } });
    expect(full.statusCode).toBe(200);
    expect(full.headers["content-type"]).toBe("image/webp");
    expect(full.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(full.rawPayload).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();

    const thumb = await app.inject({ method: "GET", url: `/api/attachments/${a.id}/content?variant=thumb`, headers: { cookie } });
    expect(thumb.statusCode).toBe(200);
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(480);

    const cached = await app.inject({
      method: "GET",
      url: `/api/attachments/${a.id}/content`,
      headers: { cookie, "if-none-match": String(full.headers.etag) },
    });
    expect(cached.statusCode).toBe(304);
  });

  it("PDF wird unverändert gespeichert und unterstützt Byte-Bereiche", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const res = await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "Regeln.pdf", { category: "rules" });
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a).toMatchObject({ kind: "pdf", mimeType: "application/pdf", sizeBytes: PDF.length, hasThumb: false });

    const full = await app.inject({ method: "GET", url: `/api/attachments/${a.id}/content`, headers: { cookie } });
    expect(full.rawPayload.equals(PDF)).toBe(true);
    expect(full.headers["content-disposition"]).toContain("Regeln.pdf");

    const part = await app.inject({ method: "GET", url: `/api/attachments/${a.id}/content`, headers: { cookie, range: "bytes=0-4" } });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("%PDF-");
    expect(part.headers["content-range"]).toBe(`bytes 0-4/${PDF.length}`);

    const thumb = await app.inject({ method: "GET", url: `/api/attachments/${a.id}/content?variant=thumb`, headers: { cookie } });
    expect(thumb.statusCode).toBe(404);
  });

  it("lehnt unerlaubte Typen ab, unabhängig vom Dateinamen", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const url = `/api/campaigns/${campaignId}/attachments`;
    const svg = await upload(cookie, url, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "karte.png");
    expect(svg.statusCode).toBe(415);
    const heic = await upload(cookie, url, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(64)]), "IMG_0001.HEIC");
    expect(heic.statusCode).toBe(415);
    expect(heic.json().error).toContain("HEIC");
    const broken = await upload(cookie, url, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]), "kaputt.jpg");
    expect(broken.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM attachments`)[0]!.n).toBe(0);
  });

  it("Charakter-Anhänge", async () => {
    const { cookie } = await cookieFor(1001);
    const ch = (await app.inject({ method: "POST", url: "/api/characters", headers: { cookie }, payload: { name: "Elara" } })).json();
    const res = await upload(cookie, `/api/characters/${ch.id}/attachments`, await photoWithGps(), "portrait.jpg", { category: "portrait" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ characterId: ch.id, campaignId: null, category: "portrait" });
    const list = await app.inject({ method: "GET", url: `/api/characters/${ch.id}/attachments`, headers: { cookie } });
    expect(list.json()).toHaveLength(1);
  });

  it("ohne konfigurierten Storage 503", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    setStorage(null);
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}/attachments`, headers: { cookie } });
    expect(res.statusCode).toBe(503);
    const info = await app.inject({ method: "GET", url: "/api/auth/info" });
    expect(info.json().attachments).toBe(false);
  });
});

describe("Zugriff", () => {
  it("fremde Anhänge sind unsichtbar", async () => {
    const a = await cookieFor(1001);
    const b = await cookieFor(1002);
    const campaignId = await newCampaign(a.cookie);
    const att = (await upload(a.cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "x.pdf")).json();

    for (const [method, url] of [
      ["GET", `/api/campaigns/${campaignId}/attachments`],
      ["GET", `/api/attachments/${att.id}/content`],
      ["PATCH", `/api/attachments/${att.id}`],
      ["DELETE", `/api/attachments/${att.id}`],
    ] as const) {
      const res = await app.inject({ method, url, headers: { cookie: b.cookie }, payload: method === "PATCH" ? { title: "x" } : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const foreignUpload = await upload(b.cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "y.pdf");
    expect(foreignUpload.statusCode).toBe(404);
    expect(storage.objects.size).toBe(1);
  });

  it("Titel und Kategorie ändern", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const att = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "x.pdf", { category: "rules" })).json();
    const res = await app.inject({ method: "PATCH", url: `/api/attachments/${att.id}`, headers: { cookie }, payload: { title: "Spielerhandbuch" } });
    expect(res.json()).toMatchObject({ title: "Spielerhandbuch", category: "rules" });
  });
});

describe("Löschen", () => {
  it("Anhang löschen entfernt die Objekte", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const att = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, await photoWithGps(), "a.jpg")).json();
    const res = await app.inject({ method: "DELETE", url: `/api/attachments/${att.id}`, headers: { cookie } });
    expect(res.statusCode).toBe(204);
    // Die Route stösst das Löschen selbst an
    await vi.waitFor(() => expect(storage.objects.size).toBe(0));
  });

  it("Kampagne und Konto löschen entfernen die Dateien mit", async () => {
    const { cookie } = await cookieFor(1001);
    const c1 = await newCampaign(cookie);
    const c2 = await newCampaign(cookie);
    await upload(cookie, `/api/campaigns/${c1}/attachments`, PDF, "a.pdf");
    await upload(cookie, `/api/campaigns/${c2}/attachments`, PDF, "b.pdf");
    expect(storage.objects.size).toBe(2);

    await app.inject({ method: "DELETE", url: `/api/campaigns/${c1}`, headers: { cookie } });
    expect((await sql`SELECT count(*)::int AS n FROM storage_deletions`)[0]!.n).toBe(1);
    expect(await processStorageDeletions()).toBe(1);
    expect(storage.objects.size).toBe(1);

    await app.inject({ method: "DELETE", url: "/api/me", headers: { cookie }, payload: { confirm: "LÖSCHEN" } });
    await processStorageDeletions();
    expect(storage.objects.size).toBe(0);
  });

  it("verwaiste Objekte werden aufgeräumt, zugeordnete bleiben", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "a.pdf");
    await storage.put("a/00000000-0000-0000-0000-000000000000/full.webp", Buffer.from("x"), "image/webp");
    expect(await removeOrphanedObjects(0)).toBe(1);
    expect(storage.objects.size).toBe(1);
  });
});

describe("Porträt", () => {
  it("setzen, ersetzen und entfernen", async () => {
    const { cookie } = await cookieFor(1001);
    const id = await newCharacter(cookie);
    const first = await setPortrait(cookie, id, await photoWithGps());
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ category: "portrait", characterId: id });
    const ch = (await app.inject({ method: "GET", url: `/api/characters/${id}`, headers: { cookie } })).json();
    expect(ch.portraitId).toBe(first.json().id);

    const second = await setPortrait(cookie, id, await photoWithGps());
    expect(second.statusCode).toBe(200);
    const list = (await app.inject({ method: "GET", url: "/api/characters", headers: { cookie } })).json();
    expect(list[0].portraitId).toBe(second.json().id);
    // Das alte Porträt ist samt Dateien weg
    await vi.waitFor(() => expect(storage.objects.size).toBe(2));
    expect((await sql`SELECT count(*)::int AS n FROM attachments`)[0]!.n).toBe(1);

    const removed = await app.inject({ method: "DELETE", url: `/api/characters/${id}/portrait`, headers: { cookie } });
    expect(removed.statusCode).toBe(204);
    const after = (await app.inject({ method: "GET", url: `/api/characters/${id}`, headers: { cookie } })).json();
    expect(after.portraitId).toBeNull();
    await vi.waitFor(() => expect(storage.objects.size).toBe(0));
  });

  it("nur Bilder, nur eigene Charaktere", async () => {
    const a = await cookieFor(1001);
    const b = await cookieFor(1002);
    const id = await newCharacter(a.cookie);
    expect((await setPortrait(a.cookie, id, PDF, "x.pdf")).statusCode).toBe(415);
    expect((await setPortrait(b.cookie, id, await photoWithGps())).statusCode).toBe(404);
    expect(storage.objects.size).toBe(0);
  });

  it("eine Kopie des Charakters bekommt ein eigenes Porträt", async () => {
    const { cookie } = await cookieFor(1001);
    const id = await newCharacter(cookie);
    const portrait = (await setPortrait(cookie, id, await photoWithGps())).json();
    const fork = await app.inject({ method: "POST", url: `/api/characters/${id}/fork`, headers: { cookie }, payload: {} });
    expect(fork.statusCode).toBe(201);
    const copyPortrait = fork.json().portraitId;
    expect(copyPortrait).toBeTruthy();
    expect(copyPortrait).not.toBe(portrait.id);
    expect(storage.objects.size).toBe(4);

    // Original löschen: Das Porträt der Kopie bleibt
    await app.inject({ method: "DELETE", url: `/api/characters/${id}`, headers: { cookie } });
    await processStorageDeletions();
    expect(storage.objects.size).toBe(2);
    const img = await app.inject({ method: "GET", url: `/api/attachments/${copyPortrait}/content`, headers: { cookie } });
    expect(img.statusCode).toBe(200);
  });
});

describe("Export mit Anhängen", () => {
  it("ZIP enthält daten.json und die Dateien nach Kampagne und Charakter", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "regeln.pdf", { title: "Regeln" });
    await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "regeln.pdf", { title: "Regeln" });
    await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "../../böse:name.pdf");
    const charId = await newCharacter(cookie, "Elara/Sturmwind");
    await setPortrait(cookie, charId, await photoWithGps());

    const res = await app.inject({ method: "GET", url: "/api/me/export/files", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    const files = await unzip(res.rawPayload);
    expect([...files.keys()].sort()).toEqual(
      [
        "daten.json",
        "Anhänge/Kampagnen/Strahd/Regeln.pdf",
        "Anhänge/Kampagnen/Strahd/Regeln (2).pdf",
        "Anhänge/Kampagnen/Strahd/böse_name.pdf",
        "Anhänge/Charaktere/Elara_Sturmwind/portrait.webp",
      ].sort()
    );
    expect(files.get("Anhänge/Kampagnen/Strahd/Regeln.pdf")!.equals(PDF)).toBe(true);
    const data = JSON.parse(files.get("daten.json")!.toString());
    expect(data.attachments).toHaveLength(4);
    expect(data.campaigns[0].id).toBe(campaignId);
  });

  it("auch gesperrte Konten dürfen exportieren; Rate-Limit greift", async () => {
    const { user, cookie } = await cookieFor(1001);
    await sql`UPDATE users SET blocked_at = now() WHERE id = ${user.id}`;
    const ok = await app.inject({ method: "GET", url: "/api/me/export/files", headers: { cookie } });
    expect(ok.statusCode).toBe(200);
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await app.inject({ method: "GET", url: "/api/me/export/files", headers: { cookie } })).statusCode;
    expect(last).toBe(429);
  });
});

describe("NPC-Bild", () => {
  it("setzen, ersetzen; mit dem NPC gelöscht", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const npc = (await app.inject({ method: "POST", url: `/api/campaigns/${campaignId}/npcs`, headers: { cookie }, payload: { name: "Ismark" } })).json();
    const put = async () => {
      const f = form(await photoWithGps(), "ismark.jpg");
      return app.inject({ method: "PUT", url: `/api/campaigns/${campaignId}/npcs/${npc.id}/image`, payload: f.payload, headers: { ...f.headers, cookie } });
    };
    const first = await put();
    expect(first.statusCode).toBe(200);
    const second = (await put()).json();
    const list = (await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}/npcs`, headers: { cookie } })).json();
    expect(list[0].imageId).toBe(second.id);
    // In der Galerie der Kampagne liegt nur das aktuelle Bild
    const gallery = (await app.inject({ method: "GET", url: `/api/campaigns/${campaignId}/attachments`, headers: { cookie } })).json();
    expect(gallery.map((a: { id: string }) => a.id)).toEqual([second.id]);

    await app.inject({ method: "DELETE", url: `/api/campaigns/${campaignId}/npcs/${npc.id}`, headers: { cookie } });
    expect((await sql`SELECT count(*)::int AS n FROM attachments`)[0]!.n).toBe(0);
    await processStorageDeletions();
    await vi.waitFor(() => expect(storage.objects.size).toBe(0));
  });

  it("nur NPCs der eigenen Kampagne", async () => {
    const a = await cookieFor(1001);
    const b = await cookieFor(1002);
    const campaignId = await newCampaign(a.cookie);
    const npc = (await app.inject({ method: "POST", url: `/api/campaigns/${campaignId}/npcs`, headers: { cookie: a.cookie }, payload: { name: "Ismark" } })).json();
    const f = form(await photoWithGps(), "x.jpg");
    const res = await app.inject({ method: "PUT", url: `/api/campaigns/${campaignId}/npcs/${npc.id}/image`, payload: f.payload, headers: { ...f.headers, cookie: b.cookie } });
    expect(res.statusCode).toBe(404);
  });
});

describe("PDF-Vorschaubild", () => {
  it("einmal setzbar, nur für PDFs", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const pdf = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "a.pdf")).json();
    const put = async (id: string, file: Buffer) => {
      const f = form(file, "thumb.png");
      return app.inject({ method: "PUT", url: `/api/attachments/${id}/thumb`, payload: f.payload, headers: { ...f.headers, cookie } });
    };
    const png = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#fff" } }).png().toBuffer();
    const res = await put(pdf.id, png);
    expect(res.statusCode).toBe(200);
    expect(res.json().hasThumb).toBe(true);
    expect(res.json().sizeBytes).toBeGreaterThan(PDF.length);
    const thumb = await app.inject({ method: "GET", url: `/api/attachments/${pdf.id}/content?variant=thumb`, headers: { cookie } });
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect((await sharp(thumb.rawPayload).metadata()).height).toBe(480);

    expect((await put(pdf.id, png)).statusCode).toBe(409);
    expect((await put(pdf.id, PDF)).statusCode).toBe(409);
    const img = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, await photoWithGps(), "b.jpg")).json();
    expect((await put(img.id, png)).statusCode).toBe(400);
  });

  it("lehnt Nicht-Bilder ab", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const pdf = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, PDF, "a.pdf")).json();
    const f = form(PDF, "thumb.png");
    const res = await app.inject({ method: "PUT", url: `/api/attachments/${pdf.id}/thumb`, payload: f.payload, headers: { ...f.headers, cookie } });
    expect(res.statusCode).toBe(415);
  });
});

describe("Verwendung", () => {
  it("zählt Verweise in Tagebuch, NPCs, Charakteren und Kampagnen", async () => {
    const { cookie } = await cookieFor(1001);
    const campaignId = await newCampaign(cookie);
    const a = (await upload(cookie, `/api/campaigns/${campaignId}/attachments`, await photoWithGps(), "karte.jpg")).json();
    const ref = `![Karte](attachment:${a.id})`;
    await app.inject({ method: "POST", url: `/api/campaigns/${campaignId}/journal`, headers: { cookie }, payload: { content: `Heute: ${ref}` } });
    await app.inject({ method: "POST", url: `/api/campaigns/${campaignId}/journal`, headers: { cookie }, payload: { content: "ohne Bild" } });
    await app.inject({ method: "POST", url: `/api/campaigns/${campaignId}/npcs`, headers: { cookie }, payload: { name: "Ismark", notes: ref } });
    await app.inject({ method: "PATCH", url: `/api/campaigns/${campaignId}`, headers: { cookie }, payload: { description: ref } });
    const usage = (await app.inject({ method: "GET", url: `/api/attachments/${a.id}/usage`, headers: { cookie } })).json();
    expect(usage).toEqual({ journalEntries: 1, npcs: 1, characters: 0, campaigns: 1 });
  });
});
