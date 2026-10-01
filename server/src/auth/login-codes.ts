import { randomInt } from "node:crypto";
import { sql } from "../db.js";

/** Gültigkeit eines Codes. Kurz, weil er nur abgetippt wird. */
export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

/** 6-stelliger Code, kryptographisch zufällig, mit führenden Nullen. */
export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function purgeExpiredLoginCodes() {
  await sql`DELETE FROM login_codes WHERE expires_at < now()`;
}

/** Legt einen frischen Code an; alte Codes dieses Telegram-Kontos verfallen. */
export async function issueLoginCode(telegramId: number, displayName: string | null) {
  await sql`DELETE FROM login_codes WHERE telegram_id = ${telegramId}`;
  await purgeExpiredLoginCodes();
  const code = generateLoginCode();
  await sql`
    INSERT INTO login_codes (code, telegram_id, display_name, expires_at)
    VALUES (${code}, ${telegramId}, ${displayName}, ${new Date(Date.now() + LOGIN_CODE_TTL_MS)})
  `;
  return code;
}

/**
 * Löst einen Code ein und löscht ihn dabei in einem Schritt. Zwei
 * gleichzeitige Einlösungen können so nicht beide gelingen.
 */
export async function redeemLoginCode(code: string) {
  const rows = await sql<{ telegramId: string; displayName: string | null }[]>`
    DELETE FROM login_codes
    WHERE id = (
      SELECT id FROM login_codes
      WHERE code = ${code} AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING telegram_id, display_name
  `;
  const row = rows[0];
  return row ? { telegramId: Number(row.telegramId), displayName: row.displayName } : null;
}
