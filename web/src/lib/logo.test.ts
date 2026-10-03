import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { MODE_COLORS, mixOklab, modeIconLinks, type LogoMode } from "./logo";

const themeInit = readFileSync(path.resolve(import.meta.dirname, "../../public/theme-init.js"), "utf8");

function runThemeInit(stored: string) {
  const dom = new JSDOM(
    `<head><meta name="theme-color" content="#000"><link rel="icon" href="/x"><link rel="apple-touch-icon" href="/x"><link rel="manifest" href="/x"></head>`,
    { url: "https://example.test/", runScripts: "outside-only" }
  );
  dom.window.localStorage.setItem("db-color-mode", stored);
  dom.window.eval(themeInit);
  return dom.window.document;
}

describe("Tor-Logo", () => {
  it("mischt wie color-mix in Oklab", () => {
    expect(mixOklab("#a78bfa", "#ffffff", 1)).toBe("#a78bfa");
    expect(mixOklab("#a78bfa", "#000000", 0)).toBe("#000000");
    expect(mixOklab("#ffffff", "#000000", 0.5)).toBe("#636363");
  });

  it.each(Object.keys(MODE_COLORS) as LogoMode[])("theme-init.js verlinkt dieselben Icons wie die App (%s)", mode => {
    const doc = runThemeInit(mode);
    expect(doc.documentElement.dataset.mode).toBe(mode);
    for (const [rel, href] of Object.entries(modeIconLinks(mode))) {
      expect(doc.querySelector(`link[rel="${rel}"]`)?.getAttribute("href")).toBe(href);
    }
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(MODE_COLORS[mode].background);
  });
});
