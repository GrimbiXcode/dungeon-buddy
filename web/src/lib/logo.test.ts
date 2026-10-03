// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appIconLinks, faviconHref, MODE_COLORS, mixOklab, type LogoMode } from "./logo";

const themeInit = readFileSync(path.resolve(import.meta.dirname, "../../public/theme-init.js"), "utf8");

function runThemeInit(stored: string, appIcon?: string) {
  document.head.innerHTML = `<meta name="theme-color" content="#000"><link rel="icon" href="/x"><link rel="apple-touch-icon" href="/x"><link rel="manifest" href="/x">`;
  localStorage.clear();
  localStorage.setItem("db-color-mode", stored);
  if (appIcon) localStorage.setItem("db-app-icon", appIcon);
  new Function(themeInit)();
  return document;
}

describe("Tor-Logo", () => {
  it("mischt wie color-mix in Oklab", () => {
    expect(mixOklab("#a78bfa", "#ffffff", 1)).toBe("#a78bfa");
    expect(mixOklab("#a78bfa", "#000000", 0)).toBe("#000000");
    expect(mixOklab("#ffffff", "#000000", 0.5)).toBe("#636363");
  });

  const modes = Object.keys(MODE_COLORS) as LogoMode[];

  it.each(modes)("theme-init.js setzt Favicon und Fensterfarbe zum Schema (%s)", mode => {
    const doc = runThemeInit(mode);
    expect(doc.documentElement.dataset.mode).toBe(mode);
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(faviconHref(mode));
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(MODE_COLORS[mode].background);
  });

  it.each(modes)("theme-init.js verlinkt das gewählte App-Icon unabhängig vom Schema (%s)", icon => {
    const doc = runThemeInit("light", icon);
    for (const [rel, href] of Object.entries(appIconLinks(icon))) {
      expect(doc.querySelector(`link[rel="${rel}"]`)?.getAttribute("href")).toBe(href);
    }
  });

  it("nimmt ohne Wahl das dunkle App-Icon", () => {
    const doc = runThemeInit("adventurer");
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(appIconLinks("dark").manifest);
  });
});
