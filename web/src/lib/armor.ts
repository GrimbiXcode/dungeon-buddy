/**
 * Rüstungen, Schilde und die daraus berechnete Rüstungsklasse.
 *
 * Werte sind in 5e 2014 und 2024 gleich. Aktive Effekte (Schild-Zauber,
 * Magierrüstung, Schild des Glaubens eines Mitspielers …) und passive
 * Fähigkeiten (Kampfstil Verteidigung) fliessen über ihren RK-Modifikator ein.
 */
import type { CharacterData } from "./character";
import { abilityMod } from "./dnd";
import { uid } from "./format";
import type { AcMod } from "./features";

export const ARMOR_TYPES = [
  { key: "light", label: "Leichte Rüstung" },
  { key: "medium", label: "Mittelschwere Rüstung" },
  { key: "heavy", label: "Schwere Rüstung" },
  { key: "shield", label: "Schild" },
] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number]["key"];

export const UNARMORED_DEFENSES = [
  { key: "none", label: "Keine (10 + GES)" },
  { key: "barbarian", label: "Barbar (10 + GES + KON)" },
  { key: "monk", label: "Mönch (10 + GES + WEI, ohne Schild)" },
] as const;
export type UnarmoredDefense = (typeof UNARMORED_DEFENSES)[number]["key"];

export type ArmorItem = {
  id: string;
  name: string;
  type: ArmorType;
  /** Grund-RK; beim Schild der Bonus (+2) */
  baseAc: number;
  /** Magischer Bonus, z. B. +1 */
  bonus: number;
  /** Höchstens so viel GES; null = unbegrenzt. Schwere Rüstung ignoriert GES. */
  dexCap: number | null;
  /** Mindeststärke, sonst −3 m Bewegung (0 = keine) */
  strength: number;
  stealthDisadvantage: boolean;
  /** Angelegt bzw. Schild getragen */
  equipped: boolean;
  notes: string;
};

export function newArmor(partial: Partial<ArmorItem> = {}): ArmorItem {
  return {
    id: uid(),
    name: "",
    type: "light",
    baseAc: 11,
    bonus: 0,
    dexCap: null,
    strength: 0,
    stealthDisadvantage: false,
    equipped: false,
    notes: "",
    ...partial,
  };
}

/** Standardrüstungen aus dem SRD (2014 und 2024 identisch). */
export const ARMOR_PRESETS: Omit<ArmorItem, "id" | "equipped" | "notes" | "bonus">[] = [
  { name: "Gepolsterte Rüstung", type: "light", baseAc: 11, dexCap: null, strength: 0, stealthDisadvantage: true },
  { name: "Lederrüstung", type: "light", baseAc: 11, dexCap: null, strength: 0, stealthDisadvantage: false },
  { name: "Beschlagene Lederrüstung", type: "light", baseAc: 12, dexCap: null, strength: 0, stealthDisadvantage: false },
  { name: "Fellrüstung", type: "medium", baseAc: 12, dexCap: 2, strength: 0, stealthDisadvantage: false },
  { name: "Kettenhemd", type: "medium", baseAc: 13, dexCap: 2, strength: 0, stealthDisadvantage: false },
  { name: "Schuppenpanzer", type: "medium", baseAc: 14, dexCap: 2, strength: 0, stealthDisadvantage: true },
  { name: "Brustplatte", type: "medium", baseAc: 14, dexCap: 2, strength: 0, stealthDisadvantage: false },
  { name: "Halbplattenrüstung", type: "medium", baseAc: 15, dexCap: 2, strength: 0, stealthDisadvantage: true },
  { name: "Ringpanzer", type: "heavy", baseAc: 14, dexCap: 0, strength: 0, stealthDisadvantage: true },
  { name: "Kettenpanzer", type: "heavy", baseAc: 16, dexCap: 0, strength: 13, stealthDisadvantage: true },
  { name: "Schienenpanzer", type: "heavy", baseAc: 17, dexCap: 0, strength: 15, stealthDisadvantage: true },
  { name: "Plattenpanzer", type: "heavy", baseAc: 18, dexCap: 0, strength: 15, stealthDisadvantage: true },
  { name: "Schild", type: "shield", baseAc: 2, dexCap: null, strength: 0, stealthDisadvantage: false },
];

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function normalizeArmor(raw: unknown): ArmorItem {
  const o = obj(raw);
  const type = ARMOR_TYPES.some(t => t.key === o.type) ? (o.type as ArmorType) : "light";
  return newArmor({
    id: typeof o.id === "string" && o.id ? o.id : uid(),
    name: typeof o.name === "string" ? o.name : "",
    type,
    baseAc: num(o.baseAc, type === "shield" ? 2 : 11),
    bonus: num(o.bonus, 0),
    dexCap: typeof o.dexCap === "number" ? Math.max(0, o.dexCap) : null,
    strength: Math.max(0, num(o.strength, 0)),
    stealthDisadvantage: o.stealthDisadvantage === true,
    equipped: o.equipped === true,
    notes: typeof o.notes === "string" ? o.notes : "",
  });
}

