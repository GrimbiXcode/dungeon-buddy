import { describe, expect, it, vi } from "vitest";
import { ICONS } from "./icons";
import { GAME_ICONS } from "./icons/gameIcons";

// Lucide-Komponenten sind .svelte-Dateien; für diesen Test reicht ein Platzhalter (vi.mock wird nach oben gezogen).
vi.mock("@lucide/svelte", () => new Proxy({}, { get: (_, key) => (key === "then" ? undefined : () => null), has: () => true }));

describe("Adventurer-Icons", () => {
  it("hat für jedes thematische Icon Pfaddaten", () => {
    for (const [name, icon] of Object.entries(ICONS)) {
      expect(GAME_ICONS[icon.game], name).toBeDefined();
      expect(GAME_ICONS[icon.game].length, name).toBeGreaterThan(0);
    }
  });

  it("enthält keine ungenutzten Pfaddaten", () => {
    const used = new Set(Object.values(ICONS).map(i => i.game));
    expect(Object.keys(GAME_ICONS).filter(k => !used.has(k as never))).toEqual([]);
  });
});
