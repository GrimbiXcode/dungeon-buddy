import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { sql } from "../db.js";
import { HttpError, noContent, parse } from "../lib/http.js";
import { recordAbuse, REGISTRATION_LIMITS } from "../lib/abuse.js";
import { consumeRateLimit } from "../lib/rate-limit.js";
import { getStorage } from "../lib/storage.js";
import { findOrCreateUser, findUserById, findUserByTelegramId, publicUser, type User } from "../lib/users.js";
import { redeemLoginCode } from "./login-codes.js";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, signSession } from "./session.js";
import { verifyTelegramWidgetData } from "./telegram-widget.js";

/**
 * Wer darf sich anmelden? Ohne Freigabeliste UND ohne ausdrücklich geöffnete
 * Registrierung niemand – eine übersehene Variable soll keine offene Instanz
 * ergeben.
 */
function assertAllowed(telegramId: number) {
  if (env.telegramAllowedIds.length === 0) {
    if (!env.telegramOpenRegistration) {
      throw new HttpError(
        403,
        "Diese Instanz nimmt keine Anmeldungen an. Der Betreiber muss TELEGRAM_ALLOWED_IDS setzen oder TELEGRAM_OPEN_REGISTRATION aktivieren."
      );
    }
    return;
  }
  if (!env.telegramAllowedIds.includes(String(telegramId))) {
    throw new HttpError(403, "Dieses Telegram-Konto ist für diese Instanz nicht freigeschaltet.");
  }
}

/**
 * Grenzen nur für neue Konten: pro IP (nur im Arbeitsspeicher, die IP wird
 * nicht gespeichert) und – bei offener Registrierung – instanzweit pro Tag.
 */
async function assertRegistrationAllowed(req: FastifyRequest) {
  const day = 24 * 60 * 60 * 1000;
  if (env.telegramOpenRegistration && env.telegramAllowedIds.length === 0) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE created_at > now() - interval '24 hours'
    `;
    if (row!.n >= REGISTRATION_LIMITS.perDay) {
      recordAbuse("registration.limited", null, { reason: "instance" });
      throw new HttpError(429, "Heute sind bereits sehr viele neue Konten entstanden. Bitte morgen erneut versuchen.");
    }
  }
  const perIp = consumeRateLimit(`register:${req.ip}`, REGISTRATION_LIMITS.perIpPerDay, day);
  if (!perIp.allowed) {
    if (perIp.firstDenied) recordAbuse("registration.limited", null, { reason: "ip" });
    throw new HttpError(429, "Von diesem Anschluss wurden heute schon mehrere Konten angelegt. Bitte morgen erneut versuchen.");
  }
}

/** Gemeinsamer Abschluss aller Login-Wege. */
async function signIn(req: FastifyRequest, reply: FastifyReply, telegramId: number, displayName: string | null) {
  assertAllowed(telegramId);
  const existing = await findUserByTelegramId(telegramId);
  if (!existing) await assertRegistrationAllowed(req);
  const user = await findOrCreateUser(telegramId, displayName);
  if (user.blockedAt) recordAbuse("login.blocked_user", user.id);
  await setSessionCookie(reply, user);
  return publicUser(user);
}

export async function setSessionCookie(reply: FastifyReply, user: User) {
  const token = await signSession({ userId: user.id, tokenVersion: user.tokenVersion });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function limitLogin(req: FastifyRequest) {
  // Schutz gegen Durchprobieren der 6-stelligen Codes
  const perIp = consumeRateLimit(`login:${req.ip}`, 10, 15 * 60 * 1000);
  const global = consumeRateLimit("login:global", 300, 15 * 60 * 1000);
  if (!perIp.allowed || !global.allowed) {
    throw new HttpError(429, "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut versuchen.");
  }
}

const widgetSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/info", async () => ({
    appName: env.appName,
    botConfigured: Boolean(env.telegramBotToken && env.telegramBotUsername),
    botUsername: env.telegramBotUsername || null,
    devLogin: env.devLogin,
    attachments: getStorage() !== null,
  }));

  app.post("/api/auth/code", async (req, reply) => {
    limitLogin(req);
    const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, "Code muss 6 Ziffern haben") }), req.body);
    const redeemed = await redeemLoginCode(code);
    if (!redeemed) throw new HttpError(401, "Code ungültig oder abgelaufen. Fordere beim Bot mit /login einen neuen an.");
    return signIn(req, reply, redeemed.telegramId, redeemed.displayName);
  });

  app.post("/api/auth/widget", async (req, reply) => {
    limitLogin(req);
    const data = parse(widgetSchema, req.body);
    if (!verifyTelegramWidgetData(env.telegramBotToken, data)) {
      throw new HttpError(401, "Telegram-Anmeldung konnte nicht bestätigt werden.");
    }
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || null;
    return signIn(req, reply, data.id, name);
  });

  if (env.devLogin) {
    app.post("/api/auth/dev", async (_req, reply) => {
      await findOrCreateUser(1, "Dev-Abenteurer");
      // Lokal soll der Admin-Bereich ohne weitere Konfiguration erreichbar sein
      const [user] = await sql<User[]>`UPDATE users SET role = 'admin' WHERE telegram_id = 1 RETURNING *`;
      await setSessionCookie(reply, user!);
      return publicUser(user!);
    });
  }

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSessionCookie(reply);
    return noContent(reply);
  });

  app.post("/api/auth/logout-all", async (req, reply) => {
    const user = req.user!;
    await sql`UPDATE users SET token_version = token_version + 1 WHERE id = ${user.id}`;
    clearSessionCookie(reply);
    return noContent(reply);
  });
}

export { findUserById };
