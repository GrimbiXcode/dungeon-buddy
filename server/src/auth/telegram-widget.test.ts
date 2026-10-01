import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramWidgetData, type TelegramWidgetAuthData } from "./telegram-widget.js";
import { generateLoginCode } from "./login-codes.js";

const TOKEN = "123456:ABC";

function sign(data: Omit<TelegramWidgetAuthData, "hash">, token = TOKEN): TelegramWidgetAuthData {
  const check = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return { ...data, hash: createHmac("sha256", secret).update(check).digest("hex") };
}

describe("verifyTelegramWidgetData", () => {
  const now = 1_800_000_000;
  const base = { id: 42, first_name: "Elara", username: "elara", auth_date: now - 60 };

  it("akzeptiert korrekt signierte Daten", () => {
    expect(verifyTelegramWidgetData(TOKEN, sign(base), now)).toBe(true);
  });

  it("lehnt veränderte Daten ab", () => {
    const data = sign(base);
    expect(verifyTelegramWidgetData(TOKEN, { ...data, id: 43 }, now)).toBe(false);
  });

  it("lehnt Daten eines anderen Bots ab", () => {
    expect(verifyTelegramWidgetData(TOKEN, sign(base, "999:OTHER"), now)).toBe(false);
  });

  it("lehnt zu alte Daten ab", () => {
    const old = sign({ ...base, auth_date: now - 2 * 24 * 3600 });
    expect(verifyTelegramWidgetData(TOKEN, old, now)).toBe(false);
  });

  it("lehnt ohne Bot-Token ab", () => {
    expect(verifyTelegramWidgetData("", sign(base), now)).toBe(false);
  });
});

describe("generateLoginCode", () => {
  it("liefert immer 6 Ziffern", () => {
    for (let i = 0; i < 500; i++) expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });
});
