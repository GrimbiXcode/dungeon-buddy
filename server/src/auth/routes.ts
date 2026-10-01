import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { sql } from "../db.js";
import { HttpError, noContent, parse } from "../lib/http.js";
import { consumeRateLimit } from "../lib/rate-limit.js";
import { findOrCreateUser, findUserById, publicUser, type User } from "../lib/users.js";
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
  }));

  app.post("/api/auth/code", async (req, reply) => {
    limitLogin(req);
    const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, "Code muss 6 Ziffern haben") }), req.body);
    const redeemed = await redeemLoginCode(code);
    if (!redeemed) throw new HttpError(401, "Code ungültig oder abgelaufen. Fordere beim Bot mit /login einen neuen an.");
    assertAllowed(redeemed.telegramId);
    const user = await findOrCreateUser(redeemed.telegramId, redeemed.displayName);
    await setSessionCookie(reply, user);
    return publicUser(user);
  });

  app.post("/api/auth/widget", async (req, reply) => {
    limitLogin(req);
    const data = parse(widgetSchema, req.body);
    if (!verifyTelegramWidgetData(env.telegramBotToken, data)) {
      throw new HttpError(401, "Telegram-Anmeldung konnte nicht bestätigt werden.");
    }
    assertAllowed(data.id);
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || null;
    const user = await findOrCreateUser(data.id, name);
    await setSessionCookie(reply, user);
    return publicUser(user);
  });

  if (env.devLogin) {
    app.post("/api/auth/dev", async (_req, reply) => {
      const user = await findOrCreateUser(1, "Dev-Abenteurer");
      await setSessionCookie(reply, user);
      return publicUser(user);
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
