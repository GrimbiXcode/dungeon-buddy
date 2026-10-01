import {
  ABILITIES,
  SKILLS,
  abilityMod,
  proficiencyBonus,
  type Ability,
  type SkillKey,
} from "./dnd";
import { uid } from "./format";

export type RollModeSetting = "inherit" | "digital" | "physical";

export type ClassEntry = { id: string; name: string; subclass: string; level: number; hitDie: number };

export type Attack = {
  id: string;
  name: string;
  /** Attribut für Treffer- und Schadensbonus; "spell" = Zauberattribut */
  ability: Ability | "spell" | "none";
  proficient: boolean;
  /** Sonstiger Bonus auf den Angriffswurf (magische Waffe, Kampfstil …) */
  toHitBonus: number;
  damage: string;
  /** Attributsmodifikator zum Schaden addieren */
  addAbilityToDamage: boolean;
  damageBonus: number;
  damageType: string;
  /** Waffenmeisterschaft (nur 5e 2024) */
  mastery: string;
  notes: string;
};

export type Resource = {
  id: string;
  name: string;
  max: number;
  used: number;
  reset: "short" | "long" | "none";
};

export type CharacterData = {
  rollMode: RollModeSetting;
  species: string;
  background: string;
  alignment: string;
  classes: ClassEntry[];
  xp: number;
  abilities: Record<Ability, number>;
  saveProficiencies: Record<Ability, boolean>;
  /** 0 = keine, 1 = geübt, 2 = Expertise */
  skills: Record<SkillKey, 0 | 1 | 2>;
  jackOfAllTrades: boolean;
  profBonusOverride: number | null;
  ac: number;
  initiativeBonus: number;
  speed: number;
  hp: { max: number; current: number; temp: number };
  hitDiceUsed: number;
  deathSaves: { successes: number; failures: number };
  inspiration: boolean;
  exhaustion: number;
  conditions: string[];
  attacks: Attack[];
  spellcasting: {
    ability: Ability | null;
    attackBonusExtra: number;
    dcExtra: number;
    slots: { max: number; used: number }[];
    pact: { level: number; max: number; used: number };
  };
  resources: Resource[];
  proficiencies: string;
  languages: string;
  features: string;
  equipment: string;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  appearance: string;
  personality: string;
  backstory: string;
  notes: string;
};

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function newAttack(partial: Partial<Attack> = {}): Attack {
  return {
    id: uid(),
    name: "",
    ability: "str",
    proficient: true,
    toHitBonus: 0,
    damage: "1d8",
    addAbilityToDamage: true,
    damageBonus: 0,
    damageType: "",
    mastery: "",
    notes: "",
    ...partial,
  };
}

export function newResource(partial: Partial<Resource> = {}): Resource {
  return { id: uid(), name: "", max: 1, used: 0, reset: "long", ...partial };
}

/**
 * Bringt beliebige gespeicherte Daten in die aktuelle Form. Fehlende Felder
 * bekommen Standardwerte – so bleiben alte Bögen nach Erweiterungen lesbar.
 */
