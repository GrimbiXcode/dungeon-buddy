import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { assertQuota, countRows, limitUser } from "../lib/abuse.js";
import { onlyGiven } from "../lib/crud.js";
import { HttpError, idParam, noContent, notFound, parse } from "../lib/http.js";

/**
 * Eigene Bibliothek und Freunde.
 *
 * Bibliothekseinträge sind eigenständige Kopien (Fähigkeiten, Angriffe,
 * Rüstungen, Zauber). Freunde finden sich nur über einen persönlichen Code
 * und müssen die Anfrage bestätigen. Wer seine Bibliothek teilt, macht sie
 * für alle Freunde sichtbar; die können Einträge in die eigene Bibliothek
 * kopieren.
 */

const KINDS = ["feature", "attack", "armor", "spell"] as const;
const MAX_DATA_CHARS = 200_000;

const itemSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(1).max(200),
  ruleset: z.enum(["2014", "2024"]).nullable().default(null),
  data: z.record(z.string(), z.unknown()).default({}),
});

function checkSize(data: unknown) {
  if (JSON.stringify(data ?? {}).length > MAX_DATA_CHARS) throw new HttpError(400, "Eintrag ist zu gross.");
}

const assertLibraryQuota = (req: FastifyRequest) =>
  assertQuota(req, "libraryItemsPerUser", () => countRows("library_items", "user_id", req.user!.id));

// ── Freundescode ─────────────────────────────────────────────────────────

/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Eingabe vereinheitlichen: Grossbuchstaben, ohne Leer- und Trennzeichen. */
export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function assignCode(userId: string, replace: boolean): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const [row] = replace
        ? await sql<{ friendCode: string }[]>`UPDATE users SET friend_code = ${code} WHERE id = ${userId} RETURNING friend_code`
        : await sql<{ friendCode: string }[]>`
            UPDATE users SET friend_code = COALESCE(friend_code, ${code}) WHERE id = ${userId} RETURNING friend_code
          `;
      return row!.friendCode;
    } catch (e) {
      // Kollision mit einem bestehenden Code: neu versuchen
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new HttpError(500, "Freundescode konnte nicht erzeugt werden.");
}

// ── Freundschaften ───────────────────────────────────────────────────────

type Friendship = { requesterId: string; addresseeId: string; status: "pending" | "accepted" };

async function friendshipBetween(a: string, b: string): Promise<Friendship | null> {
  const [row] = await sql<Friendship[]>`
    SELECT requester_id, addressee_id, status FROM friendships
    WHERE (requester_id = ${a} AND addressee_id = ${b}) OR (requester_id = ${b} AND addressee_id = ${a})
  `;
  return row ?? null;
}

/** Freund mit geteilter Bibliothek, sonst 404 (verrät nicht, ob es den Benutzer gibt). */
async function requireSharedLibrary(req: FastifyRequest) {
  const friendId = idParam(req, "userId");
  const link = await friendshipBetween(req.user!.id, friendId);
  if (!link || link.status !== "accepted") throw notFound("Freund");
  const [friend] = await sql<{ id: string; displayName: string; libraryShared: boolean }[]>`
    SELECT id, display_name, library_shared FROM users WHERE id = ${friendId} AND blocked_at IS NULL
  `;
  if (!friend) throw notFound("Freund");
  if (!friend.libraryShared) throw new HttpError(403, `${friend.displayName} teilt die Bibliothek derzeit nicht.`);
  return friend;
}

