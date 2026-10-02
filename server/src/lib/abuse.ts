import type { FastifyRequest } from "fastify";
import { sql } from "../db.js";
import { HttpError } from "./http.js";
import { consumeRateLimit } from "./rate-limit.js";

/**
 * Obergrenzen pro Konto bzw. Kampagne. Bewusst Code-Konstanten statt
 * Umgebungsvariablen: Sie sollen normale Spielrunden nie stören, sondern nur
 * automatisiertes Vollschreiben der Datenbank verhindern.
 */
export const QUOTAS = {
  campaignsPerUser: 100,
  charactersPerUser: 300,
  journalEntriesPerCampaign: 5000,
  npcsPerCampaign: 2000,
  relationsPerCampaign: 5000,
  spellsPerCampaign: 2000,
  spellsPerCharacter: 1000,
} as const;
export type QuotaName = keyof typeof QUOTAS;

/** Rate-Limits (festes Fenster, im Arbeitsspeicher). */
export const RATE_LIMITS = {
  /** Grundlast pro angemeldetem Benutzer, alle Anfragen */
  request: { limit: 600, windowMs: 60_000 },
  /** Schreibende Anfragen (POST/PUT/PATCH/DELETE) */
  write: { limit: 120, windowMs: 60_000 },
  /** Neue Einträge anlegen (POST) */
  create: { limit: 300, windowMs: 60 * 60_000 },
  /** Entsperr-Anträge */
  unblockRequest: { limit: 3, windowMs: 24 * 60 * 60_000 },
} as const;

/** Registrierungen (nur neue Konten). */
export const REGISTRATION_LIMITS = {
  /** Instanzweit pro 24 h, nur bei offener Registrierung ohne Freigabeliste */
  perDay: 20,
  /** Pro IP pro 24 h (nur im Arbeitsspeicher, die IP wird nie gespeichert) */
  perIpPerDay: 3,
} as const;

export const ABUSE_EVENT_RETENTION_DAYS = 90;

export type AbuseEvent =
  | "limit.rate_limited"
  | "limit.quota_exceeded"
  | "registration.limited"
  | "login.blocked_user"
  | "user.blocked"
  | "user.unblocked"
  | "unblock.requested"
  | "unblock.reviewed";

const pending = new Set<Promise<unknown>>();

/** Schreibt ein Ereignis; Fehler werden nur geloggt (fire-and-forget). */
export function recordAbuse(event: AbuseEvent, userId: string | null, detail: Record<string, unknown> = {}) {
  const write = sql`INSERT INTO abuse_events (event, user_id, detail) VALUES (${event}, ${userId}, ${sql.json(detail as never)})`
    .catch(e => console.warn("[abuse] Ereignis nicht gespeichert:", (e as Error).message))
    .finally(() => pending.delete(write));
  pending.add(write);
}

/** Wartet auf noch laufende Ereignis-Schreibvorgänge (für Tests). */
export async function abuseWritesSettled() {
  await Promise.all([...pending]);
}

function retryText(ms: number) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s >= 120 ? `${Math.ceil(s / 60)} Minuten` : `${s} Sekunden`;
}

/** Rate-Limit pro Benutzer; bei Überschreitung 429 und ein Ereignis. */
export function limitUser(req: FastifyRequest, bucket: keyof typeof RATE_LIMITS) {
  const user = req.user!;
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const result = consumeRateLimit(`${bucket}:u${user.id}`, limit, windowMs);
  if (result.allowed) return;
  // Nur das erste Überschreiten pro Fenster protokollieren
  if (result.firstDenied) recordAbuse("limit.rate_limited", user.id, { bucket });
  throw new HttpError(429, `Zu viele Anfragen. Bitte in ${retryText(result.retryAfterMs)} erneut versuchen.`);
}

/**
 * Prüft eine Obergrenze. `count` liefert den aktuellen Bestand; die Prüfung
 * ist nicht transaktional – bei gleichzeitigen Anfragen kann die Grenze um
 * wenige Einträge überschritten werden. Das ist für den Zweck ausreichend.
 */
export async function assertQuota(req: FastifyRequest, quota: QuotaName, count: () => Promise<number>) {
  const max = QUOTAS[quota];
  if ((await count()) + 1 <= max) return;
  recordAbuse("limit.quota_exceeded", req.user!.id, { quota, max });
  throw new HttpError(429, `Obergrenze erreicht: höchstens ${max} Einträge (${QUOTA_LABELS[quota]}).`);
}

const QUOTA_LABELS: Record<QuotaName, string> = {
  campaignsPerUser: "Kampagnen pro Konto",
  charactersPerUser: "Charaktere pro Konto",
  journalEntriesPerCampaign: "Tagebucheinträge pro Kampagne",
  npcsPerCampaign: "NPCs pro Kampagne",
  relationsPerCampaign: "Beziehungen pro Kampagne",
  spellsPerCampaign: "Zauber pro Kampagne",
  spellsPerCharacter: "Zauber pro Charakter",
};

/** Zählt Zeilen einer Tabelle mit einer Bedingung auf eine Spalte. */
export async function countRows(table: string, column: string, value: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(column)} = ${value}`;
  return row!.n;
}

export async function purgeOldAbuseEvents() {
  await sql`DELETE FROM abuse_events WHERE at < now() - make_interval(days => ${ABUSE_EVENT_RETENTION_DAYS})`;
}
