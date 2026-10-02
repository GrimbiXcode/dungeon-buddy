import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { HttpError } from "../lib/http.js";
import { campaignCrud } from "../lib/crud.js";

const text = (max: number) => z.string().max(max);
const attitude = z.number().int().min(-2).max(2);

async function assertNpcsInCampaign(campaignId: string, ids: (string | undefined)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x));
  if (!wanted.length) return;
  const rows = await sql`SELECT id FROM npcs WHERE campaign_id = ${campaignId} AND id IN ${sql(wanted)}`;
  if (rows.length !== new Set(wanted).size) throw new HttpError(400, "NPC gehört nicht zu dieser Kampagne.");
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
}