export function normalizeCharacter(raw: unknown): CharacterData {
  const d = obj(raw);
  const abilities = obj(d.abilities);
  const saves = obj(d.saveProficiencies);
  const skills = obj(d.skills);
  const hp = obj(d.hp);
  const death = obj(d.deathSaves);
  const sc = obj(d.spellcasting);
  const pact = obj(sc.pact);
  const currency = obj(d.currency);
  const slotsRaw = arr(sc.slots);
  const rollMode = str(d.rollMode, "inherit");

  return {
    rollMode: (["inherit", "digital", "physical"].includes(rollMode) ? rollMode : "inherit") as RollModeSetting,
    species: str(d.species),
    background: str(d.background),
    alignment: str(d.alignment),
    classes: arr(d.classes).map(c => {
      const o = obj(c);
      return {
        id: str(o.id) || uid(),
        name: str(o.name),
        subclass: str(o.subclass),
        level: Math.min(20, Math.max(1, num(o.level, 1))),
        hitDie: num(o.hitDie, 8),
      };
    }),
    xp: num(d.xp, 0),
    abilities: Object.fromEntries(ABILITIES.map(a => [a, num(abilities[a], 10)])) as Record<Ability, number>,
    saveProficiencies: Object.fromEntries(ABILITIES.map(a => [a, bool(saves[a])])) as Record<Ability, boolean>,
    skills: Object.fromEntries(
      SKILLS.map(s => {
        const v = num(skills[s.key], 0);
        return [s.key, v === 2 ? 2 : v === 1 ? 1 : 0];
      })
    ) as Record<SkillKey, 0 | 1 | 2>,
    jackOfAllTrades: bool(d.jackOfAllTrades),
    profBonusOverride: typeof d.profBonusOverride === "number" ? d.profBonusOverride : null,
    ac: num(d.ac, 10),
    initiativeBonus: num(d.initiativeBonus, 0),
    speed: num(d.speed, 30),
    hp: { max: num(hp.max, 10), current: num(hp.current, num(hp.max, 10)), temp: num(hp.temp, 0) },
    hitDiceUsed: num(d.hitDiceUsed, 0),
    deathSaves: { successes: num(death.successes, 0), failures: num(death.failures, 0) },
    inspiration: bool(d.inspiration),
    exhaustion: Math.min(6, Math.max(0, num(d.exhaustion, 0))),
    conditions: arr(d.conditions).filter((x): x is string => typeof x === "string"),
    attacks: arr(d.attacks).map(a => {
      const o = obj(a);
      const ability = str(o.ability, "str");
      return newAttack({
        id: str(o.id) || uid(),
        name: str(o.name),
        ability: ([...ABILITIES, "spell", "none"] as string[]).includes(ability) ? (ability as Attack["ability"]) : "str",
        proficient: bool(o.proficient, true),
        toHitBonus: num(o.toHitBonus, 0),
        damage: str(o.damage),
        addAbilityToDamage: bool(o.addAbilityToDamage, true),
        damageBonus: num(o.damageBonus, 0),
        damageType: str(o.damageType),
        mastery: str(o.mastery),
        notes: str(o.notes),
      });
    }),
    spellcasting: {
      ability: (ABILITIES as readonly string[]).includes(str(sc.ability)) ? (sc.ability as Ability) : null,
      attackBonusExtra: num(sc.attackBonusExtra, 0),
      dcExtra: num(sc.dcExtra, 0),
      slots: Array.from({ length: 9 }, (_, i) => {
        const s = obj(slotsRaw[i]);
        return { max: num(s.max, 0), used: num(s.used, 0) };
      }),
      pact: { level: num(pact.level, 1), max: num(pact.max, 0), used: num(pact.used, 0) },
    },
    resources: arr(d.resources).map(r => {
      const o = obj(r);
      const reset = str(o.reset, "long");
      return newResource({
        id: str(o.id) || uid(),
        name: str(o.name),
        max: num(o.max, 1),
        used: num(o.used, 0),
        reset: (["short", "long", "none"].includes(reset) ? reset : "long") as Resource["reset"],
      });
    }),
    proficiencies: str(d.proficiencies),
    languages: str(d.languages),
    features: str(d.features),
    equipment: str(d.equipment),
    currency: {
      cp: num(currency.cp, 0),
      sp: num(currency.sp, 0),
      ep: num(currency.ep, 0),
      gp: num(currency.gp, 0),
      pp: num(currency.pp, 0),
    },
    appearance: str(d.appearance),
    personality: str(d.personality),
    backstory: str(d.backstory),
    notes: str(d.notes),
  };
}

export function newCharacterData(): CharacterData {
  const data = normalizeCharacter({});
  data.classes = [{ id: uid(), name: "", subclass: "", level: 1, hitDie: 8 }];
  return data;
}

// ── Abgeleitete Werte ───────────────────────────────────────────────────

export function totalLevel(c: CharacterData) {
  return Math.max(1, c.classes.reduce((sum, k) => sum + (k.level || 0), 0));
}

export function profBonus(c: CharacterData) {
  return c.profBonusOverride ?? proficiencyBonus(totalLevel(c));
}

export function mod(c: CharacterData, a: Ability) {
  return abilityMod(c.abilities[a]);
}