export const isShield = (a: ArmorItem) => a.type === "shield";

export function wornArmor(c: CharacterData) {
  return c.armor.find(a => a.equipped && !isShield(a)) ?? null;
}

export function wornShield(c: CharacterData) {
  return c.armor.find(a => a.equipped && isShield(a)) ?? null;
}

/**
 * Anlegen/Ablegen. Es kann nur eine Rüstung und ein Schild gleichzeitig
 * getragen werden; das Anlegen legt die bisherige ab.
 */
export function setEquipped(c: CharacterData, item: ArmorItem, equipped: boolean) {
  if (equipped) {
    for (const a of c.armor) if (a.id !== item.id && isShield(a) === isShield(item)) a.equipped = false;
  }
  item.equipped = equipped;
}

export type AcPart = { label: string; value: number };
export type AcResult = { total: number; parts: AcPart[]; notes: string[] };

/** RK-Wirkungen aus passiven Fähigkeiten und aktiven Effekten. */
export function acSources(c: CharacterData): { label: string; mod: AcMod }[] {
  const out: { label: string; mod: AcMod }[] = [];
  for (const f of c.features) {
    if (f.activation === "passive" && f.acMod.mode !== "none") out.push({ label: f.name, mod: f.acMod });
  }
  for (const e of c.combat.effects) {
    const feature = e.featureId ? c.features.find(f => f.id === e.featureId) : undefined;
    const mod = feature && feature.acMod.mode !== "none" ? feature.acMod : e.ac;
    if (mod && mod.mode !== "none") out.push({ label: e.name, mod });
  }
  return out;
}

export function armorClass(c: CharacterData): AcResult {
  const parts: AcPart[] = [];
  const notes: string[] = [];
  const sources = acSources(c);
  const dex = abilityMod(c.abilities.dex);
  const shield = wornShield(c);

  if (c.acMode === "manual") {
    parts.push({ label: "Grundwert (manuell)", value: c.ac });
  } else {
    const body = wornArmor(c);
    if (body) {
      parts.push({ label: body.name || "Rüstung", value: body.baseAc + body.bonus });
      const cap = body.type === "heavy" ? 0 : body.dexCap;
      const dexPart = cap == null ? dex : Math.min(dex, cap);
      if (dexPart) parts.push({ label: cap != null && dex > cap ? `GES (max. ${cap})` : "GES", value: dexPart });
      if (body.strength && c.abilities.str < body.strength) notes.push(`${body.name}: STR ${body.strength} nötig, sonst −3 m (10 ft) Bewegung.`);
      if (body.stealthDisadvantage) notes.push(`${body.name}: Nachteil auf Heimlichkeit.`);
    } else {
      // Ohne Rüstung: die beste verfügbare Formel
      const options: { label: string; parts: AcPart[] }[] = [
        { label: "Ohne Rüstung", parts: [{ label: "Ohne Rüstung", value: 10 }, { label: "GES", value: dex }] },
      ];
      if (c.unarmoredDefense === "barbarian") {
        options.push({
          label: "Ungerüstete Verteidigung",
          parts: [{ label: "Ungerüstete Verteidigung", value: 10 }, { label: "GES", value: dex }, { label: "KON", value: abilityMod(c.abilities.con) }],
        });
      }
      if (c.unarmoredDefense === "monk" && !shield) {
        options.push({
          label: "Ungerüstete Verteidigung",
          parts: [{ label: "Ungerüstete Verteidigung", value: 10 }, { label: "GES", value: dex }, { label: "WEI", value: abilityMod(c.abilities.wis) }],
        });
      }
      for (const s of sources) {
        if (s.mod.mode === "base") options.push({ label: s.label, parts: [{ label: s.label, value: s.mod.value }, { label: "GES", value: dex }] });
      }
      const sum = (p: AcPart[]) => p.reduce((t, x) => t + x.value, 0);
      const best = options.reduce((a, b) => (sum(b.parts) > sum(a.parts) ? b : a));
      parts.push(...best.parts.filter(p => p.value !== 0 || p.label !== "GES"));
    }
  }

  if (shield) parts.push({ label: shield.name || "Schild", value: shield.baseAc + shield.bonus });
  if (c.acBonus) parts.push({ label: "Sonstiger Bonus", value: c.acBonus });
  for (const s of sources) if (s.mod.mode === "bonus" && s.mod.value) parts.push({ label: s.label, value: s.mod.value });

  let total = parts.reduce((t, p) => t + p.value, 0);
  for (const s of sources) {
    if (s.mod.mode === "min" && s.mod.value > total) {
      parts.push({ label: `${s.label} (mindestens ${s.mod.value})`, value: s.mod.value - total });
      total = s.mod.value;
    }
  }
  return { total, parts, notes };
}

/** Getragene Rüstung verlangt Nachteil auf Heimlichkeit? */
export function stealthDisadvantage(c: CharacterData) {
  return Boolean(c.acMode !== "manual" && wornArmor(c)?.stealthDisadvantage);
}
