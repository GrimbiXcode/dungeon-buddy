import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { migrate, sql } from "./db.js";
import { SESSION_COOKIE, signSession } from "./auth/session.js";
import { findOrCreateUser } from "./lib/users.js";
import { resetRateLimits } from "./lib/rate-limit.js";

let app: FastifyInstance;

async function login(telegramId: number, name = `User ${telegramId}`) {
  const user = await findOrCreateUser(telegramId, name);
  const cookie = `${SESSION_COOKIE}=${await signSession({ userId: user.id, tokenVersion: user.tokenVersion })}`;
  const call = async (method: string, url: string, payload?: unknown) => {
    const res = await app.inject({ method: method as never, url, headers: { cookie }, payload: payload as never });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  return { user, call };
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
});

describe("Aktiver Charakter pro Kampagne", () => {
  it("einziger Charakter ist automatisch aktiv, Wechsel und Austausch", async () => {
    const { call } = await login(1001);
    const campaign = (await call("POST", "/api/campaigns", { name: "K" })).body;
    expect((await call("GET", `/api/campaigns/${campaign.id}`)).body.activeCharacterId).toBeNull();

    const a = (await call("POST", "/api/characters", { name: "A" })).body;
    const b = (await call("POST", "/api/characters", { name: "B" })).body;
    await call("POST", `/api/campaigns/${campaign.id}/characters`, { characterId: a.id });
    expect((await call("GET", `/api/campaigns/${campaign.id}`)).body.activeCharacterId).toBe(a.id);

    // Ein zweiter Charakter ändert nichts am aktiven
    await call("POST", `/api/campaigns/${campaign.id}/characters`, { characterId: b.id });
    expect((await call("GET", `/api/campaigns/${campaign.id}`)).body.activeCharacterId).toBe(a.id);

    const set = await call("PUT", `/api/campaigns/${campaign.id}/active-character`, { characterId: b.id });
    expect(set.body.activeCharacterId).toBe(b.id);
    const list = (await call("GET", "/api/campaigns")).body;
    expect(list[0].activeCharacterId).toBe(b.id);

    // Scheidet der aktive aus, bleibt der einzige verbleibende übrig
    await call("PATCH", `/api/campaigns/${campaign.id}/characters/${b.id}`, { active: false, leftReason: "Abgereist" });
    expect((await call("GET", `/api/campaigns/${campaign.id}`)).body.activeCharacterId).toBe(a.id);

    // Austausch: Ersatz übernimmt
    const c = (await call("POST", "/api/characters", { name: "C" })).body;
    await call("POST", `/api/campaigns/${campaign.id}/characters/${a.id}/replace`, { replacementId: c.id });
    expect((await call("GET", `/api/campaigns/${campaign.id}`)).body.activeCharacterId).toBe(c.id);
  });

  it("nur zugewiesene Charaktere können aktiv sein", async () => {
    const { call } = await login(1001);
    const campaign = (await call("POST", "/api/campaigns", { name: "K" })).body;
    const a = (await call("POST", "/api/characters", { name: "A" })).body;
    const res = await call("PUT", `/api/campaigns/${campaign.id}/active-character`, { characterId: a.id });
    expect(res.status).toBe(400);
  });
});

describe("Bibliothek", () => {
  it("eigene Einträge anlegen, filtern, ändern, löschen", async () => {
    const { call } = await login(1001);
    const created = await call("POST", "/api/library", { kind: "feature", name: "Durchschnaufen", ruleset: "2024", data: { benefit: "Heilt" } });
    expect(created.status).toBe(201);
    await call("POST", "/api/library", { kind: "attack", name: "Langschwert", data: { damage: "1d8" } });

    expect((await call("GET", "/api/library")).body).toHaveLength(2);
    const features = (await call("GET", "/api/library?kind=feature")).body;
    expect(features.map((i: { name: string }) => i.name)).toEqual(["Durchschnaufen"]);

    const renamed = await call("PATCH", `/api/library/${created.body.id}`, { name: "Second Wind" });
    expect(renamed.body.name).toBe("Second Wind");
    expect(renamed.body.data.benefit).toBe("Heilt");

    expect((await call("POST", "/api/library", { kind: "quatsch", name: "X" })).status).toBe(400);
    expect((await call("DELETE", `/api/library/${created.body.id}`)).status).toBe(204);
    expect((await call("GET", "/api/library")).body).toHaveLength(1);
  });

  it("fremde Einträge sind nicht erreichbar", async () => {
    const me = await login(1001);
    const other = await login(1002);
    const item = (await me.call("POST", "/api/library", { kind: "armor", name: "Schild" })).body;
    expect((await other.call("PATCH", `/api/library/${item.id}`, { name: "Meins" })).status).toBe(404);
    expect((await other.call("DELETE", `/api/library/${item.id}`)).status).toBe(404);
    expect((await other.call("GET", "/api/library")).body).toEqual([]);
  });
});

