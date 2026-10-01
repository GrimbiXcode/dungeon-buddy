import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { HttpError, idParam, notFound, parse } from "../lib/http.js";
import { campaignCrud, requireCampaign } from "../lib/crud.js";

const text = (max: number) => z.string().max(max);
const attitude = z.number().int().min(-2).max(2);

async function assertNpcsInCampaign(campaignId: string, ids: (string | undefined)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x));
  if (!wanted.length) return;
  const rows = await sql`SELECT id FROM npcs WHERE campaign_id = ${campaignId} AND id IN ${sql(wanted)}`;
  if (rows.length !== new Set(wanted).size) throw new HttpError(400, "NPC gehört nicht zu dieser Kampagne.");
}

async function assertCharacterInCampaign(campaignId: string, id: string | null | undefined) {
  if (!id) return;
  const rows = await sql`SELECT id FROM characters WHERE campaign_id = ${campaignId} AND id = ${id}`;
  if (!rows.length) throw new HttpError(400, "Charakter gehört nicht zu dieser Kampagne.");
}

export async function toolRoutes(app: FastifyInstance) {
  // ── Tagebuch ────────────────────────────────────────────────────────────
  campaignCrud(app, {
    path: "journal",
    table: "journal_entries",
    orderBy: "session_number DESC NULLS LAST, ingame_day DESC NULLS LAST, created_at DESC",
    schema: z.object({
      sessionNumber: z.number().int().min(0).max(100000).nullable().default(null),
      sessionDate: z.iso.date().nullable().default(null),
      ingameDay: z.number().int().min(-1000000).max(1000000).nullable().default(null),
      ingameDate: text(200).default(""),
      title: text(300).default(""),
      content: text(200_000).default(""),
    }),
  });

  // ── Soziales Netzwerk ───────────────────────────────────────────────────
  campaignCrud(app, {
    path: "npcs",
    table: "npcs",
    orderBy: "name ASC",
    schema: z.object({
      name: z.string().trim().min(1).max(200),
      role: text(200).default(""),
      faction: text(200).default(""),
      location: text(200).default(""),
      status: z.enum(["alive", "dead", "missing", "unknown"]).default("alive"),
      attitude: attitude.default(0),
      relation: text(500).default(""),
      description: text(20_000).default(""),
      notes: text(50_000).default(""),
      tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
    }),
  });

  campaignCrud(app, {
    path: "relations",
    table: "npc_relations",
    orderBy: "created_at ASC",
    schema: z.object({
      fromNpcId: z.uuid(),
      toNpcId: z.uuid(),
      label: text(200).default(""),
      attitude: attitude.default(0),
      notes: text(5000).default(""),
    }),
    validate: async (campaignId, input) => {
      if (input.fromNpcId && input.fromNpcId === input.toNpcId) {
        throw new HttpError(400, "Eine Beziehung braucht zwei verschiedene NPCs.");
      }
      await assertNpcsInCampaign(campaignId, [input.fromNpcId, input.toNpcId]);
    },
  });

  // ── Charakterbögen ──────────────────────────────────────────────────────
  const characterSchema = z.object({
    name: z.string().trim().min(1).max(200),
    data: z.record(z.string(), z.unknown()).default({}),
  });

  campaignCrud(app, {
    path: "characters",
    table: "characters",
    orderBy: "created_at ASC",
    jsonFields: ["data"],
    schema: characterSchema,
  });

  /**
   * Speichern mit Revisionsprüfung: Ist der Bogen inzwischen auf einem anderen
   * Gerät geändert worden, gibt es 409 statt eines stillen Überschreibens.
   */
  app.put("/api/campaigns/:campaignId/characters/:id", async req => {
    const campaign = await requireCampaign(req);
    const input = parse(
      characterSchema.extend({ revision: z.number().int().min(1) }),
      req.body
    );
    const id = idParam(req);
    const [row] = await sql`
      UPDATE characters
      SET name = ${input.name}, data = ${sql.json(input.data as never)},
          revision = revision + 1, updated_at = now()
      WHERE id = ${id} AND campaign_id = ${campaign.id} AND revision = ${input.revision}
      RETURNING *
    `;
    if (row) return row;
    const [exists] = await sql`SELECT revision FROM characters WHERE id = ${id} AND campaign_id = ${campaign.id}`;
    if (!exists) throw notFound("Charakter");
    throw new HttpError(409, "Der Charakterbogen wurde inzwischen an anderer Stelle geändert.");
  });

  // ── Zauberbuch ──────────────────────────────────────────────────────────
  campaignCrud(app, {
    path: "spells",
    table: "spells",
    orderBy: "level ASC, name ASC",
    jsonFields: ["data"],
    schema: z.object({
      characterId: z.uuid().nullable().default(null),
      srdKey: z.string().max(100).nullable().default(null),
      name: z.string().trim().min(1).max(200),
      level: z.number().int().min(0).max(9).default(0),
      data: z.record(z.string(), z.unknown()).default({}),
      prepared: z.boolean().default(false),
      alwaysPrepared: z.boolean().default(false),
      favorite: z.boolean().default(false),
      notes: text(20_000).default(""),
    }),
    validate: (campaignId, input) => assertCharacterInCampaign(campaignId, input.characterId),
  });
}
