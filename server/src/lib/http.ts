import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const notFound = (what = "Eintrag") => new HttpError(404, `${what} nicht gefunden.`);

/** Validiert einen Wert gegen ein Zod-Schema und wirft bei Fehlern 400. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HttpError(400, `Ungültige Eingabe – ${where}${issue?.message ?? "unbekannt"}`);
  }
  return result.data;
}

export const uuid = z.uuid();

export function idParam(req: FastifyRequest, name = "id"): string {
  return parse(uuid, (req.params as Record<string, string>)[name]);
}

export function noContent(reply: FastifyReply) {
  return reply.code(204).send();
}