export function saveBonus(c: CharacterData, a: Ability) {
  return mod(c, a) + (c.saveProficiencies[a] ? profBonus(c) : 0);
}

export function skillBonus(c: CharacterData, key: SkillKey) {
  const skill = SKILLS.find(s => s.key === key)!;
  const level = c.skills[key];
  const pb = profBonus(c);
  const prof = level === 2 ? pb * 2 : level === 1 ? pb : c.jackOfAllTrades ? Math.floor(pb / 2) : 0;
  return mod(c, skill.ability) + prof;
}

export function initiative(c: CharacterData) {
  return mod(c, "dex") + c.initiativeBonus + (c.jackOfAllTrades ? Math.floor(profBonus(c) / 2) : 0);
}

export function passive(c: CharacterData, key: SkillKey) {
  return 10 + skillBonus(c, key);
}

export function spellAttackBonus(c: CharacterData) {
  const a = c.spellcasting.ability;
  return (a ? mod(c, a) : 0) + profBonus(c) + c.spellcasting.attackBonusExtra;
}

export function spellSaveDc(c: CharacterData) {
  const a = c.spellcasting.ability;
  return 8 + (a ? mod(c, a) : 0) + profBonus(c) + c.spellcasting.dcExtra;
}

export function spellMod(c: CharacterData) {
  return c.spellcasting.ability ? mod(c, c.spellcasting.ability) : 0;
}

function attackAbilityMod(c: CharacterData, attack: Attack) {
  if (attack.ability === "none") return 0;
  if (attack.ability === "spell") return spellMod(c);
  return mod(c, attack.ability);
}

export function attackToHit(c: CharacterData, attack: Attack) {
  return attackAbilityMod(c, attack) + (attack.proficient ? profBonus(c) : 0) + attack.toHitBonus;
}

export function attackDamageBonus(c: CharacterData, attack: Attack) {
  return (attack.addAbilityToDamage ? attackAbilityMod(c, attack) : 0) + attack.damageBonus;
}

export function hitDiceSummary(c: CharacterData) {
  const byDie = new Map<number, number>();
  for (const k of c.classes) byDie.set(k.hitDie, (byDie.get(k.hitDie) ?? 0) + k.level);
  return [...byDie.entries()].map(([die, count]) => `${count}W${die}`).join(" + ");
}

export function classSummary(c: CharacterData) {
  return c.classes
    .filter(k => k.name)
    .map(k => `${k.name}${k.subclass ? ` (${k.subclass})` : ""} ${k.level}`)
    .join(" / ");
}

// ── Rasten ──────────────────────────────────────────────────────────────

export function shortRest(c: CharacterData) {
  c.spellcasting.pact.used = 0;
  for (const r of c.resources) if (r.reset === "short") r.used = 0;
}

export function longRest(c: CharacterData, ruleset: "2014" | "2024") {
  c.hp.current = c.hp.max;
  c.hp.temp = 0;
  c.deathSaves = { successes: 0, failures: 0 };
  for (const s of c.spellcasting.slots) s.used = 0;
  c.spellcasting.pact.used = 0;
  for (const r of c.resources) if (r.reset !== "none") r.used = 0;
  // Trefferwürfel: 2014 die Hälfte zurück, 2024 alle
  const total = totalLevel(c);
  const regain = ruleset === "2024" ? total : Math.max(1, Math.floor(total / 2));
  c.hitDiceUsed = Math.max(0, c.hitDiceUsed - regain);
  c.exhaustion = Math.max(0, c.exhaustion - 1);
}

/** Schaden anwenden: zuerst temporäre TP, dann aktuelle. */
export function applyDamage(c: CharacterData, amount: number) {
  let rest = Math.max(0, amount);
  const fromTemp = Math.min(c.hp.temp, rest);
  c.hp.temp -= fromTemp;
  rest -= fromTemp;
  c.hp.current = Math.max(0, c.hp.current - rest);
}

export function applyHealing(c: CharacterData, amount: number) {
  if (amount <= 0) return;
  if (c.hp.current === 0) c.deathSaves = { successes: 0, failures: 0 };
  c.hp.current = Math.min(c.hp.max, c.hp.current + amount);
}
