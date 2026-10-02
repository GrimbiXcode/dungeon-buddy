import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { getAbuseOverview } from "../lib/abuse-alert.js";
import { QUOTAS, recordAbuse } from "../lib/abuse.js";
import { blockUser, notifyBlocked, notifyUnblocked, notifyUnblockRejected, unblockUser } from "../lib/blocking.js";
import { HttpError, idParam, notFound, parse } from "../lib/http.js";
import { BLOCK_REASONS, findUserById } from "../lib/users.js";

/**
 * Admin-API. Der Zugriff wird zentral in app.ts geprüft (role = 'admin').
 * Telegram-IDs werden hier bewusst nicht ausgegeben.
 */
export async function adminRoutes(app: FastifyInstance) {
  // ── Benutzer ────────────────────────────────────────────────────────────
  app.get("/api/admin/users", async req => {
    const q = parse(
      z.object({ search: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }),
      req.query
    );
    const pattern = q.search ? `%${q.search.toLowerCase().replace(/[%_\\]/g, "\\$&")}%` : null;
    const entries = await sql`
      SELECT u.id, u.display_name, u.role, u.created_at, u.blocked_at, u.blocked_reason,
        (SELECT count(*)::int FROM campaigns c WHERE c.user_id = u.id) AS campaigns,
        (SELECT count(*)::int FROM characters ch WHERE ch.user_id = u.id) AS characters
      FROM users u
      ${pattern ? sql`WHERE lower(u.display_name) LIKE ${pattern}` : sql``}
      ORDER BY u.blocked_at DESC NULLS LAST, u.created_at DESC
      LIMIT ${q.limit}
    `;
    const [counts] = await sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE blocked_at IS NOT NULL)::int AS blocked FROM users
    `;
    return { entries, total: counts!.total, blocked: counts!.blocked };
  });

  app.post("/api/admin/users/:id/block", async req => {
    const id = idParam(req);
    const { reason } = parse(z.object({ reason: z.enum(BLOCK_REASONS) }), req.body);
    if (id === req.user!.id) throw new HttpError(400, "Du kannst dich nicht selbst sperren.");
    const target = await findUserById(id);
    if (!target) throw notFound("Benutzer");
    if (target.role === "admin") throw new HttpError(403, "Admins können nicht gesperrt werden.");
    const blocked = await blockUser(id, reason);
    if (!blocked) throw new HttpError(409, "Das Konto ist bereits gesperrt.");
    recordAbuse("user.blocked", id, { reason, by: req.user!.id });
    notifyBlocked(blocked, reason);
    return { ok: true };
  });

  app.post("/api/admin/users/:id/unblock", async req => {
    const id = idParam(req);
    if (!(await findUserById(id))) throw notFound("Benutzer");
    const user = await unblockUser(id);
    if (!user) throw new HttpError(409, "Das Konto ist nicht gesperrt.");
    await sql`
      UPDATE unblock_requests SET status = 'approved', review_note = 'Manuell entsperrt', reviewed_at = now()
      WHERE user_id = ${id} AND status = 'pending'
    `;
    recordAbuse("user.unblocked", id, { by: req.user!.id });
    notifyUnblocked(user);
    return { ok: true };
  });

  // ── Entsperr-Anträge ────────────────────────────────────────────────────
  app.get("/api/admin/unblock-requests", async req => {
    const q = parse(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }), req.query);
    return sql`
      SELECT r.id, r.user_id, r.message, r.status, r.review_note, r.reviewed_at, r.created_at,
        u.display_name, u.blocked_at, u.blocked_reason
      FROM unblock_requests r JOIN users u ON u.id = r.user_id
      ${q.status ? sql`WHERE r.status = ${q.status}` : sql``}
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 200
    `;
  });

  app.post("/api/admin/unblock-requests/:id/review", async req => {
    const id = idParam(req);
    const input = parse(
      z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).default("") }),
      req.body
    );
    if (input.decision === "rejected" && !input.note) throw new HttpError(400, "Für eine Ablehnung ist eine Begründung nötig.");
    const [request] = await sql<{ userId: string }[]>`
      UPDATE unblock_requests SET status = ${input.decision}, review_note = ${input.note}, reviewed_at = now()
      WHERE id = ${id} AND status = 'pending'
      RETURNING user_id
    `;
    if (!request) throw new HttpError(409, "Antrag nicht gefunden oder bereits bearbeitet.");
    recordAbuse("unblock.reviewed", request.userId, { decision: input.decision, by: req.user!.id });
    if (input.decision === "approved") {
      const user = await unblockUser(request.userId);
      if (user) {
        recordAbuse("user.unblocked", user.id, { by: req.user!.id, reason: "unblock_approved" });
        notifyUnblocked(user);
      }
    } else {
      const user = await findUserById(request.userId);
      if (user) notifyUnblockRejected(user, input.note);
    }
    return { ok: true };
  });

  // ── Missbrauch & System ─────────────────────────────────────────────────
  app.get("/api/admin/abuse", async () => getAbuseOverview());

  app.get("/api/admin/system", async () => {
    const [db] = await sql`SELECT version() AS version, pg_database_size(current_database())::bigint AS size_bytes`;
    const migrations = await sql`SELECT name, applied_at FROM schema_migrations ORDER BY name`;
    const tables = await sql`
      SELECT relname AS name, n_live_tup::int AS rows FROM pg_stat_user_tables ORDER BY relname
    `;
    return {
      database: { version: db!.version, sizeBytes: Number(db!.sizeBytes) },
      migrations,
      tables,
      quotas: QUOTAS,
      node: process.version,
    };
  });
}
