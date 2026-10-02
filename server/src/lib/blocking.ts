import { sql } from "../db.js";
import { env } from "../env.js";
import { sendMessage } from "../auth/bot.js";
import type { BlockReason, User } from "./users.js";

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  abuse: "Missbrauch",
  spam: "Spam",
  terms: "Verstoss gegen die Nutzungsregeln",
  automated: "Automatisierte Nutzung",
  other: "Anderer Grund",
};

/**
 * Sperrt ein Konto und widerruft dabei alle Sitzungen (token_version + 1).
 * Gibt null zurück, wenn das Konto nicht existiert oder schon gesperrt ist.
 */
export async function blockUser(userId: string, reason: BlockReason): Promise<User | null> {
  const [row] = await sql<User[]>`
    UPDATE users SET blocked_at = now(), blocked_reason = ${reason}, token_version = token_version + 1
    WHERE id = ${userId} AND blocked_at IS NULL
    RETURNING *
  `;
  return row ?? null;
}

/** Hebt eine Sperre auf. Sitzungen bleiben widerrufen: neu anmelden. */
export async function unblockUser(userId: string): Promise<User | null> {
  const [row] = await sql<User[]>`
    UPDATE users SET blocked_at = NULL, blocked_reason = NULL
    WHERE id = ${userId} AND blocked_at IS NOT NULL
    RETURNING *
  `;
  return row ?? null;
}

const link = () => (env.appBaseUrl ? `\n${env.appBaseUrl}` : "");

export function notifyBlocked(user: User, reason: BlockReason) {
  void sendMessage(
    user.telegramId,
    `🚫 Dein Konto bei ${env.appName} wurde gesperrt (${BLOCK_REASON_LABELS[reason]}).\n` +
      `Nach der Anmeldung kannst du deine Daten exportieren, das Konto löschen oder eine Entsperrung beantragen.${link()}`
  );
}

export function notifyUnblocked(user: User) {
  void sendMessage(user.telegramId, `✅ Dein Konto bei ${env.appName} ist wieder freigeschaltet. Bitte melde dich neu an.${link()}`);
}

export function notifyUnblockRejected(user: User, note: string) {
  void sendMessage(user.telegramId, `Dein Antrag auf Entsperrung bei ${env.appName} wurde abgelehnt.\n\nBegründung: ${note}`);
}
