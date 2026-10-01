import { z } from "zod";
import { sql } from "../db.js";

export const userSettingsSchema = z.object({
  colorMode: z.enum(["system", "light", "dark"]).optional(),
  diceMode: z.enum(["digital", "physical"]).optional(),
  units: z.enum(["imperial", "metric"]).optional(),
  unitCalculator: z.boolean().optional(),
  lastCampaignId: z.uuid().nullable().optional(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export type User = {
  id: string;
  telegramId: string;
  displayName: string;
  settings: UserSettings;
  tokenVersion: number;
  createdAt: Date;
};

export async function findUserById(id: string): Promise<User | null> {
  const rows = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ?? null;
}

/** Legt den Benutzer bei der ersten Anmeldung an, sonst wird er nur geladen. */
export async function findOrCreateUser(telegramId: number, displayName: string | null): Promise<User> {
  const rows = await sql<User[]>`
    INSERT INTO users (telegram_id, display_name)
    VALUES (${telegramId}, ${(displayName ?? "").slice(0, 80) || "Abenteurer"})
    ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
    RETURNING *
  `;
  return rows[0]!;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    telegramId: String(user.telegramId),
    displayName: user.displayName,
    settings: user.settings ?? {},
    createdAt: user.createdAt,
  };
}