export async function libraryRoutes(app: FastifyInstance) {
  // ── Eigene Bibliothek ───────────────────────────────────────────────────
  app.get("/api/library", async req => {
    const { kind } = parse(z.object({ kind: z.enum(KINDS).optional() }), req.query ?? {});
    return sql`
      SELECT * FROM library_items
      WHERE user_id = ${req.user!.id} ${kind ? sql`AND kind = ${kind}` : sql``}
      ORDER BY kind, lower(name)
    `;
  });

  app.post("/api/library", async (req, reply) => {
    const input = parse(itemSchema, req.body);
    checkSize(input.data);
    await assertLibraryQuota(req);
    const [row] = await sql`
      INSERT INTO library_items (user_id, kind, name, ruleset, data)
      VALUES (${req.user!.id}, ${input.kind}, ${input.name}, ${input.ruleset}, ${sql.json(input.data as never)})
      RETURNING *
    `;
    return reply.code(201).send(row);
  });

  app.patch("/api/library/:id", async req => {
    const input = onlyGiven(parse(itemSchema.omit({ kind: true }).partial(), req.body), req.body) as Record<string, unknown>;
    if ("data" in input) {
      checkSize(input.data);
      input.data = sql.json(input.data as never);
    }
    const id = idParam(req);
    const [row] = Object.keys(input).length
      ? await sql`
          UPDATE library_items SET ${sql(input)}, updated_at = now()
          WHERE id = ${id} AND user_id = ${req.user!.id} RETURNING *
        `
      : await sql`SELECT * FROM library_items WHERE id = ${id} AND user_id = ${req.user!.id}`;
    if (!row) throw notFound("Bibliothekseintrag");
    return row;
  });

  app.delete("/api/library/:id", async (req, reply) => {
    const result = await sql`DELETE FROM library_items WHERE id = ${idParam(req)} AND user_id = ${req.user!.id}`;
    if (!result.count) throw notFound("Bibliothekseintrag");
    return noContent(reply);
  });

  /** Bibliothek mit allen Freunden teilen oder nicht. */
  app.put("/api/library/sharing", async req => {
    const { shared } = parse(z.object({ shared: z.boolean() }), req.body);
    await sql`UPDATE users SET library_shared = ${shared} WHERE id = ${req.user!.id}`;
    return { shared };
  });

  // ── Freunde ─────────────────────────────────────────────────────────────
  app.get("/api/friends", async req => {
    const me = req.user!.id;
    const code = await assignCode(me, false);
    const [{ libraryShared }] = (await sql`SELECT library_shared FROM users WHERE id = ${me}`) as unknown as [{ libraryShared: boolean }];
    const rows = await sql<
      { userId: string; displayName: string; libraryShared: boolean; status: string; incoming: boolean; createdAt: Date; acceptedAt: Date | null }[]
    >`
      SELECT u.id AS user_id, u.display_name, u.library_shared, f.status,
        (f.addressee_id = ${me}) AS incoming, f.created_at, f.accepted_at
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ${me} THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = ${me} OR f.addressee_id = ${me}) AND u.blocked_at IS NULL
      ORDER BY lower(u.display_name)
    `;
    const person = (r: (typeof rows)[number]) => ({ userId: r.userId, displayName: r.displayName });
    return {
      code,
      libraryShared,
      friends: rows
        .filter(r => r.status === "accepted")
        .map(r => ({ ...person(r), libraryShared: r.libraryShared, since: r.acceptedAt ?? r.createdAt })),
      incoming: rows.filter(r => r.status === "pending" && r.incoming).map(r => ({ ...person(r), createdAt: r.createdAt })),
      outgoing: rows.filter(r => r.status === "pending" && !r.incoming).map(r => ({ ...person(r), createdAt: r.createdAt })),
    };
  });

  /** Neuen Freundescode erzeugen; der alte gilt danach nicht mehr. */
  app.post("/api/friends/code", async req => ({ code: await assignCode(req.user!.id, true) }));

  /** Anfrage per Freundescode. Hat der andere schon angefragt, seid ihr sofort befreundet. */
  app.post("/api/friends", async (req, reply) => {
    limitUser(req, "friendRequest");
    const me = req.user!.id;
    const code = normalizeCode(parse(z.object({ code: z.string().max(40) }), req.body).code);
    if (code.length !== CODE_LENGTH) throw new HttpError(400, "Ein Freundescode hat 10 Zeichen.");
    const [target] = await sql<{ id: string; displayName: string }[]>`
      SELECT id, display_name FROM users WHERE friend_code = ${code} AND blocked_at IS NULL
    `;
    if (!target) throw new HttpError(404, "Kein Benutzer mit diesem Freundescode.");
    if (target.id === me) throw new HttpError(400, "Das ist dein eigener Freundescode.");

    const existing = await friendshipBetween(me, target.id);
    if (existing?.status === "accepted") throw new HttpError(409, `Du bist mit ${target.displayName} bereits befreundet.`);
    if (existing && existing.requesterId === me) throw new HttpError(409, `Anfrage an ${target.displayName} ist bereits unterwegs.`);
    if (existing) {
      await sql`
        UPDATE friendships SET status = 'accepted', accepted_at = now()
        WHERE requester_id = ${target.id} AND addressee_id = ${me}
      `;
      return reply.code(201).send({ status: "accepted", displayName: target.displayName });
    }
    await assertQuota(req, "friendsPerUser", async () => {
      const [row] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM friendships WHERE requester_id = ${me} OR addressee_id = ${me}
      `;
      return row!.n;
    });
    await sql`INSERT INTO friendships (requester_id, addressee_id) VALUES (${me}, ${target.id}) ON CONFLICT DO NOTHING`;
    return reply.code(201).send({ status: "pending", displayName: target.displayName });
  });

  app.post("/api/friends/:userId/accept", async req => {
    const result = await sql`
      UPDATE friendships SET status = 'accepted', accepted_at = now()
      WHERE requester_id = ${idParam(req, "userId")} AND addressee_id = ${req.user!.id} AND status = 'pending'
    `;
    if (!result.count) throw notFound("Anfrage");
    return { status: "accepted" };
  });

  /** Anfrage ablehnen oder zurückziehen, Freundschaft beenden. */
  app.delete("/api/friends/:userId", async (req, reply) => {
    const other = idParam(req, "userId");
    const me = req.user!.id;
    const result = await sql`
      DELETE FROM friendships
      WHERE (requester_id = ${me} AND addressee_id = ${other}) OR (requester_id = ${other} AND addressee_id = ${me})
    `;
    if (!result.count) throw notFound("Freund");
    return noContent(reply);
  });

  // ── Bibliotheken von Freunden ───────────────────────────────────────────
  app.get("/api/friends/:userId/library", async req => {
    const friend = await requireSharedLibrary(req);
    const { kind } = parse(z.object({ kind: z.enum(KINDS).optional() }), req.query ?? {});
    const items = await sql`
      SELECT id, kind, name, ruleset, data, source_name, created_at, updated_at FROM library_items
      WHERE user_id = ${friend.id} ${kind ? sql`AND kind = ${kind}` : sql``}
      ORDER BY kind, lower(name)
    `;
    return { friend: { userId: friend.id, displayName: friend.displayName }, items };
  });

  /** „In eigene Bibliothek aufnehmen“: eigenständige Kopie. */
  app.post("/api/friends/:userId/library/:id/copy", async (req, reply) => {
    const friend = await requireSharedLibrary(req);
    const [item] = await sql`SELECT * FROM library_items WHERE id = ${idParam(req)} AND user_id = ${friend.id}`;
    if (!item) throw notFound("Bibliothekseintrag");
    await assertLibraryQuota(req);
    const [row] = await sql`
      INSERT INTO library_items (user_id, kind, name, ruleset, data, source_name)
      VALUES (${req.user!.id}, ${item.kind}, ${item.name}, ${item.ruleset}, ${sql.json(item.data as never)}, ${friend.displayName})
      RETURNING *
    `;
    return reply.code(201).send(row);
  });
}
