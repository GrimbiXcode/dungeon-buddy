/*
 * Das Tor-Logo: steinerner Dungeon-Eingang, aus dem zwei Augen leuchten.
 * Eine Quelle für die Logo-Komponente (Farben als CSS, folgen dem Akzent)
 * und für scripts/build-icons.mjs (feste Farben pro Farbschema).
 */

export interface LogoColors {
  stone: string;
  keystone: string;
  joints: string;
  floor: string;
  eyes: string;
  depth: string;
  void: string;
}

/** Akzent und Hintergrund je Farbschema, wie in app.css. */
export const MODE_COLORS = {
  dark: { accent: "#a78bfa", background: "#1a1625" },
  light: { accent: "#7c3aed", background: "#f6f2ea" },
  adventurer: { accent: "#e8b923", background: "#1e1f22" },
} as const;

export type LogoMode = keyof typeof MODE_COLORS;

/** Favicon zum Farbschema. Gleiches Muster in public/theme-init.js. */
export const faviconHref = (mode: LogoMode) => `/icons/favicon-${mode}.svg`;

/**
 * Icon der installierten App. Unabhängig vom Farbschema gewählt, damit ein
 * Schemawechsel keinen Update-Dialog des Browsers auslöst. Gleiches Muster in public/theme-init.js.
 */
export function appIconLinks(icon: LogoMode) {
  return {
    "apple-touch-icon": `/icons/apple-touch-icon-${icon}.png`,
    manifest: `/manifest-${icon}.webmanifest`,
  };
}

/** Ausschnitt um das Tor herum, quadratisch. */
export const LOGO_VIEWBOX = "4 7 92 92";

const mixCss = (accent: string, pct: number, other: string) => `color-mix(in oklab, ${accent} ${pct}%, ${other})`;

function colorsFrom(mix: (pct: number, other: string) => string): LogoColors {
  return {
    stone: mix(72, "#000"),
    keystone: mix(68, "#fff"),
    joints: mix(26, "#000"),
    floor: mix(48, "#000"),
    eyes: mix(38, "#fff"),
    depth: mix(30, "#07050b"),
    void: "#07050b",
  };
}

/** Farben als CSS-Ausdrücke, z. B. für `var(--accent)`. */
export function cssLogoColors(accent = "var(--accent)"): LogoColors {
  return colorsFrom((pct, other) => mixCss(accent, pct, other));
}

/** Feste Hexfarben für Icon-Dateien, gemischt wie `color-mix(in oklab, …)`. */
export function hexLogoColors(accent: string): LogoColors {
  return colorsFrom((pct, other) => mixOklab(accent, other, pct / 100));
}

/**
 * SVG des Tors. `id` macht Verlauf und Filter eindeutig, falls das Logo
 * mehrfach auf einer Seite steht.
 */
export function doorSvg(c: LogoColors, { id = "door", attrs = "" }: { id?: string; attrs?: string } = {}): string {
  const fill = (color: string) => `style="fill:${color}"`;
  const stroke = (color: string) => `style="stroke:${color}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" ${attrs}>
<defs>
<radialGradient id="${id}-dark" cx="50%" cy="85%" r="70%"><stop offset="0" style="stop-color:${c.depth}"/><stop offset="1" style="stop-color:${c.void}"/></radialGradient>
<filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<path d="M33 90V50a17 17 0 0 1 34 0v40Z" fill="url(#${id}-dark)"/>
<path d="M18 90V50a32 32 0 0 1 64 0v40H67V50a17 17 0 0 0-34 0v40Z" ${fill(c.stone)}/>
<path d="M18 50a32 32 0 0 1 64 0" fill="none" ${stroke(c.eyes)} stroke-width="1.2" opacity=".35"/>
<g fill="none" ${stroke(c.joints)} stroke-width="1.6" stroke-linecap="round">
<path d="M64.7 41.5 77.7 34M59.8 36.1 68.4 23.8M40.2 36.1 31.6 23.8M35.3 41.5 22.3 34"/>
<path d="M18 50H33M67 50H82M18 63H33M67 63H82M18 76H33M67 76H82M25.5 63V76M74.5 63V76M25.5 50V37"/>
</g>
<path d="M46.9 35.3 42.7 15.8H57.3L53.1 35.3Z" style="fill:${c.keystone};stroke:${c.joints}" stroke-width="1.6" stroke-linejoin="round"/>
<g class="eyes" filter="url(#${id}-glow)">
<ellipse cx="43.5" cy="64" rx="3" ry="4.2" ${fill(c.eyes)}/>
<ellipse cx="56.5" cy="64" rx="3" ry="4.2" ${fill(c.eyes)}/>
</g>
<path d="M8 90H92" ${stroke(c.floor)} stroke-width="3.2" stroke-linecap="round"/>
</svg>`;
}

// ── Farbmischung in Oklab (wie CSS color-mix) ─────────────────────────────

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map(ch => ch + ch).join("");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: Rgb): Rgb {
  [r, g, b] = [r, g, b].map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(v => Math.min(1, Math.max(0, toGamma(v)))) as Rgb;
}

/** Mischt `a` zu Anteil `weight` mit `b`, in Oklab. */
export function mixOklab(a: string, b: string, weight: number): string {
  const la = rgbToOklab(hexToRgb(a));
  const lb = rgbToOklab(hexToRgb(b));
  const mixed = oklabToRgb(la.map((v, i) => v * weight + lb[i] * (1 - weight)) as Rgb);
  return "#" + mixed.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
