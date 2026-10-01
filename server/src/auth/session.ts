import * as jose from "jose";
import { env } from "../env.js";

export const SESSION_COOKIE = "db_session";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ALG = "HS256";

export type SessionPayload = { userId: string; tokenVersion: number };

const key = () => new TextEncoder().encode(env.appSecret);

/**
 * Die Sitzung lebt ausschliesslich im (httpOnly-)Cookie des Browsers als
 * signiertes JWT – serverseitig wird keine Sitzungstabelle geführt.
 * Widerruf erfolgt über `users.token_version`.
 */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new jose.SignJWT({ tv: payload.tokenVersion })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + SESSION_MAX_AGE_MS))
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, key(), { algorithms: [ALG] });
    if (!payload.sub || typeof payload.tv !== "number") return null;
    return { userId: payload.sub, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}
