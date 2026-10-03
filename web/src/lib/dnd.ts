import type { Ruleset } from "./types";

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Stärke",
  dex: "Geschicklichkeit",
  con: "Konstitution",
  int: "Intelligenz",
  wis: "Weisheit",
  cha: "Charisma",
};

export const ABILITY_SHORT: Record<Ability, string> = {
  str: "STR",
  dex: "GES",
  con: "KON",
  int: "INT",
  wis: "WEI",
  cha: "CHA",
};

export const SKILLS = [
  { key: "acrobatics", name: "Akrobatik", ability: "dex" },
  { key: "animalHandling", name: "Mit Tieren umgehen", ability: "wis" },
  { key: "arcana", name: "Arkane Kunde", ability: "int" },
  { key: "athletics", name: "Athletik", ability: "str" },
  { key: "deception", name: "Täuschen", ability: "cha" },
  { key: "history", name: "Geschichte", ability: "int" },
  { key: "insight", name: "Motiv erkennen", ability: "wis" },
  { key: "intimidation", name: "Einschüchtern", ability: "cha" },
  { key: "investigation", name: "Nachforschungen", ability: "int" },
  { key: "medicine", name: "Heilkunde", ability: "wis" },
  { key: "nature", name: "Naturkunde", ability: "int" },
  { key: "perception", name: "Wahrnehmung", ability: "wis" },
  { key: "performance", name: "Auftreten", ability: "cha" },
  { key: "persuasion", name: "Überzeugen", ability: "cha" },
  { key: "religion", name: "Religion", ability: "int" },
  { key: "sleightOfHand", name: "Fingerfertigkeit", ability: "dex" },
  { key: "stealth", name: "Heimlichkeit", ability: "dex" },
  { key: "survival", name: "Überlebenskunst", ability: "wis" },
] as const satisfies readonly { key: string; name: string; ability: Ability }[];

export type SkillKey = (typeof SKILLS)[number]["key"];

/** Klassen mit Trefferwürfel und Zauberattribut (gleich in 2014 und 2024). */
export const CLASSES = [
  { name: "Barbar", hitDie: 12, spellAbility: null },
  { name: "Barde", hitDie: 8, spellAbility: "cha" },
  { name: "Druide", hitDie: 8, spellAbility: "wis" },
  { name: "Hexenmeister", hitDie: 8, spellAbility: "cha" },
  { name: "Kämpfer", hitDie: 10, spellAbility: null },
  { name: "Kleriker", hitDie: 8, spellAbility: "wis" },
  { name: "Magier", hitDie: 6, spellAbility: "int" },
  { name: "Mönch", hitDie: 8, spellAbility: null },
  { name: "Paladin", hitDie: 10, spellAbility: "cha" },
  { name: "Schurke", hitDie: 8, spellAbility: null },
  { name: "Waldläufer", hitDie: 10, spellAbility: "wis" },
  { name: "Zauberer", hitDie: 6, spellAbility: "cha" },
] as const;

export const CONDITIONS = [
  "Betäubt",
  "Bewusstlos",
  "Blind",
  "Bezaubert",
  "Festgesetzt",
  "Gelähmt",
  "Gepackt",
  "Kampfunfähig",
  "Liegend",
  "Taub",
  "Unsichtbar",
  "Verängstigt",
  "Vergiftet",
  "Versteinert",
] as const;

export const SPELL_LEVEL_NAMES = [
  "Zaubertricks",
  "Grad 1",
  "Grad 2",
  "Grad 3",
  "Grad 4",
  "Grad 5",
  "Grad 6",
  "Grad 7",
  "Grad 8",
  "Grad 9",
];

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  const lvl = Math.min(20, Math.max(1, level || 1));
  return 2 + Math.floor((lvl - 1) / 4);
}

export function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Zaubertrick-Skalierung: Stufe 5/11/17 → 2/3/4 Würfel. */
export function cantripMultiplier(characterLevel: number): number {
  if (characterLevel >= 17) return 4;
  if (characterLevel >= 11) return 3;
  if (characterLevel >= 5) return 2;
  return 1;
}

export type RollKind = "check" | "save" | "attack" | "initiative" | "skill" | "deathSave";

/**
 * Auswirkungen der Erschöpfung auf W20-Würfe.
 *  - 2024: jede Stufe −2 auf alle W20-Tests.
 *  - 2014: Stufe 1+ Nachteil auf Attributswürfe, Stufe 3+ Nachteil auf
 *    Angriffs- und Rettungswürfe.
 */
export function exhaustionEffect(ruleset: Ruleset, level: number, kind: RollKind) {
  if (!level) return { penalty: 0, disadvantage: false, note: "" };
  if (ruleset === "2024") {
    return {
      penalty: -2 * level,
      disadvantage: false,
      note: `Erschöpfung ${level}: ${-2 * level} auf W20-Tests`,
    };
  }
  const isCheck = kind === "check" || kind === "skill" || kind === "initiative";
  const disadvantage = (isCheck && level >= 1) || ((kind === "attack" || kind === "save" || kind === "deathSave") && level >= 3);
  return {
    penalty: 0,
    disadvantage,
    note: disadvantage ? `Erschöpfung ${level}: Nachteil` : "",
  };
}

export type ConditionEffect = { sources: { label: string; mode: "advantage" | "disadvantage" }[]; notes: string[] };

/**
 * Vorteil/Nachteil aus Zuständen für eigene Würfe, soweit eindeutig.
 * Bedingte Fälle (z. B. Verängstigt nur in Sicht der Quelle) werden trotzdem
 * gesetzt; im Würfeldialog lässt sich gegensteuern.
 */
export function conditionEffect(conditions: string[], kind: RollKind, ability: Ability | null, ruleset: Ruleset): ConditionEffect {
  const out: ConditionEffect = { sources: [], notes: [] };
  const has = (name: string) => conditions.includes(name);
  const dis = (label: string) => out.sources.push({ label, mode: "disadvantage" });
  const isCheck = kind === "check" || kind === "skill" || kind === "initiative";
  if (kind === "attack") {
    for (const name of ["Blind", "Liegend", "Festgesetzt", "Vergiftet", "Verängstigt"]) if (has(name)) dis(name);
    if (has("Unsichtbar")) out.sources.push({ label: "Unsichtbar", mode: "advantage" });
    if (has("Gepackt") && ruleset === "2024") out.notes.push("Gepackt: Nachteil auf Angriffe gegen andere als den Packenden.");
  }
  if (isCheck) {
    for (const name of ["Vergiftet", "Verängstigt"]) if (has(name)) dis(name);
  }
  if (kind === "initiative" && ruleset === "2024") {
    if (has("Unsichtbar")) out.sources.push({ label: "Unsichtbar", mode: "advantage" });
    if (has("Kampfunfähig")) dis("Kampfunfähig");
  }
  if (kind === "save") {
    if (ability === "dex" && has("Festgesetzt")) dis("Festgesetzt");
    const autoFail = ["Betäubt", "Bewusstlos", "Gelähmt", "Versteinert"].filter(has);
    if (autoFail.length && (ability === "str" || ability === "dex")) out.notes.push(`${autoFail.join(", ")}: STR- und GES-Rettungswürfe scheitern automatisch.`);
  }
  return out;
}

/** Bezeichnungen, die sich zwischen den Regelversionen unterscheiden. */
export function rulesTerms(ruleset: Ruleset) {
  return ruleset === "2024"
    ? { species: "Spezies", inspiration: "Heroische Inspiration", spellLevel: "Grad" }
    : { species: "Volk", inspiration: "Inspiration", spellLevel: "Grad" };
}