describe("Freunde", () => {
  async function friends() {
    const elara = await login(1001, "Elara");
    const borin = await login(1002, "Borin");
    const code = (await borin.call("GET", "/api/friends")).body.code as string;
    return { elara, borin, code };
  }

  it("Anfrage per Code, Bestätigung, Liste", async () => {
    const { elara, borin, code } = await friends();
    expect(code).toMatch(/^[A-Z0-9]{10}$/);
    // Code bleibt stabil
    expect((await borin.call("GET", "/api/friends")).body.code).toBe(code);

    const req = await elara.call("POST", "/api/friends", { code: `${code.slice(0, 5)}-${code.slice(5).toLowerCase()}` });
    expect(req.status).toBe(201);
    expect(req.body).toEqual({ status: "pending", displayName: "Borin" });
    expect((await elara.call("POST", "/api/friends", { code })).status).toBe(409);

    const borinView = (await borin.call("GET", "/api/friends")).body;
    expect(borinView.incoming.map((f: { displayName: string }) => f.displayName)).toEqual(["Elara"]);
    expect(borinView.friends).toEqual([]);

    expect((await borin.call("POST", `/api/friends/${elara.user.id}/accept`)).status).toBe(200);
    const elaraView = (await elara.call("GET", "/api/friends")).body;
    expect(elaraView.friends.map((f: { displayName: string }) => f.displayName)).toEqual(["Borin"]);
    expect(elaraView.outgoing).toEqual([]);
  });

  it("gegenseitige Anfrage verbindet sofort; eigener und falscher Code", async () => {
    const { elara, borin, code } = await friends();
    const elaraCode = (await elara.call("GET", "/api/friends")).body.code;
    await elara.call("POST", "/api/friends", { code });
    const back = await borin.call("POST", "/api/friends", { code: elaraCode });
    expect(back.body.status).toBe("accepted");
    expect((await elara.call("POST", "/api/friends", { code: elaraCode })).status).toBe(400);
    expect((await elara.call("POST", "/api/friends", { code: "ABCDEFGHJK" })).status).toBe(404);
  });

  it("neuer Code macht den alten ungültig", async () => {
    const { elara, borin, code } = await friends();
    const renewed = (await borin.call("POST", "/api/friends/code")).body.code;
    expect(renewed).not.toBe(code);
    expect((await elara.call("POST", "/api/friends", { code })).status).toBe(404);
    expect((await elara.call("POST", "/api/friends", { code: renewed })).status).toBe(201);
  });

  it("geteilte Bibliothek ansehen und Kopie aufnehmen", async () => {
    const { elara, borin, code } = await friends();
    const item = (await borin.call("POST", "/api/library", { kind: "feature", name: "Taktisches Verständnis", ruleset: "2024", data: { benefit: "+1W10" } })).body;

    // Noch nicht befreundet
    expect((await elara.call("GET", `/api/friends/${borin.user.id}/library`)).status).toBe(404);
    await elara.call("POST", "/api/friends", { code });
    expect((await elara.call("GET", `/api/friends/${borin.user.id}/library`)).status).toBe(404);
    await borin.call("POST", `/api/friends/${elara.user.id}/accept`);

    // Befreundet, aber nicht geteilt
    expect((await elara.call("GET", `/api/friends/${borin.user.id}/library`)).status).toBe(403);
    await borin.call("PUT", "/api/library/sharing", { shared: true });
    expect((await elara.call("GET", "/api/friends")).body.friends[0].libraryShared).toBe(true);

    const shared = (await elara.call("GET", `/api/friends/${borin.user.id}/library`)).body;
    expect(shared.friend.displayName).toBe("Borin");
    expect(shared.items.map((i: { name: string }) => i.name)).toEqual(["Taktisches Verständnis"]);

    const copy = await elara.call("POST", `/api/friends/${borin.user.id}/library/${item.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body.sourceName).toBe("Borin");
    expect(copy.body.data.benefit).toBe("+1W10");

    // Die Kopie ist eigenständig
    await borin.call("DELETE", `/api/library/${item.id}`);
    expect((await elara.call("GET", "/api/library")).body.map((i: { name: string }) => i.name)).toEqual(["Taktisches Verständnis"]);

    // Freundschaft beenden sperrt den Zugriff wieder
    expect((await elara.call("DELETE", `/api/friends/${borin.user.id}`)).status).toBe(204);
    expect((await elara.call("GET", `/api/friends/${borin.user.id}/library`)).status).toBe(404);
  });

  it("Export enthält Bibliothek und Freundschaften", async () => {
    const { elara, code } = await friends();
    await elara.call("POST", "/api/friends", { code });
    await elara.call("POST", "/api/library", { kind: "spell", name: "Schild", data: { level: 1 } });
    const exported = (await elara.call("GET", "/api/me/export")).body;
    expect(exported.libraryItems).toHaveLength(1);
    expect(exported.friendships).toHaveLength(1);
  });
});
