import { describe, expect, it } from "vitest";
import { loginCodeMessage } from "./bot.js";

describe("loginCodeMessage", () => {
  it("markiert genau den Code als Monospace", () => {
    const { text, entities } = loginCodeMessage("042917");
    expect(entities).toHaveLength(1);
    const [e] = entities;
    expect(e.type).toBe("code");
    // Telegram zählt Offsets in UTF-16-Einheiten, wie JS-Strings (🎲 = 2 Einheiten)
    expect(text.slice(e.offset, e.offset + e.length)).toBe("042917");
  });
});
