import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { assertQuota, countRows } from "../lib/abuse.js";
import { onlyGiven, requireCampaign } from "../lib/crud.js";
import { HttpError, idParam, noContent, notFound, parse } from "../lib/http.js";

/**
 * Charaktere gehören dem Benutzer und können mehreren Kampagnen zugewiesen
 * werden (campaign_characters). Zauber eines Charakters wandern mit ihm;
 * Zauber ohne Charakter gehören zur Kampagne.
 */

const rulesetSchema = z.enum(["2014", "2024"]);
const statusSchema = z.enum(["active", "dead", "retired"]);

const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  data: z.record(z.string(), z.unknown()).default({}),
  ruleset: rulesetSchema.default("2024"),
});

const spellSchema = z.object({
  characterId: z.uuid().nullable().default(null),
  srdKey: z.string().max(100).nullable().default(null),
  name: z.string().trim().min(1).max(200),
  level: z.number().int().min(0).max(9).default(0),
  data: z.record(z.string(), z.unknown()).default({}),
  prepared: z.boolean().default(false),
  alwaysPrepared: z.boolean().default(false),
  favorite: z.boolean().default(false),
  notes: z.string().max(20_000).default(""),
});

/** Kampagnen eines Charakters als JSON-Array (für Listen). */
const campaignsJson = () => sql`
  COALESCE((
    SELECT json_agg(json_build_object(
      'campaignId', c.id, 'name', c.name, 'theme', c.theme, 'ruleset', c.ruleset,
      'archived', c.archived_at IS NOT NULL, 'active', cc.active,
      'joinedAt', cc.joined_at, 'leftAt', cc.left_at, 'leftReason', cc.left_reason
    ) ORDER BY cc.active DESC, c.name)
    FROM campaign_characters cc JOIN campaigns c ON c.id = cc.campaign_id
    WHERE cc.character_id = ch.id
  ), '[]'::json)
`;

async function requireCharacter(req: FastifyRequest, param = "characterId") {
  const id = idParam(req, param);
  const [row] = await sql`SELECT * FROM characters WHERE id = ${id} AND user_id = ${req.user!.id}`;
  if (!row) throw notFound("Charakter");
  return row as { id: string; name: string; data: Record<string, unknown>; revision: number; ruleset: string };
}

/** Charakter ist der Kampagne (aktiv) zugewiesen? */
async function isActiveInCampaign(campaignId: string, characterId: string) {
  const rows = await sql`
    SELECT 1 FROM campaign_characters WHERE campaign_id = ${campaignId} AND character_id = ${characterId} AND active
  `;
  return rows.length > 0;
}

function prepareSpell(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = k === "data" ? sql.json(v as never) : v;
  }
  return out;
}

const assertCharacterQuota = (req: FastifyRequest) =>
  assertQuota(req, "charactersPerUser", () => countRows("characters", "user_id", req.user!.id));

