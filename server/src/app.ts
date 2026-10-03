import { existsSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyError } from "fastify";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { env } from "./env.js";
import { sql } from "./db.js";
import { authRoutes } from "./auth/routes.js";
import { SESSION_COOKIE, verifySession } from "./auth/session.js";
import { limitUser } from "./lib/abuse.js";
import { HttpError } from "./lib/http.js";
import { findUserById, type User } from "./lib/users.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { characterRoutes } from "./routes/characters.js";
import { adminRoutes } from "./routes/admin.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { meRoutes } from "./routes/me.js";
import { libraryRoutes } from "./routes/library.js";
import { srdRoutes } from "./routes/srd.js";
import { toolRoutes } from "./routes/tools.js";
import { unblockRoutes } from "./routes/unblock.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

/** Routen, die ohne Anmeldung erreichbar sind. */
const PUBLIC_API = [
  "/api/auth/info",
  "/api/auth/code",
  "/api/auth/widget",
  "/api/auth/dev",
  "/api/auth/logout",
  "/api/health",
];

/**
 * Was ein gesperrtes Konto noch darf: sich selbst sehen, Einstellungen,
 * abmelden, Daten exportieren, Konto löschen, Entsperrung beantragen.
 */
const BLOCKED_ALLOWED = new Set([
  "GET /api/me",
  "PATCH /api/me",
  "DELETE /api/me",
  "GET /api/me/export",
  "GET /api/me/export/files",
  "POST /api/auth/logout",
  "POST /api/auth/logout-all",
  "GET /api/unblock",
  "POST /api/unblock",
]);
export const BLOCKED_MESSAGE = "Konto gesperrt.";

/** Seite, die das Telegram-Login-Widget einbettet (braucht 'unsafe-eval'). */
const TELEGRAM_FRAME = "/telegram-login.html";

export async function buildApp() {
  const app = Fastify({
    // Datenschutz: keine Request-Logs (IP-Adressen, Pfade). Nur Fehler.
    logger: { level: env.isProduction ? "error" : "warn" },
    trustProxy: env.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-src": ["'self'"],
        "frame-ancestors": ["'self'"],
        "worker-src": ["'self'"],
        "manifest-src": ["'self'"],
        "upgrade-insecure-requests": env.secureCookies ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "same-origin" },
  });

  app.decorateRequest("user", null);

  app.addHook("onRequest", async req => {
    const url = req.url.split("?")[0]!;
    if (!url.startsWith("/api/")) return;
    const session = await verifySession(req.cookies[SESSION_COOKIE]);
    if (session) {
      const user = await findUserById(session.userId);
      if (user && user.tokenVersion === session.tokenVersion) req.user = user;
    }
    if (!req.user) {
      if (!PUBLIC_API.includes(url) && !url.startsWith("/api/srd/")) throw new HttpError(401, "Nicht angemeldet.");
      return;
    }
    const user = req.user;
    if (user.blockedAt && !BLOCKED_ALLOWED.has(`${req.method} ${url}`)) {
      throw new HttpError(403, BLOCKED_MESSAGE);
    }
    if (url.startsWith("/api/admin/") && user.role !== "admin") {
      throw new HttpError(403, "Nur für Admins.");
    }
    limitUser(req, "request");
    if (req.method !== "GET" && req.method !== "HEAD" && !url.startsWith("/api/auth/")) {
      limitUser(req, "write");
      if (req.method === "POST") limitUser(req, "create");
    }
  });

  // API-Antworten nie cachen (ausser SRD, das setzt eigene Header)
  app.addHook("onSend", async (req, reply) => {
    if (req.url.startsWith("/api/") && !reply.hasHeader("Cache-Control")) {
      reply.header("Cache-Control", "no-store");
    }
  });

  app.setErrorHandler((error: FastifyError | HttpError, _req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    reply.code(status).send({
      error: status >= 500 ? "Interner Fehler." : error.message,
    });
  });

  app.get("/api/health", async () => {
    await sql`SELECT 1`;
    return { ok: true };
  });
  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(campaignRoutes);
  await app.register(toolRoutes);
  await app.register(characterRoutes);
  await app.register(libraryRoutes);
  await app.register(attachmentRoutes);
  await app.register(srdRoutes);
  await app.register(unblockRoutes);
  await app.register(adminRoutes);

  // ── Frontend (gebautes SPA) ausliefern ─────────────────────────────────
  const staticDir = env.staticDir || path.resolve(process.cwd(), "../web/dist");
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.header("Cache-Control", "no-cache");
        }
        if (filePath.endsWith(TELEGRAM_FRAME)) {
          // Nur dieses Dokument darf das Telegram-Skript (mit eval) laden.
          res.header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-eval' https://telegram.org; frame-src https://oauth.telegram.org; img-src 'self' https://*.telegram.org https://t.me data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"
          );
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== "GET" || req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Nicht gefunden." });
      }
      reply.header("Cache-Control", "no-cache");
      return reply.sendFile("index.html");
    });
  } else {
    app.log.warn(`Kein Frontend-Build unter ${staticDir} – nur API aktiv.`);
  }

  return app;
}
