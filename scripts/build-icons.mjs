#!/usr/bin/env node
/**
 * Erzeugt Favicons, App-Icons und Web-App-Manifeste je Farbschema
 * (hell, dunkel, adventurer) aus dem Tor-Logo in web/src/lib/logo.ts.
 * Die Ergebnisse liegen in web/public und werden eingecheckt.
 *
 * Aufruf: npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { doorSvg, hexLogoColors, mixOklab, MODE_COLORS } from "../web/src/lib/logo.ts";

const publicDir = path.resolve(import.meta.dirname, "../web/public");
const iconDir = path.join(publicDir, "icons");
mkdirSync(iconDir, { recursive: true });

/**
 * Tor auf quadratischem Grund. `door` ist die Kantenlänge des Tor-Ausschnitts
 * relativ zur Fläche, `radius` die Eckenrundung (0 = randlos).
 */
function tile(mode, { door, radius }) {
  const { accent, background } = MODE_COLORS[mode];
  const glow = mixOklab(accent, background, 0.16);
  const size = 100 * door;
  const offset = (100 - size) / 2;
  const inner = doorSvg(hexLogoColors(accent), {
    id: "door",
    attrs: `x="${offset}" y="${offset}" width="${size}" height="${size}"`,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${glow}"/><stop offset="1" stop-color="${background}"/></radialGradient></defs>
<rect width="100" height="100" rx="${radius}" fill="url(#bg)"/>
${inner}
</svg>`;
}

function png(svg, size, file) {
  const out = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(path.join(iconDir, file), out);
}

for (const mode of Object.keys(MODE_COLORS)) {
  const { accent, background } = MODE_COLORS[mode];

  // Favicon: freigestellt, damit es auf hellen und dunklen Tab-Leisten sitzt
  writeFileSync(path.join(iconDir, `favicon-${mode}.svg`), doorSvg(hexLogoColors(accent)) + "\n");

  // "any": abgerundete Kachel; maskable: randlos, Tor im sicheren Kreis (80 %)
  const any = tile(mode, { door: 0.78, radius: 22 });
  png(any, 192, `icon-${mode}-192.png`);
  png(any, 512, `icon-${mode}-512.png`);
  png(tile(mode, { door: 0.62, radius: 0 }), 512, `icon-${mode}-maskable-512.png`);
  // iOS rundet selbst ab und füllt Transparenz schwarz
  png(tile(mode, { door: 0.74, radius: 0 }), 180, `apple-touch-icon-${mode}.png`);

  const manifest = {
    // Gleiche id in allen Varianten: Es bleibt dieselbe installierte App, nur das Icon wechselt.
    id: "/",
    name: "Dungeon Buddy",
    short_name: "Dungeon Buddy",
    description: "Deine D&D-5e-Toolbox: Tagebuch, NPC-Netzwerk, Charakterbogen und Zauberbuch.",
    lang: "de",
    theme_color: background,
    background_color: background,
    display: "standalone",
    start_url: "/",
    scope: "/",
    icons: [
      { src: `/icons/icon-${mode}-192.png`, sizes: "192x192", type: "image/png" },
      { src: `/icons/icon-${mode}-512.png`, sizes: "512x512", type: "image/png" },
      { src: `/icons/icon-${mode}-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(path.join(publicDir, `manifest-${mode}.webmanifest`), JSON.stringify(manifest, null, 2) + "\n");
}

console.log(`Icons für ${Object.keys(MODE_COLORS).join(", ")} geschrieben.`);
