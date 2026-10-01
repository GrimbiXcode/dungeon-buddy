import type { ColorMode } from "./types";

export const CAMPAIGN_THEMES = [
  { key: "arcane", name: "Arkan", description: "Violett, magisch", color: "#a78bfa" },
  { key: "dragon", name: "Drachenblut", description: "Glut und Feuer", color: "#f87171" },
  { key: "feywild", name: "Feenwelt", description: "Verspielt, pink", color: "#f0abfc" },
  { key: "underdark", name: "Unterreich", description: "Leuchtpilze im Dunkel", color: "#2dd4bf" },
  { key: "frost", name: "Eiswind", description: "Kalt und klar", color: "#7dd3fc" },
  { key: "desert", name: "Wüstensand", description: "Gold und Sonne", color: "#fcd34d" },
  { key: "forest", name: "Wildnis", description: "Moos und Blätter", color: "#a3e635" },
  { key: "parchment", name: "Pergament", description: "Klassisch, warm", color: "#e7b98a" },
] as const;

export type ThemeKey = (typeof CAMPAIGN_THEMES)[number]["key"];

export const RULESETS = [
  { key: "2024", name: "D&D 5e (2024)", short: "5e 2024" },
  { key: "2014", name: "D&D 5e (2014)", short: "5e 2014" },
] as const;

export function rulesetLabel(r: string) {
  return RULESETS.find(x => x.key === r)?.short ?? r;
}

const COLOR_MODE_KEY = "db-color-mode";

/** Hell/Dunkel anwenden und lokal merken (für theme-init.js beim nächsten Start). */
export function applyColorMode(mode: ColorMode = "system") {
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    /* privates Fenster o. ä. */
  }
  const dark =
    mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1625" : "#f6f2ea");
}

export function storedColorMode(): ColorMode {
  try {
    return (localStorage.getItem(COLOR_MODE_KEY) as ColorMode) || "system";
  } catch {
    return "system";
  }
}
