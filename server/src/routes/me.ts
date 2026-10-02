import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { clearSessionCookie } from "../auth/routes.js";
import { HttpError, noContent, parse } from "../lib/http.js";
import { publicUser, userSettingsSchema } from "../lib/users.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/api/me", async req => publicUser(req.user!));

  app.patch("/api/me", async req => {
    const input = parse(
      z.object({
        displayName: z.string().trim().min(1).max(80).optional(),
        settings: userSettingsSchema.optional(),
      }),
      req.body
    );
    const user = req.user!;
    const settings = { ...(user.settings ?? {}), ...(input.settings ?? {}) };
    const [updated] = await sql`
      UPDATE users SET
        display_name = ${input.displayName ?? user.displayName},
        settings = ${sql.json(settings)}
      WHERE id = ${user.id}
      RETURNING *
    `;
    return publicUser(updated as never);
  });

  /**
   * Konto endgültig löschen. Alle Anwendungsdaten hängen per ON DELETE
   * CASCADE am Benutzer; offene Login-Codes werden zusätzlich entfernt.
   */
  app.delete("/api/me", async (req, reply) => {
    const { confirm } = parse(z.object({ confirm: z.string() }), req.body ?? {});
    if (confirm !== "LÖSCHEN") throw new HttpError(400, 'Zur Bestätigung "LÖSCHEN" eingeben.');
    const user = req.user!;
    await sql.begin(async tx => {
      await tx`DELETE FROM login_codes WHERE telegram_id = ${user.telegramId}`;
      await tx`DELETE FROM users WHERE id = ${user.id}`;
    });
    clearSessionCookie(reply);
    return noContent(reply);
  });

  /** Datenauskunft / Export aller eigenen Daten als JSON. */
  app.get("/api/me/export", async (req, reply) => {
    const user = req.user!;
    const campaigns = await sql`SELECT * FROM campaigns WHERE user_id = ${user.id} ORDER BY created_at`;
    const ids = campaigns.map(c => c.id as string);
    const byCampaign = async (table: string) =>
      ids.length ? sql`SELECT * FROM ${sql(table)} WHERE campaign_id IN ${sql(ids)} ORDER BY created_at` : [];
    const data = {
      exportedAt: new Date().toISOString(),
      user: publicUser(user),
      campaigns,
      journalEntries: await byCampaign("journal_entries"),
      npcs: await byCampaign("npcs"),
      npcRelations: await byCampaign("npc_relations"),
      characters: await sql`SELECT * FROM characters WHERE user_id = ${user.id} ORDER BY created_at`,
      campaignCharacters: ids.length
        ? await sql`SELECT * FROM campaign_characters WHERE campaign_id IN ${sql(ids)} ORDER BY joined_at`
        : [],
      spells: await sql`SELECT * FROM spells WHERE user_id = ${user.id} ORDER BY created_at`,
      unblockRequests: await sql`SELECT * FROM unblock_requests WHERE user_id = ${user.id} ORDER BY created_at`,
      abuseEvents: await sql`SELECT event, at, detail FROM abuse_events WHERE user_id = ${user.id} ORDER BY at`,
    };
    reply.header("Content-Disposition", `attachment; filename="dungeon-buddy-export.json"`);
    return data;
  });
}
