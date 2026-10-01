import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { migrate, sql } from "./db.js";
import { SESSION_COOKIE, signSession } from "./auth/session.js";
import { issueLoginCode } from "./auth/login-codes.js";
import { findOrCreateUser } from "./lib/users.js";
import { resetRateLimits } from "./lib/rate-limit.js";

/**
 * Integrationstests gegen eine echte PostgreSQL-Datenbank
 * (TEST_DATABASE_URL, Standard: postgres://dnd:dnd@localhost:5432/dungeonbuddy_test).
 */
let app: FastifyInstance;

async function cookieFor(telegramId: number) {
  const user = await findOrCreateUser(telegramId, `User ${telegramId}`);
  return { user, cookie: `${SESSION_COOKIE}=${await signSession({ userId: user.id, tokenVersion: user.tokenVersion })}` };
}

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
  await sql`DELETE FROM users`;
  await sql`DELETE FROM login_codes`;
});

describe("Anmeldung", () => {
  it("ohne Sitzung 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("Login-Code funktioniert genau einmal", async () => {
    const code = await issueLoginCode(1001, "Elara");
    const first = await app.inject({ method: "POST", url: "/api/auth/code", payload: { code } });
    expect(first.statusCode).toBe(200);
    expect(first.json().displayName).toBe("Elara");
    expect(first.headers["set-cookie"]).toContain(SESSION_COOKIE);

    const second = await app.inject({ method: "POST", url: "/api/auth/code", payload: { code } });
    expect(second.statusCode).toBe(401);
  });

  it("nicht freigeschaltete Telegram-ID wird abgewiesen", async () => {
    const code = await issueLoginCode(5555, "Fremd");
    const res = await app.inject({ method: "POST", url: "/api/auth/code", payload: { code } });
    expect(res.statusCode).toBe(403);
    expect((await sql`SELECT count(*)::int AS n FROM users`)[0]!.n).toBe(0);
  });

  it("Rate-Limit gegen Durchprobieren", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: "POST", url: "/api/auth/code", payload: { code: "000000" } });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });

  it("Überall abmelden widerruft alte Sitzungen", async () => {
    const { cookie } = await cookieFor(1001);
    const out = await app.inject({ method: "POST", url: "/api/auth/logout-all", headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe("Kampagnen und Tools", () => {
  it("Daten sind pro Benutzer getrennt", async () => {
    const a = await cookieFor(1001);
    const b = await cookieFor(1002);
    const created = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie: a.cookie },
      payload: { name: "Strahd", ruleset: "2014" },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const npc = await app.inject({
      method: "POST",
      url: `/api/campaigns/${id}/npcs`,
      headers: { cookie: a.cookie },
      payload: { name: "Ismark" },
    });
    expect(npc.statusCode).toBe(201);

    for (const url of [`/api/campaigns/${id}`, `/api/campaigns/${id}/npcs`, `/api/campaigns/${id}/journal`]) {
      const res = await app.inject({ method: "GET", url, headers: { cookie: b.cookie } });
      expect(res.statusCode).toBe(404);
    }
    const listB = await app.inject({ method: "GET", url: "/api/campaigns", headers: { cookie: b.cookie } });
    expect(listB.json()).toEqual([]);
  });

  it("Teil-Updates überschreiben keine anderen Felder", async () => {
    const { cookie } = await cookieFor(1001);
    const c = (
      await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "X", ruleset: "2014", theme: "frost" } })
    ).json();
    const patched = (
      await app.inject({ method: "PATCH", url: `/api/campaigns/${c.id}`, headers: { cookie }, payload: { archived: true } })
    ).json();
    expect(patched.archivedAt).not.toBeNull();
    expect(patched.ruleset).toBe("2014");
    expect(patched.theme).toBe("frost");
  });

  it("Beziehungen nur zwischen NPCs derselben Kampagne", async () => {
    const { cookie } = await cookieFor(1001);
    const c1 = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "1" } })).json();
    const c2 = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "2" } })).json();
    const n1 = (await app.inject({ method: "POST", url: `/api/campaigns/${c1.id}/npcs`, headers: { cookie }, payload: { name: "A" } })).json();
    const n2 = (await app.inject({ method: "POST", url: `/api/campaigns/${c2.id}/npcs`, headers: { cookie }, payload: { name: "B" } })).json();
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${c1.id}/relations`,
      headers: { cookie },
      payload: { fromNpcId: n1.id, toNpcId: n2.id, label: "kennt" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Kalenderdaten kommen als YYYY-MM-DD zurück", async () => {
    const { cookie } = await cookieFor(1001);
    const c = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "D" } })).json();
    const e = await app.inject({
      method: "POST",
      url: `/api/campaigns/${c.id}/journal`,
      headers: { cookie },
      payload: { sessionNumber: 1, sessionDate: "2026-09-24", title: "Start" },
    });
    expect(e.json().sessionDate).toBe("2026-09-24");
  });

  it("Charakterbogen mit Revisionsprüfung", async () => {
    const { cookie } = await cookieFor(1001);
    const c = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "K" } })).json();
    const ch = (
      await app.inject({ method: "POST", url: `/api/campaigns/${c.id}/characters`, headers: { cookie }, payload: { name: "Thorin", data: { ac: 18 } } })
    ).json();
    const url = `/api/campaigns/${c.id}/characters/${ch.id}`;
    const ok = await app.inject({ method: "PUT", url, headers: { cookie }, payload: { name: "Thorin", data: { ac: 19 }, revision: 1 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().revision).toBe(2);
    const stale = await app.inject({ method: "PUT", url, headers: { cookie }, payload: { name: "Thorin", data: { ac: 20 }, revision: 1 } });
    expect(stale.statusCode).toBe(409);
  });
});

describe("Konto löschen", () => {
  it("entfernt alle Daten des Benutzers", async () => {
    const { cookie, user } = await cookieFor(1001);
    const other = await cookieFor(1002);
    const c = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "Weg" } })).json();
    await app.inject({ method: "POST", url: `/api/campaigns/${c.id}/journal`, headers: { cookie }, payload: { title: "Tag 1" } });
    await app.inject({ method: "POST", url: `/api/campaigns/${c.id}/characters`, headers: { cookie }, payload: { name: "X" } });
    await app.inject({ method: "POST", url: `/api/campaigns/${c.id}/spells`, headers: { cookie }, payload: { name: "Fireball", level: 3 } });
    await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie: other.cookie }, payload: { name: "Bleibt" } });
    await issueLoginCode(1001, "Elara");

    const wrong = await app.inject({ method: "DELETE", url: "/api/me", headers: { cookie }, payload: { confirm: "nein" } });
    expect(wrong.statusCode).toBe(400);

    const res = await app.inject({ method: "DELETE", url: "/api/me", headers: { cookie }, payload: { confirm: "LÖSCHEN" } });
    expect(res.statusCode).toBe(204);

    const count = async (table: string) => (await sql`SELECT count(*)::int AS n FROM ${sql(table)}`)[0]!.n as number;
    expect((await sql`SELECT count(*)::int AS n FROM users WHERE id = ${user.id}`)[0]!.n).toBe(0);
    expect(await count("journal_entries")).toBe(0);
    expect(await count("characters")).toBe(0);
    expect(await count("spells")).toBe(0);
    expect(await count("login_codes")).toBe(0);
    expect(await count("campaigns")).toBe(1);
  });

  it("Export enthält die eigenen Daten", async () => {
    const { cookie } = await cookieFor(1001);
    await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie }, payload: { name: "Export" } });
    const res = await app.inject({ method: "GET", url: "/api/me/export", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().campaigns).toHaveLength(1);
  });
});

describe("SRD", () => {
  it("liefert beide Zauberlisten", async () => {
    for (const r of ["2014", "2024"]) {
      const res = await app.inject({ method: "GET", url: `/api/srd/spells/${r}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().spells.length).toBeGreaterThan(300);
    }
  });
});