export async function characterRoutes(app: FastifyInstance) {
  // ── Eigene Charaktere ───────────────────────────────────────────────────
  app.get("/api/characters", async req => {
    return sql`
      SELECT ch.*, ${campaignsJson()} AS campaigns,
        (SELECT name FROM characters o WHERE o.id = ch.forked_from) AS forked_from_name
      FROM characters ch
      WHERE ch.user_id = ${req.user!.id}
      ORDER BY (ch.status = 'active') DESC, ch.updated_at DESC
    `;
  });

  app.post("/api/characters", async (req, reply) => {
    const input = parse(characterCreateSchema, req.body);
    await assertCharacterQuota(req);
    const [row] = await sql`
      INSERT INTO characters (user_id, name, data, ruleset)
      VALUES (${req.user!.id}, ${input.name}, ${sql.json(input.data as never)}, ${input.ruleset})
      RETURNING *
    `;
    return reply.code(201).send(row);
  });

  app.get("/api/characters/:characterId", async req => {
    const ch = await requireCharacter(req);
    const [row] = await sql`
      SELECT ch.*, ${campaignsJson()} AS campaigns,
        (SELECT name FROM characters o WHERE o.id = ch.forked_from) AS forked_from_name
      FROM characters ch WHERE ch.id = ${ch.id}
    `;
    return row;
  });

  /**
   * Speichern mit Revisionsprüfung: Wurde der Bogen inzwischen anderswo
   * geändert (anderes Gerät, andere Kampagne), gibt es 409.
   */
  app.put("/api/characters/:characterId", async req => {
    const ch = await requireCharacter(req);
    const input = parse(
      z.object({
        name: z.string().trim().min(1).max(200),
        data: z.record(z.string(), z.unknown()),
        revision: z.number().int().min(1),
        ruleset: rulesetSchema.optional(),
      }),
      req.body
    );
    const [row] = await sql`
      UPDATE characters
      SET name = ${input.name}, data = ${sql.json(input.data as never)},
          ruleset = COALESCE(${input.ruleset ?? null}, ruleset),
          revision = revision + 1, updated_at = now()
      WHERE id = ${ch.id} AND revision = ${input.revision}
      RETURNING *
    `;
    if (!row) throw new HttpError(409, "Der Charakterbogen wurde inzwischen an anderer Stelle geändert.");
    return row;
  });

  app.patch("/api/characters/:characterId", async req => {
    const ch = await requireCharacter(req);
    const input = onlyGiven(
      parse(
        z.object({
          name: z.string().trim().min(1).max(200).optional(),
          status: statusSchema.optional(),
          ruleset: rulesetSchema.optional(),
        }),
        req.body
      ),
      req.body
    );
    if (!Object.keys(input).length) return ch;
    const [row] = await sql`
      UPDATE characters SET ${sql(input)}, updated_at = now()
      WHERE id = ${ch.id} RETURNING *
    `;
    return row;
  });

  app.delete("/api/characters/:characterId", async (req, reply) => {
    const ch = await requireCharacter(req);
    await sql`DELETE FROM characters WHERE id = ${ch.id}`;
    return noContent(reply);
  });

  /** Kopie (Fork): eigenständiger Charakter inkl. seiner Zauber. */
  app.post("/api/characters/:characterId/fork", async (req, reply) => {
    const ch = await requireCharacter(req);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(200).optional() }), req.body ?? {});
    await assertCharacterQuota(req);
    const copy = await sql.begin(async tx => {
      const [row] = await tx`
        INSERT INTO characters (user_id, name, data, ruleset, forked_from)
        SELECT user_id, ${name ?? `${ch.name} (Kopie)`}, data, ruleset, id
        FROM characters WHERE id = ${ch.id}
        RETURNING *
      `;
      await tx`
        INSERT INTO spells (user_id, character_id, srd_key, name, level, data, prepared, always_prepared, favorite, notes)
        SELECT user_id, ${row!.id}, srd_key, name, level, data, prepared, always_prepared, favorite, notes
        FROM spells WHERE character_id = ${ch.id}
      `;
      return row;
    });
    return reply.code(201).send(copy);
  });

  // ── Zauber eines Charakters ─────────────────────────────────────────────
  app.get("/api/characters/:characterId/spells", async req => {
    const ch = await requireCharacter(req);
    return sql`SELECT * FROM spells WHERE character_id = ${ch.id} ORDER BY level, name`;
  });

  app.post("/api/characters/:characterId/spells", async (req, reply) => {
    const ch = await requireCharacter(req);
    const input = parse(spellSchema, req.body);
    await assertQuota(req, "spellsPerCharacter", () => countRows("spells", "character_id", ch.id));
    const values = { ...prepareSpell(input), characterId: ch.id, campaignId: null, userId: req.user!.id };
    const [row] = await sql`INSERT INTO spells ${sql(values)} RETURNING *`;
    return reply.code(201).send(row);
  });

  app.patch("/api/characters/:characterId/spells/:id", async req => {
    const ch = await requireCharacter(req);
    const input = onlyGiven(parse(spellSchema.partial(), req.body) as Record<string, unknown>, req.body);
    delete input.characterId;
    const values = prepareSpell(input);
    const [row] = Object.keys(values).length
      ? await sql`
          UPDATE spells SET ${sql(values)}, updated_at = now()
          WHERE id = ${idParam(req)} AND character_id = ${ch.id} RETURNING *
        `
      : await sql`SELECT * FROM spells WHERE id = ${idParam(req)} AND character_id = ${ch.id}`;
    if (!row) throw notFound("Zauber");
    return row;
  });

  app.delete("/api/characters/:characterId/spells/:id", async (req, reply) => {
    const ch = await requireCharacter(req);
    const result = await sql`DELETE FROM spells WHERE id = ${idParam(req)} AND character_id = ${ch.id}`;
    if (!result.count) throw notFound("Zauber");
    return noContent(reply);
  });

  // ── Charaktere einer Kampagne ───────────────────────────────────────────
  app.get("/api/campaigns/:campaignId/characters", async req => {
    const campaign = await requireCampaign(req);
    return sql`
      SELECT ch.*, cc.active, cc.joined_at, cc.left_at, cc.left_reason,
        (SELECT name FROM characters o WHERE o.id = ch.forked_from) AS forked_from_name
      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
      WHERE cc.campaign_id = ${campaign.id}
      ORDER BY cc.active DESC, cc.joined_at
    `;
  });

  /** Zuweisen: vorhandenen Charakter ({characterId}) oder neu anlegen ({name, data}). */
  app.post("/api/campaigns/:campaignId/characters", async (req, reply) => {
    const campaign = await requireCampaign(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    let characterId: string;
    if (body.characterId !== undefined) {
      characterId = parse(z.object({ characterId: z.uuid() }), body).characterId;
      const [own] = await sql`SELECT id FROM characters WHERE id = ${characterId} AND user_id = ${req.user!.id}`;
      if (!own) throw notFound("Charakter");
    } else {
      const input = parse(characterCreateSchema.extend({ ruleset: rulesetSchema.optional() }), body);
      await assertCharacterQuota(req);
      const [row] = await sql`
        INSERT INTO characters (user_id, name, data, ruleset)
        VALUES (${req.user!.id}, ${input.name}, ${sql.json(input.data as never)}, ${input.ruleset ?? campaign.ruleset})
        RETURNING id
      `;
      characterId = row!.id as string;
    }
    await sql`
      INSERT INTO campaign_characters (campaign_id, character_id)
      VALUES (${campaign.id}, ${characterId})
      ON CONFLICT (campaign_id, character_id)
      DO UPDATE SET active = true, left_at = NULL, left_reason = ''
    `;
    const [row] = await sql`
      SELECT ch.*, cc.active, cc.joined_at, cc.left_at, cc.left_reason
      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
      WHERE cc.campaign_id = ${campaign.id} AND cc.character_id = ${characterId}
    `;
    return reply.code(201).send(row);
  });

  /** Ausscheiden lassen bzw. wieder aktivieren. */
  app.patch("/api/campaigns/:campaignId/characters/:characterId", async req => {
    const campaign = await requireCampaign(req);
    const ch = await requireCharacter(req);
    const input = parse(z.object({ active: z.boolean(), leftReason: z.string().max(500).default("") }), req.body);
    const [row] = await sql`
      UPDATE campaign_characters
      SET active = ${input.active},
          left_at = ${input.active ? null : new Date()},
          left_reason = ${input.active ? "" : input.leftReason}
      WHERE campaign_id = ${campaign.id} AND character_id = ${ch.id}
      RETURNING *
    `;
    if (!row) throw notFound("Zuweisung");
    return row;
  });

  /** Zuweisung vollständig entfernen (inkl. Verlauf). Der Charakter bleibt erhalten. */
  app.delete("/api/campaigns/:campaignId/characters/:characterId", async (req, reply) => {
    const campaign = await requireCampaign(req);
    const ch = await requireCharacter(req);
    const result = await sql`DELETE FROM campaign_characters WHERE campaign_id = ${campaign.id} AND character_id = ${ch.id}`;
    if (!result.count) throw notFound("Zuweisung");
    return noContent(reply);
  });

  /**
   * Austauschen: Der bisherige Charakter scheidet aus (z. B. gestorben), der
   * Ersatz wird aktiv. Optional wird der alte Charakter als tot markiert.
   */
  app.post("/api/campaigns/:campaignId/characters/:characterId/replace", async req => {
    const campaign = await requireCampaign(req);
    const ch = await requireCharacter(req);
    const input = parse(
      z.object({
        replacementId: z.uuid(),
        reason: z.string().max(500).default(""),
        markDead: z.boolean().default(false),
      }),
      req.body
    );
    if (input.replacementId === ch.id) throw new HttpError(400, "Ein Charakter kann sich nicht selbst ersetzen.");
    const [replacement] = await sql`SELECT id FROM characters WHERE id = ${input.replacementId} AND user_id = ${req.user!.id}`;
    if (!replacement) throw notFound("Ersatzcharakter");
    await sql.begin(async tx => {
      const left = await tx`
        UPDATE campaign_characters SET active = false, left_at = now(), left_reason = ${input.reason}
        WHERE campaign_id = ${campaign.id} AND character_id = ${ch.id}
      `;
      if (!left.count) throw notFound("Zuweisung");
      await tx`
        INSERT INTO campaign_characters (campaign_id, character_id) VALUES (${campaign.id}, ${input.replacementId})
        ON CONFLICT (campaign_id, character_id) DO UPDATE SET active = true, left_at = NULL, left_reason = ''
      `;
      if (input.markDead) await tx`UPDATE characters SET status = 'dead', updated_at = now() WHERE id = ${ch.id}`;
    });
    return { ok: true };
  });

  // ── Zauberbuch einer Kampagne ───────────────────────────────────────────
  // Sichtbar: Zauber der Kampagne selbst und der aktiv zugewiesenen Charaktere.
  const visibleSpell = (campaignId: string) => sql`
    (campaign_id = ${campaignId} OR character_id IN (
      SELECT character_id FROM campaign_characters WHERE campaign_id = ${campaignId} AND active
    ))
  `;

  app.get("/api/campaigns/:campaignId/spells", async req => {
    const campaign = await requireCampaign(req);
    return sql`SELECT * FROM spells WHERE ${visibleSpell(campaign.id)} ORDER BY level, name`;
  });

  app.post("/api/campaigns/:campaignId/spells", async (req, reply) => {
    const campaign = await requireCampaign(req);
    const input = parse(spellSchema, req.body);
    if (input.characterId && !(await isActiveInCampaign(campaign.id, input.characterId))) {
      throw new HttpError(400, "Charakter ist dieser Kampagne nicht zugewiesen.");
    }
    if (input.characterId) {
      const characterId = input.characterId;
      await assertQuota(req, "spellsPerCharacter", () => countRows("spells", "character_id", characterId));
    } else {
      await assertQuota(req, "spellsPerCampaign", () => countRows("spells", "campaign_id", campaign.id));
    }
    const values = {
      ...prepareSpell(input),
      campaignId: input.characterId ? null : campaign.id,
      userId: req.user!.id,
    };
    const [row] = await sql`INSERT INTO spells ${sql(values)} RETURNING *`;
    return reply.code(201).send(row);
  });

  app.patch("/api/campaigns/:campaignId/spells/:id", async req => {
    const campaign = await requireCampaign(req);
    const id = idParam(req);
    const input = onlyGiven(parse(spellSchema.partial(), req.body) as Record<string, unknown>, req.body);
    if ("characterId" in input) {
      const characterId = input.characterId as string | null;
      if (characterId && !(await isActiveInCampaign(campaign.id, characterId))) {
        throw new HttpError(400, "Charakter ist dieser Kampagne nicht zugewiesen.");
      }
      // Ohne Charakter wird der Zauber zur Notiz dieser Kampagne
      input.campaignId = characterId ? null : campaign.id;
    }
    const values = prepareSpell(input);
    const [row] = Object.keys(values).length
      ? await sql`
          UPDATE spells SET ${sql(values)}, updated_at = now()
          WHERE id = ${id} AND ${visibleSpell(campaign.id)} RETURNING *
        `
      : await sql`SELECT * FROM spells WHERE id = ${id} AND ${visibleSpell(campaign.id)}`;
    if (!row) throw notFound("Zauber");
    return row;
  });

  app.delete("/api/campaigns/:campaignId/spells/:id", async (req, reply) => {
    const campaign = await requireCampaign(req);
    const result = await sql`DELETE FROM spells WHERE id = ${idParam(req)} AND ${visibleSpell(campaign.id)}`;
    if (!result.count) throw notFound("Zauber");
    return noContent(reply);
  });
}
