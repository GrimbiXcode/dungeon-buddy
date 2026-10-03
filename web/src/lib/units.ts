/**
 * Einheiten: Intern rechnet der Bogen wie die Regelwerke in Fuss/Pfund.
 * Angezeigt wird je nach Profileinstellung imperial oder metrisch.
 *
 * Zwei Umrechnungsarten:
 *  - "table": Spieltisch-Konvention der deutschen Regelwerke
 *             (5 ft = 1.5 m, 1 Meile = 1.5 km, 1 lb = 0.5 kg, 1 Gallone = 4 l)
 *  - "exact": physikalisch genau
 */
export type UnitSystem = "imperial" | "metric";
export type ConversionMode = "table" | "exact";

export const FACTORS: Record<ConversionMode, { ft: number; mi: number; lb: number; gal: number }> = {
  table: { ft: 0.3, mi: 1.5, lb: 0.5, gal: 4 },
  exact: { ft: 0.3048, mi: 1.609344, lb: 0.45359237, gal: 3.785411784 },
};

const nf = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 });

export function formatNumber(n: number, digits = 2) {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: digits }).format(n);
}

/** Runden auf sinnvolle Stellen (0.3048 × 30 = 9.144 → 9.14) */
function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export const ftToM = (ft: number, mode: ConversionMode = "table") => round(ft * FACTORS[mode].ft);
export const mToFt = (m: number, mode: ConversionMode = "table") => round(m / FACTORS[mode].ft, 1);
export const miToKm = (mi: number, mode: ConversionMode = "table") => round(mi * FACTORS[mode].mi);
export const kmToMi = (km: number, mode: ConversionMode = "table") => round(km / FACTORS[mode].mi);
export const lbToKg = (lb: number, mode: ConversionMode = "table") => round(lb * FACTORS[mode].lb);
export const kgToLb = (kg: number, mode: ConversionMode = "table") => round(kg / FACTORS[mode].lb);
export const galToL = (gal: number, mode: ConversionMode = "table") => round(gal * FACTORS[mode].gal);
export const lToGal = (l: number, mode: ConversionMode = "table") => round(l / FACTORS[mode].gal);

/** Strecke in Fuss für die Anzeige formatieren. */
export function formatDistance(ft: number, system: UnitSystem) {
  return system === "metric" ? `${nf.format(ftToM(ft))} m` : `${nf.format(ft)} ft`;
}

export function distanceUnit(system: UnitSystem) {
  return system === "metric" ? "m" : "ft";
}

/** Eingabewert (in Anzeigeeinheit) → Fuss. Metrisch auf ganze Fuss gerundet. */
export function inputToFeet(value: number, system: UnitSystem) {
  return system === "metric" ? Math.round(mToFt(value)) : value;
}

export function feetToInput(ft: number, system: UnitSystem) {
  return system === "metric" ? ftToM(ft) : ft;
}

/**
 * Reichweite aus altem Freitext lesen: "80/320 ft", "5 ft", "24/96 m", "30".
 * Ergebnis in Fuss; null, wenn der Text kein solches Muster ist.
 */
export function parseRangeText(text: string): { normal: number; long: number | null } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?\s*(ft\.?|feet|foot|fuß|fuss|m|meter)?\s*$/i.exec(text);
  if (!m) return null;
  const metric = /^m/i.test(m[3] ?? "");
  const toFeet = (s: string) => (metric ? Math.round(mToFt(parseNum(s))) : parseNum(s));
  return { normal: toFeet(m[1]!), long: m[2] ? toFeet(m[2]) : null };
}

/** Reichweite (in Fuss) anzeigen: "80/320 ft" bzw. "24/96 m", ohne Fernreichweite "5 ft". */
export function formatRange(normal: number, long: number | null, system: UnitSystem) {
  const n = (ft: number) => nf.format(feetToInput(ft, system));
  return `${n(normal)}${long != null ? `/${n(long)}` : ""} ${distanceUnit(system)}`;
}

