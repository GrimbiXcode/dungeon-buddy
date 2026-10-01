import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../lib/http.js";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/srd");
const cache = new Map<string, unknown>();

async function load(ruleset: "2014" | "2024") {
  if (!cache.has(ruleset)) {
    cache.set(ruleset, JSON.parse(await readFile(path.join(dataDir, `spells-${ruleset}.json`), "utf8")));
  }
  return cache.get(ruleset);
}

/**
 * Zauber aus dem System Reference Document (SRD 5.1 für 2014, SRD 5.2 für
 * 2024), lizenziert unter CC-BY-4.0. Öffentlich, da keine Benutzerdaten.
 */
export async function srdRoutes(app: FastifyInstance) {
  app.get("/api/srd/spells/:ruleset", async (req, reply) => {
    const { ruleset } = parse(z.object({ ruleset: z.enum(["2014", "2024"]) }), req.params);
    reply.header("Cache-Control", "public, max-age=86400");
    return load(ruleset);
  });
}
