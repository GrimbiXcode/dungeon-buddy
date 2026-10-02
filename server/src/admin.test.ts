import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { migrate, sql } from "./db.js";
import { env } from "./env.js";
import { issueLoginCode } from "./auth/login-codes.js";
import { abuseWritesSettled, QUOTAS, RATE_LIMITS, REGISTRATION_LIMITS } from "./lib/abuse.js";
import { ABUSE_ALERT_THRESHOLDS, resetAbuseAlerts, runAbuseCheck } from "./lib/abuse-alert.js";
import { resetRateLimits } from "./lib/rate-limit.js";

/**
 * Admin-Bereich und Spam-Schutz (Integrationstests gegen PostgreSQL, siehe
 * api.test.ts). Freigabeliste der Testumgebung: 1001, 1002.
 */
let app: FastifyInstance;
const original = { ...env };

beforeAll(async () => {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate();
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

beforeEach(async () => {
  resetRateLimits();
  resetAbuseAlerts();
  await abuseWritesSettled();
  await sql`DELETE FROM users`;
  await sql`DELETE FROM login_codes`;
  await sql`DELETE FROM abuse_events`;
});

afterEach(() => {
  Object.assign(env, original);
  vi.unstubAllGlobals();
});

/** Meldet über den Bot-Code an und liefert das Sitzungs-Cookie. */
async function login(telegramId: number, remoteAddress = "127.0.0.1") {
  const code = await issueLoginCode(telegramId, `User ${telegramId}`);
  const res = await app.inject({ method: "POST", url: "/api/auth/code", payload: { code }, remoteAddress });
  const cookie = String(res.headers["set-cookie"] ?? "").split(";")[0]!;
  return { res, cookie, user: res.json() };
}

const call = (cookie: string, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });

function openRegistration() {
  env.telegramAllowedIds = [];
  env.telegramOpenRegistration = true;
}

describe("Admin-Vergabe", () => {
  it("mit Freigabeliste wird nur der erste Benutzer Admin", async () => {
    expect((await login(1001)).user.role).toBe("admin");
    expect((await login(1002)).user.role).toBe("user");
    expect((await login(1001)).user.role).toBe("admin");
  });

  it("OWNER_TELEGRAM_ID hat Vorrang und gilt bei jedem Login", async () => {
    env.ownerTelegramId = "1002";
    expect((await login(1001)).user.role).toBe("user");
    expect((await login(1002)).user.role).toBe("admin");
  });

  it("bei offener Registrierung ohne Betreiber wird niemand Admin", async () => {
    openRegistration();
    expect((await login(7001)).user.role).toBe("user");
  });
});

describe("Admin-API", () => {
  it("nur für Admins, ohne Telegram-IDs", async () => {
    const admin = await login(1001);
    const user = await login(1002);
    expect((await call(user.cookie, "GET", "/api/admin/users")).statusCode).toBe(403);
    const res = await call(admin.cookie, "GET", "/api/admin/users");
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
    expect(res.json().entries[0]).not.toHaveProperty("telegramId");
    expect((await call(admin.cookie, "GET", "/api/admin/system")).statusCode).toBe(200);
    expect((await call(admin.cookie, "GET", "/api/admin/abuse")).statusCode).toBe(200);
  });
});

describe("Sperren und Entsperren", () => {
  it("Sperre widerruft Sitzungen und beschränkt das Konto", async () => {
    const admin = await login(1001);
    const target = await login(1002);
    const block = await call(admin.cookie, "POST", `/api/admin/users/${target.user.id}/block`, { reason: "spam" });
    expect(block.statusCode).toBe(200);

    // Alte Sitzung ist ungültig
    expect((await call(target.cookie, "GET", "/api/me")).statusCode).toBe(401);

    // Neu anmelden geht, aber nur die Sperrseite ist erreichbar
    const again = await login(1002);
    expect(again.user.blockedReason).toBe("spam");
    expect((await call(again.cookie, "GET", "/api/campaigns")).statusCode).toBe(403);
    expect((await call(again.cookie, "POST", "/api/campaigns", { name: "X" })).json().error).toBe("Konto gesperrt.");
    expect((await call(again.cookie, "GET", "/api/me/export")).statusCode).toBe(200);
    expect((await call(again.cookie, "GET", "/api/unblock")).statusCode).toBe(200);

    expect((await call(admin.cookie, "POST", `/api/admin/users/${target.user.id}/block`, { reason: "spam" })).statusCode).toBe(409);
  });

  it("weder sich selbst noch andere Admins sperren", async () => {
    env.ownerTelegramId = "1001";
    const admin = await login(1001);
    expect((await call(admin.cookie, "POST", `/api/admin/users/${admin.user.id}/block`, { reason: "other" })).statusCode).toBe(400);
    await sql`UPDATE users SET role = 'admin' WHERE telegram_id = 1001`;
    const other = await login(1002);
    await sql`UPDATE users SET role = 'admin' WHERE id = ${other.user.id}`;
    expect((await call(admin.cookie, "POST", `/api/admin/users/${other.user.id}/block`, { reason: "other" })).statusCode).toBe(403);
  });

  it("Entsperr-Antrag: einer offen, Ablehnung braucht Begründung, Annahme entsperrt", async () => {
    const admin = await login(1001);
    const target = await login(1002);
    expect((await call(target.cookie, "POST", "/api/unblock", { message: "Hallo" })).statusCode).toBe(400);

    await call(admin.cookie, "POST", `/api/admin/users/${target.user.id}/block`, { reason: "abuse" });
    const blocked = await login(1002);
    expect((await call(blocked.cookie, "POST", "/api/unblock", { message: "War ein Versehen" })).statusCode).toBe(201);
    expect((await call(blocked.cookie, "POST", "/api/unblock", { message: "Nochmal" })).statusCode).toBe(409);

    const list = await call(admin.cookie, "GET", "/api/admin/unblock-requests?status=pending");
    const [request] = list.json();
    expect(request.message).toBe("War ein Versehen");

    const url = `/api/admin/unblock-requests/${request.id}/review`;
    expect((await call(admin.cookie, "POST", url, { decision: "rejected" })).statusCode).toBe(400);
    expect((await call(admin.cookie, "POST", url, { decision: "approved" })).statusCode).toBe(200);
    expect((await call(admin.cookie, "POST", url, { decision: "approved" })).statusCode).toBe(409);

    // Entsperrt: die bestehende Sitzung funktioniert wieder
    expect((await call(blocked.cookie, "GET", "/api/campaigns")).statusCode).toBe(200);
  });

  it("höchstens 3 Anträge pro Tag", async () => {
    const admin = await login(1001);
    const target = await login(1002);
    await call(admin.cookie, "POST", `/api/admin/users/${target.user.id}/block`, { reason: "abuse" });
    const blocked = await login(1002);
    for (let i = 0; i < RATE_LIMITS.unblockRequest.limit; i++) {
      await call(blocked.cookie, "POST", "/api/unblock", { message: `Antrag ${i}` });
      await sql`UPDATE unblock_requests SET status = 'rejected'`;
    }
    expect((await call(blocked.cookie, "POST", "/api/unblock", { message: "noch einer" })).statusCode).toBe(429);
  });
});

describe("Obergrenzen", () => {
  it("Kampagnen pro Konto", async () => {
    const { cookie, user } = await login(1001);
    await sql`
      INSERT INTO campaigns (user_id, name)
      SELECT ${user.id}, 'K' || g FROM generate_series(1, ${QUOTAS.campaignsPerUser}) g
    `;
    const res = await call(cookie, "POST", "/api/campaigns", { name: "Eine zu viel" });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toContain(String(QUOTAS.campaignsPerUser));
    await abuseWritesSettled();
    const [event] = await sql`SELECT event, detail FROM abuse_events`;
    expect(event).toMatchObject({ event: "limit.quota_exceeded", detail: { quota: "campaignsPerUser" } });
  });

  it("NPCs pro Kampagne (generische Tools)", async () => {
    const { cookie } = await login(1001);
    const campaign = (await call(cookie, "POST", "/api/campaigns", { name: "K" })).json();
    await sql`
      INSERT INTO npcs (campaign_id, name)
      SELECT ${campaign.id}, 'N' || g FROM generate_series(1, ${QUOTAS.npcsPerCampaign}) g
    `;
    expect((await call(cookie, "POST", `/api/campaigns/${campaign.id}/npcs`, { name: "Zu viel" })).statusCode).toBe(429);
  });
});

describe("Rate-Limits", () => {
  it("schreibende Anfragen pro Benutzer, Ereignis nur einmal pro Fenster", async () => {
    const { cookie } = await login(1001);
    const url = "/api/campaigns/00000000-0000-0000-0000-000000000000";
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      expect((await call(cookie, "DELETE", url)).statusCode).toBe(404);
    }
    expect((await call(cookie, "DELETE", url)).statusCode).toBe(429);
    expect((await call(cookie, "DELETE", url)).statusCode).toBe(429);
    await abuseWritesSettled();
    const events = await sql`SELECT detail FROM abuse_events WHERE event = 'limit.rate_limited'`;
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({ bucket: "write" });
    // Lesen ist weiter möglich
    expect((await call(cookie, "GET", "/api/campaigns")).statusCode).toBe(200);
  });
});

