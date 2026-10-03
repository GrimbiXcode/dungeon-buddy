import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { HttpError, idParam, noContent, notFound, parse } from "../lib/http.js";
import { assertQuota, countRows } from "../lib/abuse.js";
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

/**
 * Aktiver Charakter: der gewählte, solange er aktiv zugewiesen ist; sonst der
 * einzige aktive Charakter der Kampagne (Alias der Kampagne: c).
 */
export const activeCharacterSql = () => sql`
  COALESCE(
    (SELECT cc.character_id FROM campaign_characters cc
     WHERE cc.campaign_id = c.id AND cc.character_id = c.main_character_id AND cc.active),
    (SELECT (array_agg(cc.character_id))[1] FROM campaign_characters cc
     WHERE cc.campaign_id = c.id AND cc.active HAVING count(*) = 1)
  )
`;

/** Aktueller aktiver Charakter einer Kampagne (null = keiner). */
export async function activeCharacterOf(campaignId: string): Promise<string | null> {
  const [row] = await sql<{ id: string | null }[]>`SELECT ${activeCharacterSql()} AS id FROM campaigns c WHERE c.id = ${campaignId}`;
  return row?.id ?? null;
}

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).default(""),
  theme: z.enum(CAMPAIGN_THEMES).default("arcane"),
  ruleset: z.enum(["2014", "2024"]).default("2024"),
});

export async function campaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", async req => {
    return sql`
      SELECT c.*, ${activeCharacterSql()} AS active_character_id,
        (SELECT count(*)::int FROM journal_entries j WHERE j.campaign_id = c.id) AS journal_count,
        (SELECT count(*)::int FROM npcs n WHERE n.campaign_id = c.id) AS npc_count,
        (SELECT count(*)::int FROM attachments a WHERE a.campaign_id = c.id) AS attachment_count,
        (SELECT count(*)::int FROM campaign_characters cc WHERE cc.campaign_id = c.id AND cc.active) AS character_count,
        (SELECT count(*)::int FROM spells s WHERE s.campaign_id = c.id OR s.character_id IN (
          SELECT character_id FROM campaign_characters cc WHERE cc.campaign_id = c.id AND cc.active
        )) AS spell_count
      FROM campaigns c
      WHERE c.user_id = ${req.user!.id}
      ORDER BY c.archived_at NULLS FIRST, c.updated_at DESC
    `;
  });

  app.get("/api/campaigns/:campaignId", async req => {
    const [row] = await sql`
      SELECT c.*, ${activeCharacterSql()} AS active_character_id
      FROM campaigns c WHERE c.id = ${idParam(req, "campaignId")} AND c.user_id = ${req.user!.id}
    `;
    if (!row) throw notFound("Kampagne");
    return row;
  });

  /** Aktiven Charakter festlegen (muss der Kampagne aktiv zugewiesen sein). */
  app.put("/api/campaigns/:campaignId/active-character", async req => {
    const campaignId = idParam(req, "campaignId");
    const { characterId } = parse(z.object({ characterId: z.uuid().nullable() }), req.body);
    const [own] = await sql`SELECT id FROM campaigns WHERE id = ${campaignId} AND user_id = ${req.user!.id}`;
    if (!own) throw notFound("Kampagne");
    if (characterId) {
      const [assigned] = await sql`
        SELECT 1 FROM campaign_characters WHERE campaign_id = ${campaignId} AND character_id = ${characterId} AND active
      `;
      if (!assigned) throw new HttpError(400, "Charakter ist dieser Kampagne nicht zugewiesen.");
    }
    await sql`UPDATE campaigns SET main_character_id = ${characterId} WHERE id = ${campaignId}`;
    return { activeCharacterId: await activeCharacterOf(campaignId) };
  });

  app.post("/api/campaigns", async (req, reply) => {
    const input = parse(campaignSchema, req.body);
    await assertQuota(req, "campaignsPerUser", () => countRows("campaigns", "user_id", req.user!.id));
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
    return { ...row, activeCharacterId: await activeCharacterOf(id) };
  });

  app.delete("/api/campaigns/:campaignId", async (req, reply) => {
    const result = await sql`DELETE FROM campaigns WHERE id = ${idParam(req, "campaignId")} AND user_id = ${req.user!.id}`;
    if (result.count === 0) throw notFound("Kampagne");
    return noContent(reply);
  });
}
