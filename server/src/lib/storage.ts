import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../env.js";

/**
 * Object Storage für Anhänge. Die Anwendung kennt nur diese Schnittstelle;
 * in Produktion steckt S3 (Hetzner) dahinter, lokal SeaweedFS, in Tests der
 * Arbeitsspeicher.
 */
export interface Storage {
  put(key: string, body: Buffer | Readable, contentType: string): Promise<void>;
  /** `range` im HTTP-Format ("bytes=0-1023"); null, wenn das Objekt fehlt. */
  get(key: string, range?: string): Promise<StoredObject | null>;
  /** Löscht Objekte; fehlende Keys sind kein Fehler. */
  delete(keys: string[]): Promise<void>;
  list(prefix: string): AsyncIterable<{ key: string; lastModified: Date }>;
  /** Prüft beim Start die Verbindung; legt den Bucket auf Wunsch an. */
  ensureReady?(create: boolean): Promise<void>;
}

export type StoredObject = {
  body: Readable;
  contentLength: number;
  /** Gesetzt bei Teilantworten (206) */
  contentRange?: string;
};

export class S3Storage implements Storage {
  private client: S3Client;

  constructor(
    private bucket: string,
    config: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean }
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Neuere SDK-Versionen schicken sonst immer CRC-Prüfsummen mit, an denen
      // S3-kompatible Anbieter scheitern können.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async ensureReady(create: boolean) {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      const status = (e as S3ServiceException).$metadata?.httpStatusCode;
      if (status !== 404 || !create) {
        throw new Error(`Bucket "${this.bucket}" nicht erreichbar (${status ?? (e as Error).message}).`);
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      console.log(`[storage] Bucket "${this.bucket}" angelegt.`);
    }
  }

  async put(key: string, body: Buffer | Readable, contentType: string) {
    // Upload teilt grosse Streams in Multipart-Uploads auf und bricht sie bei
    // Fehlern ab; kleine Buffer gehen als einzelnes PUT.
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
      queueSize: 2,
    }).done();
  }

  async get(key: string, range?: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }));
      return {
        body: res.Body as Readable,
        contentLength: res.ContentLength ?? 0,
        contentRange: res.ContentRange,
      };
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 416) throw new RangeNotSatisfiable();
      throw e;
    }
  }

  async delete(keys: string[]) {
    // Einzelne DeleteObject-Aufrufe statt DeleteObjects: Letzteres verlangt
    // eine Prüfsumme, die nicht jeder S3-kompatible Anbieter akzeptiert.
    const queue = [...keys];
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
  }

  async *list(prefix: string) {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) yield { key: obj.Key, lastModified: obj.LastModified ?? new Date() };
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
}

/** Für Tests und als Vorlage: alles im Arbeitsspeicher. */
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, { data: Buffer; contentType: string; lastModified: Date }>();

  async put(key: string, body: Buffer | Readable, contentType: string) {
    const data = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    this.objects.set(key, { data, contentType, lastModified: new Date() });
  }

  async get(key: string, range?: string) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    const total = obj.data.length;
    const r = range ? parseRange(range, total) : null;
    if (range && !r) throw new RangeNotSatisfiable();
    const data = r ? obj.data.subarray(r.start, r.end + 1) : obj.data;
    return {
      body: Readable.from([data]),
      contentLength: data.length,
      contentRange: r ? `bytes ${r.start}-${r.end}/${total}` : undefined,
    };
  }

  async delete(keys: string[]) {
    for (const key of keys) this.objects.delete(key);
  }

  async *list(prefix: string) {
    for (const [key, obj] of this.objects) {
      if (key.startsWith(prefix)) yield { key, lastModified: obj.lastModified };
    }
  }
}

export class RangeNotSatisfiable extends Error {}

/** Einfacher Byte-Bereich ("bytes=a-b", "bytes=a-", "bytes=-n"); keine Mehrfachbereiche. */
export function parseRange(header: string, total: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, total - Number(m[2]));
    end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (start > end || start >= total) return null;
  return { start, end };
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

let current: Storage | null | undefined;

/** Konfigurierter Storage oder null, wenn Anhänge auf dieser Instanz aus sind. */
export function getStorage(): Storage | null {
  if (current === undefined) {
    const s3 = env.s3;
    current = s3.bucket ? new S3Storage(s3.bucket, s3) : null;
  }
  return current;
}

/** Für Tests: Storage ersetzen (null = Anhänge aus). */
export function setStorage(storage: Storage | null) {
  current = storage;
}
