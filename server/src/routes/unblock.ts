import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { limitUser, recordAbuse } from "../lib/abuse.js";
import { HttpError, parse } from "../lib/http.js";

export const UNBLOCK_MESSAGE_MAX = 1000;

/** Entsperr-Anträge des angemeldeten (gesperrten) Benutzers. */
export async function unblockRoutes(app: FastifyInstance) {
  /** Letzter Antrag, damit die Sperrseite den Stand zeigen kann. */
  app.get("/api/unblock", async req => {
    const [row] = await sql`
      SELECT id, status, review_note, reviewed_at, created_at FROM unblock_requests
      WHERE user_id = ${req.user!.id} ORDER BY created_at DESC LIMIT 1
    `;
    return { request: row ?? null };
  });

  app.post("/api/unblock", async (req, reply) => {
    const user = req.user!;
    if (!user.blockedAt) throw new HttpError(400, "Dein Konto ist nicht gesperrt.");
    limitUser(req, "unblockRequest");
    const { message } = parse(z.object({ message: z.string().trim().min(1).max(UNBLOCK_MESSAGE_MAX) }), req.body);
    const [row] = await sql`
      INSERT INTO unblock_requests (user_id, message) VALUES (${user.id}, ${message})
      ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING
      RETURNING id, status, review_note, reviewed_at, created_at
    `;
    if (!row) throw new HttpError(409, "Es gibt bereits einen offenen Antrag.");
    recordAbuse("unblock.requested", user.id);
    return reply.code(201).send({ request: row });
  });
}
