import { get } from "../../lib/api";
import { type CharacterData, spellMod, totalLevel } from "../../lib/character";
import { ABILITY_SHORT, cantripMultiplier, type Ability } from "../../lib/dnd";
import { addExpr, formatDice, parseDice, scaleExpr } from "../../lib/dice";
import { addEffect } from "../../lib/features";
import type { Ruleset, Spell, SpellData, SrdSpellList } from "../../lib/types";

/** Charakter, mit dessen Werten gewürfelt wird. */
export type RollChar = { id: string; name: string; data: CharacterData };

// ── SRD-Liste (einmal pro Regelversion laden) ─────────────────────────────
const srdCache = new Map<Ruleset, Promise<SrdSpellList>>();

export function loadSrd(ruleset: Ruleset): Promise<SrdSpellList> {
  let p = srdCache.get(ruleset);
  if (!p) {
    p = get<SrdSpellList>(`/api/srd/spells/${ruleset}`);
    p.catch(() => srdCache.delete(ruleset));
    srdCache.set(ruleset, p);
  }
  return p;
}

// ── Übersetzungen für die Anzeige (SRD-Daten sind englisch) ─────────────
const SCHOOLS: Record<string, string> = {
  abjuration: "Bannmagie",
  conjuration: "Beschwörung",
  divination: "Erkenntnismagie",
  enchantment: "Verzauberung",
  evocation: "Hervorrufung",
  illusion: "Illusion",
  necromancy: "Nekromantie",
  transmutation: "Verwandlung",
};
export const SCHOOL_OPTIONS = Object.values(SCHOOLS);

const DAMAGE_TYPES: Record<string, string> = {
  acid: "Säure",
  bludgeoning: "Wucht",
  cold: "Kälte",
  fire: "Feuer",
  force: "Energie",
  lightning: "Blitz",
  necrotic: "Nekrotisch",
  piercing: "Stich",
  poison: "Gift",
  psychic: "Psychisch",
  radiant: "Gleissend",
  slashing: "Hieb",
  thunder: "Schall",
};
export const DAMAGE_TYPE_OPTIONS = Object.values(DAMAGE_TYPES);

const CLASS_NAMES: Record<string, string> = {
  bard: "Barde",
  cleric: "Kleriker",
  druid: "Druide",
  paladin: "Paladin",
  ranger: "Waldläufer",
  sorcerer: "Zauberer",
  warlock: "Hexenmeister",
  wizard: "Magier",
  artificer: "Magieschmied",
};

const tr = (map: Record<string, string>, v: string | null | undefined) =>
  v ? (map[v.trim().toLowerCase()] ?? v) : "";

export const schoolName = (v: string | null | undefined) => tr(SCHOOLS, v);
export const damageTypeName = (v: string | null | undefined) => tr(DAMAGE_TYPES, v);
export const className = (v: string | null | undefined) => tr(CLASS_NAMES, v);

export const SAVE_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export function saveLabel(save: string | null | undefined) {
  if (!save) return "";
  const short = ABILITY_SHORT[save as Ability] ?? save.toUpperCase();
  return `${short}-Rettungswurf`;
}

export function emptySpellData(): SpellData {
  return {
    school: "",
    castingTime: "",
    range: "",
    components: "",
    duration: "",
    concentration: false,
    ritual: false,
    classes: [],
    description: "",
    higherLevel: "",
    attack: null,
    save: null,
    damage: null,
    damageType: null,
    heal: null,
    healAddsModifier: false,
    upcast: null,
    acMod: null,
  };
}

/** Rundenzahl aus der Wirkungsdauer, z. B. "Concentration, up to 1 minute", "8 Stunden" */
export function spellRounds(duration: string): number | null {
  const m = /(\d+)\s*(round|runde|minute|hour|stunde)/i.exec(duration);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return unit.startsWith("r") ? n : unit.startsWith("m") ? n * 10 : n * 600;
}

/** Bekannte SRD-Zauber mit Wirkung auf die RK (lässt sich im Zauber anpassen). */
export function srdAcMod(key: string | null, ruleset: Ruleset): SpellData["acMod"] {
  switch (key) {
    case "mage-armor":
      return { mode: "base", value: 13 };
    case "shield":
      return { mode: "bonus", value: 5 };
    case "shield-of-faith":
    case "haste":
      return { mode: "bonus", value: 2 };
    case "barkskin":
      return { mode: "min", value: ruleset === "2024" ? 17 : 16 };
    default:
      return null;
  }
}

/**
 * Nach dem Wirken: Konzentration und RK-Wirkung als aktiven Effekt anlegen.
 * Gibt Hinweise zurück (z. B. beendete Konzentration).
 */
export function applySpellEffect(c: CharacterData, s: Spell, ruleset: Ruleset = "2024"): string[] {
  // Ältere SRD-Zauber ohne eigenes Feld: bekannte Werte verwenden
  const mod = s.data.acMod === undefined ? srdAcMod(s.srdKey, ruleset) : s.data.acMod;
  const ac = mod && mod.value ? mod : null;
  if (!s.data.concentration && !ac) return [];
  return addEffect(c, {
    name: s.name,
    featureId: null,
    remaining: spellRounds(s.data.duration ?? ""),
    concentration: Boolean(s.data.concentration),
    note: "Zauber",
    ac,
  });
}

/** Füllt fehlende Felder mit Standardwerten. */
export function fullData(data: Partial<SpellData> | null | undefined): SpellData {
  return { ...emptySpellData(), ...(data ?? {}) };
}

export function isPrepared(spell: Spell) {
  return spell.level === 0 || spell.alwaysPrepared || spell.prepared;
}

/**
 * Würfelausdruck für Schaden/Heilung bei gegebenem Zauberplatz-Grad.
 * Zaubertricks skalieren mit der Charakterstufe, Grad-Zauber mit `upcast`.
 */
export function spellDice(
  spell: Spell,
  kind: "damage" | "heal",
  char: CharacterData | null,
  slotLevel: number
): string | null {
  const d = spell.data;
  let expr = parseDice(kind === "damage" ? d.damage : d.heal);
  if (!expr) return null;
  if (spell.level === 0) {
    if (char) expr = scaleExpr(expr, cantripMultiplier(totalLevel(char)));
  } else {
    const extra = Math.max(0, slotLevel - spell.level);
    const up = parseDice(d.upcast);
    if (extra && up) expr = addExpr(expr, { groups: scaleExpr(up, extra).groups, bonus: up.bonus * extra });
  }
  if (kind === "heal" && d.healAddsModifier && char) {
    expr = addExpr(expr, { groups: [], bonus: spellMod(char) });
  }
  return formatDice(expr).replaceAll("−", "-");
}