function parseNum(s: string) {
  return Number(s.replace(/['’]/g, "").replace(",", "."));
}

/**
 * Einheiten in Freitext umrechnen (Spieltisch-Konvention), z. B.
 * "150 feet" → "45 m", "20-foot radius" → "6-m radius", "80/320 ft" → "24/96 m".
 * Nur Zahlen mit direkt folgender Einheit werden angefasst.
 */
export function convertText(text: string, system: UnitSystem): string {
  if (!text) return text;
  const num = String.raw`(\d+(?:[.,'’]\d+)?)`;
  if (system === "metric") {
    return text
      .replace(new RegExp(String.raw`${num}\s?/\s?${num}\s?(?:feet|foot|ft\.?)(?![a-z])`, "gi"), (_m, a, b) =>
        `${nf.format(ftToM(parseNum(a)))}/${nf.format(ftToM(parseNum(b)))} m`
      )
      .replace(new RegExp(String.raw`${num}(\s|-)(?:feet|foot|ft\.?)(?![a-z])`, "gi"), (_m, a, sep) =>
        `${nf.format(ftToM(parseNum(a)))}${sep === "-" ? "-" : " "}m`
      )
      .replace(new RegExp(String.raw`${num}ft(?![a-z])`, "gi"), (_m, a) => `${nf.format(ftToM(parseNum(a)))} m`)
      .replace(new RegExp(String.raw`${num}(\s|-)(?:miles?|mi\.?)(?![a-z])`, "gi"), (_m, a, sep) =>
        `${nf.format(miToKm(parseNum(a)))}${sep === "-" ? "-" : " "}km`
      )
      .replace(new RegExp(String.raw`${num}(\s|-)(?:pounds?|lbs?\.?)(?![a-z])`, "gi"), (_m, a, sep) =>
        `${nf.format(lbToKg(parseNum(a)))}${sep === "-" ? "-" : " "}kg`
      );
  }
  return text
    .replace(new RegExp(String.raw`${num}\s?/\s?${num}\s?m(?![a-zäöü])`, "gi"), (_m, a, b) =>
      `${nf.format(mToFt(parseNum(a)))}/${nf.format(mToFt(parseNum(b)))} ft`
    )
    .replace(new RegExp(String.raw`${num}(\s|-)?km(?![a-zäöü])`, "gi"), (_m, a, sep) =>
      `${nf.format(kmToMi(parseNum(a)))}${sep === "-" ? "-" : " "}mi`
    )
    .replace(new RegExp(String.raw`${num}(\s|-)?kg(?![a-zäöü])`, "gi"), (_m, a, sep) =>
      `${nf.format(kgToLb(parseNum(a)))}${sep === "-" ? "-" : " "}lb`
    )
    .replace(new RegExp(String.raw`${num}(\s|-)?(?:m|Meter)(?![a-zäöü])`, "g"), (_m, a, sep) =>
      `${nf.format(mToFt(parseNum(a)))}${sep === "-" ? "-" : " "}ft`
    );
}

// ── Rechner ─────────────────────────────────────────────────────────────

export type CalcCategory = {
  key: string;
  label: string;
  from: string;
  to: string;
  convert: (v: number, mode: ConversionMode) => number;
  back: (v: number, mode: ConversionMode) => number;
  presets: number[];
  /** Hängt das Ergebnis von Spieltisch/exakt ab? */
  modeDependent: boolean;
};

export const CALC_CATEGORIES: CalcCategory[] = [
  { key: "length", label: "Länge", from: "ft", to: "m", convert: ftToM, back: mToFt, presets: [5, 10, 15, 20, 30, 60, 120], modeDependent: true },
  { key: "distance", label: "Strecke", from: "mi", to: "km", convert: miToKm, back: kmToMi, presets: [1, 3, 8, 24], modeDependent: true },
  { key: "weight", label: "Gewicht", from: "lb", to: "kg", convert: lbToKg, back: kgToLb, presets: [1, 5, 10, 50, 150], modeDependent: true },
  { key: "volume", label: "Volumen", from: "gal", to: "l", convert: galToL, back: lToGal, presets: [1, 5, 10], modeDependent: true },
  {
    key: "squares",
    label: "Felder",
    from: "ft",
    to: "Felder",
    convert: v => round(v / 5),
    back: v => v * 5,
    presets: [5, 30, 60, 120],
    modeDependent: false,
  },
  {
    key: "squaresMetric",
    label: "Felder",
    from: "m",
    to: "Felder",
    convert: v => round(v / 1.5),
    back: v => round(v * 1.5),
    presets: [1.5, 9, 18, 36],
    modeDependent: false,
  },
  {
    key: "time",
    label: "Zeit",
    from: "Runden",
    to: "Minuten",
    convert: v => round(v / 10),
    back: v => v * 10,
    presets: [1, 10, 100],
    modeDependent: false,
  },
  {
    key: "temperature",
    label: "Temperatur",
    from: "°F",
    to: "°C",
    convert: v => round(((v - 32) * 5) / 9, 1),
    back: v => round((v * 9) / 5 + 32, 1),
    presets: [32, 50, 77, 100],
    modeDependent: false,
  },
];

/** Rechner-Kategorien passend zum Einheitensystem (Felder in ft bzw. m). */
export function calcCategories(system: UnitSystem) {
  return CALC_CATEGORIES.filter(c => (system === "metric" ? c.key !== "squares" : c.key !== "squaresMetric"));
}

/** Münzen in Kupfer (EM = 50 KM). */
export const COINS = [
  { key: "pp", label: "PM", cp: 1000 },
  { key: "gp", label: "GM", cp: 100 },
  { key: "ep", label: "EM", cp: 50 },
  { key: "sp", label: "SM", cp: 10 },
  { key: "cp", label: "KM", cp: 1 },
] as const;
