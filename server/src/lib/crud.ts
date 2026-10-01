import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "../db.js";
import { idParam, noContent, notFound, parse } from "./http.js";

/** Stellt sicher, dass die Kampagne existiert und dem Benutzer gehört. */
export async function requireCampaign(req: FastifyRequest) {
  const campaignId = idParam(req, "campaignId");
  const rows = await sql<{ id: string; ruleset: string }[]>`
    SELECT id, ruleset FROM campaigns WHERE id = ${campaignId} AND user_id = ${req.user!.id}
  `;
  if (!rows[0]) throw notFound("Kampagne");
  return rows[0];
}

/**
 * Zod setzt auch in partiellen Schemas Standardwerte ein. Bei Änderungen
 * dürfen aber nur die tatsächlich mitgeschickten Felder geschrieben werden.
 */
export function onlyGiven(parsed: Record<string, unknown>, body: unknown) {
  const given = new Set(Object.keys((body ?? {}) as object));
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => given.has(k)));
}

type CrudOptions<S extends z.ZodObject> = {
  /** URL-Segment unter /api/campaigns/:campaignId/ */
  path: string;
  table: string;
  /** Schema für das Anlegen; für Änderungen wird es partiell verwendet. */
  schema: S;
  /** Felder, die als jsonb gespeichert werden. */
  jsonFields?: string[];
  orderBy: string;
  /** Zusätzliche Prüfungen (z. B. Fremdschlüssel innerhalb der Kampagne). */
  validate?: (campaignId: string, input: Partial<z.infer<S>>) => Promise<void>;
};

/**
 * Generische CRUD-Routen für kampagnenbezogene Tool-Daten. Jede Abfrage ist
 * über die Kampagne an den angemeldeten Benutzer gebunden.
 */
export function campaignCrud<S extends z.ZodObject>(app: FastifyInstance, opts: CrudOptions<S>) {
  const base = `/api/campaigns/:campaignId/${opts.path}`;
  const table = sql(opts.table);
  const jsonFields = new Set(opts.jsonFields ?? []);

  const prepare = (input: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      out[k] = jsonFields.has(k) ? sql.json(v as never) : v;
    }
    return out;
  };

  app.get(base, async req => {
    const campaign = await requireCampaign(req);
    return sql`SELECT * FROM ${table} WHERE campaign_id = ${campaign.id} ORDER BY ${sql.unsafe(opts.orderBy)}`;
  });

  app.get(`${base}/:id`, async req => {
    const campaign = await requireCampaign(req);
    const [row] = await sql`SELECT * FROM ${table} WHERE id = ${idParam(req)} AND campaign_id = ${campaign.id}`;
    if (!row) throw notFound();
    return row;
  });

  app.post(base, async (req, reply) => {
    const campaign = await requireCampaign(req);
    const input = parse(opts.schema, req.body) as Record<string, unknown>;
    await opts.validate?.(campaign.id, input as never);
    const values = { ...prepare(input), campaignId: campaign.id };
    const [row] = await sql`INSERT INTO ${table} ${sql(values)} RETURNING *`;
    return reply.code(201).send(row);
  });

  app.patch(`${base}/:id`, async req => {
    const campaign = await requireCampaign(req);
    const id = idParam(req);
    const input = onlyGiven(parse(opts.schema.partial(), req.body) as Record<string, unknown>, req.body);
    await opts.validate?.(campaign.id, input as never);
    const values = prepare(input);
    if (Object.keys(values).length === 0) {
      const [row] = await sql`SELECT * FROM ${table} WHERE id = ${id} AND campaign_id = ${campaign.id}`;
      if (!row) throw notFound();
      return row;
    }
    const [row] = await sql`
      UPDATE ${table} SET ${sql(values)}, updated_at = now()
      WHERE id = ${id} AND campaign_id = ${campaign.id}
      RETURNING *
    `;
    if (!row) throw notFound();
    return row;
  });

  app.delete(`${base}/:id`, async (req, reply) => {
    const campaign = await requireCampaign(req);
    const result = await sql`DELETE FROM ${table} WHERE id = ${idParam(req)} AND campaign_id = ${campaign.id}`;
    if (result.count === 0) throw notFound();
    return noContent(reply);
  });
}
