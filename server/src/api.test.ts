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
    const url = `/api/characters/${ch.id}`;
    const ok = await app.inject({ method: "PUT", url, headers: { cookie }, payload: { name: "Thorin", data: { ac: 19 }, revision: 1 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().revision).toBe(2);
    const stale = await app.inject({ method: "PUT", url, headers: { cookie }, payload: { name: "Thorin", data: { ac: 20 }, revision: 1 } });
    expect(stale.statusCode).toBe(409);
  });
});

describe("Charaktere über Kampagnen hinweg", () => {
  async function setup() {
    const { cookie } = await cookieFor(1001);
    const post = async (url: string, payload: unknown) =>
      (await app.inject({ method: "POST", url, headers: { cookie }, payload })).json();
    const a = await post("/api/campaigns", { name: "A" });
    const b = await post("/api/campaigns", { name: "B" });
    const hero = await post("/api/characters", { name: "Thorin", data: { classes: [{ level: 3 }] }, ruleset: "2014" });
    return { cookie, post, a, b, hero };
  }

  it("ein Charakter, mehrere Kampagnen, gemeinsame Werte", async () => {
    const { cookie, post, a, b, hero } = await setup();
    expect((await app.inject({ method: "POST", url: `/api/campaigns/${a.id}/characters`, headers: { cookie }, payload: { characterId: hero.id } })).statusCode).toBe(201);
    await post(`/api/campaigns/${b.id}/characters`, { characterId: hero.id });

    // Stufenaufstieg „in Kampagne A“ …
    await app.inject({
      method: "PUT",
      url: `/api/characters/${hero.id}`,
      headers: { cookie },
      payload: { name: "Thorin", data: { classes: [{ level: 4 }] }, revision: hero.revision },
    });
    // … gilt auch in Kampagne B
    const inB = (await app.inject({ method: "GET", url: `/api/campaigns/${b.id}/characters`, headers: { cookie } })).json();
    expect(inB[0].data.classes[0].level).toBe(4);

    const list = (await app.inject({ method: "GET", url: "/api/characters", headers: { cookie } })).json();
    expect(list[0].campaigns.map((c: { name: string }) => c.name).sort()).toEqual(["A", "B"]);
  });

  it("Zauber wandern mit dem Charakter", async () => {
    const { cookie, post, a, b, hero } = await setup();
    await post(`/api/campaigns/${a.id}/characters`, { characterId: hero.id });
    await post(`/api/campaigns/${a.id}/spells`, { name: "Shield", level: 1, characterId: hero.id });
    await post(`/api/campaigns/${a.id}/spells`, { name: "Kampagnennotiz", level: 0 });
    const getSpells = async (id: string) =>
      (await app.inject({ method: "GET", url: `/api/campaigns/${id}/spells`, headers: { cookie } })).json().map((s: { name: string }) => s.name);

    expect(await getSpells(b.id)).toEqual([]);
    await post(`/api/campaigns/${b.id}/characters`, { characterId: hero.id });
    expect(await getSpells(b.id)).toEqual(["Shield"]);
    expect((await getSpells(a.id)).sort()).toEqual(["Kampagnennotiz", "Shield"]);
  });

  it("Austausch eines gestorbenen Charakters", async () => {
    const { cookie, post, a, hero } = await setup();
    await post(`/api/campaigns/${a.id}/characters`, { characterId: hero.id });
    const newbie = await post("/api/characters", { name: "Dwalin" });
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${a.id}/characters/${hero.id}/replace`,
      headers: { cookie },
      payload: { replacementId: newbie.id, reason: "Vom Drachen gefressen", markDead: true },
    });
    expect(res.statusCode).toBe(200);
    const roster = (await app.inject({ method: "GET", url: `/api/campaigns/${a.id}/characters`, headers: { cookie } })).json();
    expect(roster.map((r: { name: string; active: boolean }) => [r.name, r.active])).toEqual([
      ["Dwalin", true],
      ["Thorin", false],
    ]);
    expect(roster[1].leftReason).toBe("Vom Drachen gefressen");
    expect(roster[1].status).toBe("dead");
  });

  it("Kopie (Fork) ist unabhängig vom Original", async () => {
    const { cookie, post, a, hero } = await setup();
    await post(`/api/campaigns/${a.id}/characters`, { characterId: hero.id });
    await post(`/api/characters/${hero.id}/spells`, { name: "Light", level: 0 });
    const fork = await post(`/api/characters/${hero.id}/fork`, { name: "Thorin (Spiegelwelt)" });
    expect(fork.forkedFrom).toBe(hero.id);

    await app.inject({
      method: "PUT",
      url: `/api/characters/${fork.id}`,
      headers: { cookie },
      payload: { name: fork.name, data: { classes: [{ level: 10 }] }, revision: fork.revision },
    });
    const original = (await app.inject({ method: "GET", url: `/api/characters/${hero.id}`, headers: { cookie } })).json();
    expect(original.data.classes[0].level).toBe(3);

    const forkSpells = (await app.inject({ method: "GET", url: `/api/characters/${fork.id}/spells`, headers: { cookie } })).json();
    expect(forkSpells.map((s: { name: string }) => s.name)).toEqual(["Light"]);
    // Kopie ist keiner Kampagne zugewiesen
    const forkFull = (await app.inject({ method: "GET", url: `/api/characters/${fork.id}`, headers: { cookie } })).json();
    expect(forkFull.campaigns).toEqual([]);
    expect(forkFull.forkedFromName).toBe("Thorin");
  });

  it("fremde Charaktere sind weder sichtbar noch zuweisbar", async () => {
    const { a, hero } = await setup();
    const other = await cookieFor(1002);
    expect((await app.inject({ method: "GET", url: `/api/characters/${hero.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
    const theirs = (await app.inject({ method: "POST", url: "/api/campaigns", headers: { cookie: other.cookie }, payload: { name: "X" } })).json();
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${theirs.id}/characters`,
      headers: { cookie: other.cookie },
      payload: { characterId: hero.id },
    });
    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/campaigns/${a.id}/characters`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
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