describe("Registrierung", () => {
  it("pro IP höchstens 3 neue Konten am Tag; bestehende Konten unberührt", async () => {
    openRegistration();
    for (let i = 0; i < REGISTRATION_LIMITS.perIpPerDay; i++) {
      expect((await login(8000 + i, "203.0.113.5")).res.statusCode).toBe(200);
    }
    expect((await login(8100, "203.0.113.5")).res.statusCode).toBe(429);
    expect((await login(8000, "203.0.113.5")).res.statusCode).toBe(200);
    expect((await login(8101, "203.0.113.6")).res.statusCode).toBe(200);
  });

  it("bei offener Registrierung höchstens 20 neue Konten pro Tag", async () => {
    openRegistration();
    await sql`
      INSERT INTO users (telegram_id, display_name)
      SELECT 90000 + g, 'U' FROM generate_series(1, ${REGISTRATION_LIMITS.perDay}) g
    `;
    const res = await login(9999);
    expect(res.res.statusCode).toBe(429);
    await abuseWritesSettled();
    const [event] = await sql`SELECT detail FROM abuse_events WHERE event = 'registration.limited'`;
    expect(event!.detail).toEqual({ reason: "instance" });
  });
});

describe("Alarm an Admins", () => {
  it("meldet Schwellen per Telegram, höchstens alle 6 Stunden", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await login(1001); // Admin
    await sql`
      INSERT INTO abuse_events (event, detail)
      SELECT 'limit.rate_limited', '{"bucket":"write"}'::jsonb
      FROM generate_series(1, ${ABUSE_ALERT_THRESHOLDS.rateLimited.threshold})
    `;
    const now = Date.now();
    expect(await runAbuseCheck(now)).toEqual(["rateLimited"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(String(body.chat_id)).toBe("1001");
    expect(await runAbuseCheck(now + 60_000)).toEqual([]);
    expect(await runAbuseCheck(now + 6 * 60 * 60 * 1000)).toEqual(["rateLimited"]);
  });
});

describe("Datenschutz", () => {
  it("Konto löschen entfernt auch Anträge und Ereignisse", async () => {
    const admin = await login(1001);
    const target = await login(1002);
    await call(admin.cookie, "POST", `/api/admin/users/${target.user.id}/block`, { reason: "spam" });
    const blocked = await login(1002);
    await call(blocked.cookie, "POST", "/api/unblock", { message: "Bitte" });
    await abuseWritesSettled();
    const del = await call(blocked.cookie, "DELETE", "/api/me", { confirm: "LÖSCHEN" });
    expect(del.statusCode).toBe(204);
    expect((await sql`SELECT count(*)::int AS n FROM unblock_requests`)[0]!.n).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM abuse_events WHERE user_id = ${target.user.id}`)[0]!.n).toBe(0);
  });
});
