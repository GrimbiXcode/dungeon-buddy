import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { idParam, noContent, notFound, parse } from "../lib/http.js";
import { onlyGiven } from "../lib/crud.js";

export const CAMPAIGN_THEMES = [
  "arcane",
  "dragon",
  "feywild",
  "underdark",
  "frost",
  "desert",
  "forest",
  "parchment",
] as const;

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).default(""),
  theme: z.enum(CAMPAIGN_THEMES).default("arcane"),
  ruleset: z.enum(["2014", "2024"]).default("2024"),
});

export async function campaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", async req => {
    return sql`
      SELECT c.*,
        (SELECT count(*)::int FROM journal_entries j WHERE j.campaign_id = c.id) AS journal_count,
        (SELECT count(*)::int FROM npcs n WHERE n.campaign_id = c.id) AS npc_count,
        (SELECT count(*)::int FROM characters ch WHERE ch.campaign_id = c.id) AS character_count,
        (SELECT count(*)::int FROM spells s WHERE s.campaign_id = c.id) AS spell_count
      FROM campaigns c
      WHERE c.user_id = ${req.user!.id}
      ORDER BY c.archived_at NULLS FIRST, c.updated_at DESC
    `;
  });

  app.get("/api/campaigns/:campaignId", async req => {
    const [row] = await sql`SELECT * FROM campaigns WHERE id = ${idParam(req, "campaignId")} AND user_id = ${req.user!.id}`;
    if (!row) throw notFound("Kampagne");
    return row;
  });

  app.post("/api/campaigns", async (req, reply) => {
    const input = parse(campaignSchema, req.body);
    const [row] = await sql`
      INSERT INTO campaigns ${sql({ ...input, userId: req.user!.id })}
      RETURNING *
    `;
    return reply.code(201).send(row);
  });

  app.patch("/api/campaigns/:campaignId", async req => {
    const input = parse(
      campaignSchema.partial().extend({ archived: z.boolean().optional() }),
      req.body
    );
    const { archived, ...fields } = onlyGiven(input, req.body) as typeof input;
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) values[k] = v;
    if (archived !== undefined) values.archivedAt = archived ? new Date() : null;
    const id = idParam(req, "campaignId");
    const [row] = Object.keys(values).length
      ? await sql`
          UPDATE campaigns SET ${sql(values)}, updated_at = now()
          WHERE id = ${id} AND user_id = ${req.user!.id}
          RETURNING *
        `
      : await sql`SELECT * FROM campaigns WHERE id = ${id} AND user_id = ${req.user!.id}`;
    if (!row) throw notFound("Kampagne");
    return row;
  });

  app.delete("/api/campaigns/:campaignId", async (req, reply) => {
    const result = await sql`DELETE FROM campaigns WHERE id = ${idParam(req, "campaignId")} AND user_id = ${req.user!.id}`;
    if (result.count === 0) throw notFound("Kampagne");
    return noContent(reply);
  });
}
