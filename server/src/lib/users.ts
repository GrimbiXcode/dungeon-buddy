import { z } from "zod";
import { sql } from "../db.js";
import { env } from "../env.js";

export const userSettingsSchema = z.object({
  colorMode: z.enum(["system", "light", "dark", "adventurer"]).optional(),
  diceMode: z.enum(["digital", "physical"]).optional(),
  units: z.enum(["imperial", "metric"]).optional(),
  unitCalculator: z.boolean().optional(),
  lastCampaignId: z.uuid().nullable().optional(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const BLOCK_REASONS = ["abuse", "spam", "terms", "automated", "other"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export type User = {
  id: string;
  telegramId: string;
  displayName: string;
  settings: UserSettings;
  tokenVersion: number;
  role: "user" | "admin";
  blockedAt: Date | null;
  blockedReason: BlockReason | null;
  createdAt: Date;
};

export async function findUserById(id: string): Promise<User | null> {
  const rows = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function findUserByTelegramId(telegramId: number): Promise<User | null> {
  const rows = await sql<User[]>`SELECT * FROM users WHERE telegram_id = ${telegramId}`;
  return rows[0] ?? null;
}

/**
 * Wer wird Admin? Der Betreiber (OWNER_TELEGRAM_ID) bei jedem Login. Ohne
 * Betreiber-ID nur bei gesetzter Freigabeliste der allererste Benutzer –
 * bei offener Registrierung nie automatisch, sonst wäre der erste Fremde Admin.
 */
function grantsAdmin(telegramId: number, isFirstUser: boolean) {
  if (env.ownerTelegramId) return env.ownerTelegramId === String(telegramId);
  return env.telegramAllowedIds.length > 0 && isFirstUser;
}

/** Legt den Benutzer bei der ersten Anmeldung an, sonst wird er nur geladen. */
export async function findOrCreateUser(telegramId: number, displayName: string | null): Promise<User> {
  return sql.begin(async tx => {
    // Serialisiert Erstanmeldungen, damit "erster Benutzer" eindeutig bleibt
    await tx`SELECT pg_advisory_xact_lock(4712)`;
    const [{ n }] = (await tx`SELECT count(*)::int AS n FROM users`) as unknown as [{ n: number }];
    const admin = grantsAdmin(telegramId, n === 0);
    const rows = await tx<User[]>`
      INSERT INTO users (telegram_id, display_name, role)
      VALUES (${telegramId}, ${(displayName ?? "").slice(0, 80) || "Abenteurer"}, ${admin ? "admin" : "user"})
      ON CONFLICT (telegram_id) DO UPDATE SET
        role = CASE WHEN ${admin && Boolean(env.ownerTelegramId)} THEN 'admin' ELSE users.role END
      RETURNING *
    `;
    return rows[0]!;
  });
}

export function publicUser(user: User) {
  return {
    id: user.id,
    telegramId: String(user.telegramId),
    displayName: user.displayName,
    settings: user.settings ?? {},
    role: user.role,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    createdAt: user.createdAt,
  };
}
