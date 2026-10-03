/**
 * Konfigurierbare Fähigkeiten (Klassenmerkmale, Herkunft, Talente,
 * Ausrüstung, …) und der Zustand des Kampf-Assistenten.
 *
 * Alles liegt in den Charakterdaten (jsonb) und wird über
 * `normalizeFeature` / `normalizeCombat` in Form gebracht.
 */
import type { Attack, CharacterData, Resource } from "./character";
import { ABILITIES, ABILITY_SHORT, SKILLS, abilityMod, proficiencyBonus, type Ability, type RollKind, type SkillKey } from "./dnd";
import { addExpr, formatBonus, parseBonus, parseDice, type DiceExpr, type DiceGroup } from "./dice";
import { uid } from "./format";

// ── Auswahllisten ───────────────────────────────────────────────────────

export const ACTIVATIONS = [
  { key: "before", label: "Vor der Aktion", short: "Vorher", hint: "Vor einem Angriff oder einer Aktion aktivieren" },
  { key: "action", label: "Aktion", short: "Aktion", hint: "Kostet deine Aktion" },
  { key: "bonus", label: "Bonusaktion", short: "Bonus", hint: "Kostet deine Bonusaktion" },
  { key: "reaction", label: "Reaktion", short: "Reaktion", hint: "Kostet deine Reaktion" },
  { key: "free", label: "Freie Option", short: "Frei", hint: "Ohne Aktionskosten, z. B. bei einem Treffer" },
  { key: "passive", label: "Passiv", short: "Passiv", hint: "Wirkt immer" },
] as const;
export type Activation = (typeof ACTIVATIONS)[number]["key"];

export const EFFECT_TYPES = [
  { key: "damage", label: "Schaden" },
  { key: "buff", label: "Buff" },
  { key: "debuff", label: "Debuff" },
  { key: "healing", label: "Heilung" },
  { key: "defense", label: "Verteidigung" },
  { key: "control", label: "Kontrolle" },
  { key: "mobility", label: "Bewegung" },
  { key: "utility", label: "Nutzen" },
  { key: "fluff", label: "Fluff" },
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number]["key"];

export const TARGETS = [
  { key: "self", label: "Selbst" },
  { key: "ally", label: "Verbündete" },
  { key: "enemy", label: "Gegner" },
  { key: "area", label: "Bereich" },
  { key: "object", label: "Objekt" },
  { key: "any", label: "Beliebig" },
] as const;
export type Target = (typeof TARGETS)[number]["key"];

export const TRIGGERS = [
  { key: "attack", label: "Beim Angriff" },
  { key: "hit", label: "Bei Treffer" },
  { key: "crit", label: "Bei kritischem Treffer" },
  { key: "miss", label: "Bei Fehlschlag" },
  { key: "attacked", label: "Wenn du angegriffen wirst" },
  { key: "damaged", label: "Wenn du Schaden nimmst" },
  { key: "save", label: "Bei Rettungswurf" },
  { key: "check", label: "Bei Attributswurf" },
  { key: "turnStart", label: "Zu Zugbeginn" },
  { key: "turnEnd", label: "Zu Zugende" },
] as const;
export type Trigger = (typeof TRIGGERS)[number]["key"];

export const DURATIONS = [
  { key: "instant", label: "Sofort" },
  { key: "rounds", label: "Runden" },
  { key: "minutes", label: "Minuten" },
  { key: "hours", label: "Stunden" },
  { key: "concentration", label: "Konzentration (Minuten)" },
  { key: "untilShort", label: "Bis zur kurzen Rast" },
  { key: "untilLong", label: "Bis zur langen Rast" },
  { key: "special", label: "Speziell" },
] as const;
export type DurationKind = (typeof DURATIONS)[number]["key"];

export const USE_RESETS = [
  { key: "turn", label: "pro Zug" },
  { key: "short", label: "kurze Rast" },
  { key: "long", label: "lange Rast" },
  { key: "dawn", label: "Tagesanbruch" },
  { key: "none", label: "nie" },
] as const;
export type UseReset = (typeof USE_RESETS)[number]["key"];

export const SCOPES = [
  { key: "none", label: "Kein Angriffsbezug" },
  { key: "all", label: "Alle Angriffe" },
  { key: "melee", label: "Nahkampfangriffe" },
  { key: "ranged", label: "Fernkampfangriffe" },
  { key: "weapon", label: "Alle Waffenangriffe" },
  { key: "spell", label: "Zauberangriffe" },
  { key: "specific", label: "Bestimmte Waffen" },
] as const;
export type Scope = (typeof SCOPES)[number]["key"];

/** Würfe, die eine Fähigkeit verändern kann. */
export const ROLL_TARGETS = [
  { key: "attack", label: "Angriffswurf" },
  { key: "damage", label: "Schadenswurf" },
  { key: "check", label: "Attributswurf" },
  { key: "skill", label: "Fertigkeitswurf" },
  { key: "save", label: "Rettungswurf" },
  { key: "initiative", label: "Initiative" },
  { key: "deathSave", label: "Todesrettungswurf" },
] as const;
export type RollTarget = (typeof ROLL_TARGETS)[number]["key"];

export const ADV_MODES = [
  { key: "none", label: "–" },
  { key: "advantage", label: "Vorteil" },
  { key: "disadvantage", label: "Nachteil" },
] as const;
export type AdvantageMode = (typeof ADV_MODES)[number]["key"];

/** Wirkung auf die Rüstungsklasse (Schild-Zauber, Magierrüstung, Rindenhaut …) */
export const AC_MODES = [
  { key: "none", label: "Keine" },
  { key: "bonus", label: "Bonus auf die RK" },
  { key: "base", label: "Grund-RK + GES (ohne Rüstung)" },
  { key: "min", label: "RK mindestens" },
] as const;
export type AcModMode = (typeof AC_MODES)[number]["key"];

/** Was beim Schadens-/Heilungswurf zusätzlich dazukommt (Durchschnaufen: 1W10 + Kämpferstufe). */
export const DAMAGE_ADDS = [
  { key: "ability", label: "Attribut-Mod." },
  { key: "level", label: "Stufe (gesamt)" },
  { key: "classLevel", label: "Klassenstufe" },
  { key: "proficiency", label: "Übungsbonus" },
] as const;
export type DamageAddKind = (typeof DAMAGE_ADDS)[number]["key"];
/** abilities: mehrere Attribute = im Kampf wählen (vorgeschlagen wird der höchste Modifikator) */
export type DamageAdd = { kind: DamageAddKind; abilities: Ability[]; className: string };

export function newDamageAdd(partial: Partial<DamageAdd> = {}): DamageAdd {
  return { kind: "ability", abilities: ["con"], className: "", ...partial };
}

/** Gewähltes Attribut je Zuschlag (Index in `damageAdds`), falls mehrere zur Wahl stehen */
export type AbilityPicks = Partial<Record<number, Ability>>;

export const LINK_WHEN = [
  { key: "use", label: "beim Einsetzen" },
  { key: "success", label: "wenn es gelingt (selbst bestätigen)" },
] as const;
export type LinkWhen = (typeof LINK_WHEN)[number]["key"];

/** Vorgeschlagene Kategorien; eigene sind jederzeit möglich. */
export function baseCategories(speciesLabel: string) {
  return ["Klasse", "Unterklasse", speciesLabel, "Hintergrund", "Talent", "Ausrüstung", "Magischer Gegenstand", "Sonstiges"];
}

/** Alphabetisch sortiert */
export const WEAPON_PROPERTIES = [
  "Finesse",
  "Geschosse",
  "Laden",
  "Leicht",
  "Magisch",
  "Schwer",
  "Versilbert",
  "Vielseitig",
  "Weitreichend",
  "Wurfwaffe",
  "Zweihändig",
] as const;

// ── Typen ───────────────────────────────────────────────────────────────

/**
 * Veränderung eines Wurfs, z. B. +1W4 auf Angriffe und Rettungswürfe (Segen),
 * +1W10 auf einen Attributswurf (Taktisches Verständnis) oder Vorteil.
 * Angriff/Schaden gelten für die Angriffe aus „Gilt für“.
 */
export type RollMod = {
  target: RollTarget;
  /** Nur Würfe mit diesem Attribut (Attributs- und Rettungswürfe); null = alle */
  ability: Ability | null;
  /** Nur diese Fertigkeit; null = alle */
  skill: SkillKey | null;
  /** Zahl oder Würfel, z. B. "2", "1d4", "-1d4" */
  bonus: string;
  mode: AdvantageMode;
};

export type AcMod = { mode: AcModMode; value: number };

/**
 * Abhängigkeit zu einer anderen Fähigkeit: Taktisches Verständnis verbraucht
 * z. B. eine Nutzung von Durchschnaufen, wenn es gelingt.
 */
export type FeatureLink = { featureId: string; cost: number; when: LinkWhen };

export type Feature = {
  id: string;
  name: string;
  /** Herkunft im Bogen: Klasse, Spezies, Talent, Ausrüstung … oder eigene (mehrere möglich; die erste gruppiert die Liste) */
  categories: string[];
  /** Eigene Kategorien / Schlagworte zum Filtern */
  tags: string[];
  description: string;
  activation: Activation;
  effectType: EffectType;
  target: Target;
  /** Freitext zum Ziel, z. B. "1 Kreatur in 9 m" */
  targetText: string;
  /** Kurz: was bringt es? z. B. "+2 RK", "Vorteil auf STR-Würfe" */
  benefit: string;
  /** Voraussetzungen, z. B. "nur mit Finesse-Waffe" */
  condition: string;
  damage: string;
  /** Zum Würfelergebnis addiert: Attributsmodifikator, Stufe, Klassenstufe, Übungsbonus */
  damageAdds: DamageAdd[];
  damageType: string;
  /** Schadensart des auslösenden Angriffs übernehmen (Weit ausholender Angriff) statt `damageType` */
  damageTypeFromAttack: boolean;
  /** Schaden trifft ein weiteres Ziel: eigener Wurf statt Zuschlag auf den Angriffsschaden */
  damageOtherTarget: boolean;
  /** Sonstige Wirkung des Wurfs statt Schaden/Heilung, z. B. "vom erlittenen Schaden abziehen" */
  effectText: string;
  /** Rettungswurf der Ziele, z. B. "GES-Rettungswurf, halber Schaden" */
  save: string;
  duration: { kind: DurationKind; amount: number; text: string };
  /** max = null: beliebig oft */
  uses: { max: number | null; used: number; reset: UseReset };
  /** Alternativ/zusätzlich: verbraucht eine Ressource (Ki, Kanalisieren …) */
  resourceId: string | null;
  resourceCost: number;
  triggers: Trigger[];
  appliesTo: { scope: Scope; attackIds: string[] };
  /** Veränderte Würfe (Angriff, Schaden, Attribut, Rettung …) */
  rollMods: RollMod[];
  /** Wirkung auf die RK, solange die Fähigkeit wirkt (passiv oder aktiver Effekt) */
  acMod: AcMod;
  /** Verbraucht Nutzungen anderer Fähigkeiten */
  links: FeatureLink[];
};

export type ActiveEffect = {
  id: string;
  name: string;
  featureId: string | null;
  /** Verbleibende Runden; null = unbestimmt (bis Rast, speziell) */
  remaining: number | null;
  concentration: boolean;
  note: string;
  /** RK-Wirkung, z. B. Schild des Glaubens eines Mitspielers (+2) */
  ac: AcMod | null;
};

export type NewEffect = Omit<ActiveEffect, "id" | "ac"> & { ac?: AcMod | null };

export type CombatState = {
  active: boolean;
  round: number;
  used: { action: boolean; bonus: boolean; reaction: boolean };
  movement: number;
  effects: ActiveEffect[];
  /** Angriff mit leichter Waffe als Teil der Angriffsaktion in diesem Zug (Waffen-ID) */
  lightAttack: string | null;
  /** Zusatzangriff mit der zweiten leichten Waffe in diesem Zug schon gemacht */
  offhandUsed: boolean;
};

// ── Normalisierung ──────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const oneOf = <T extends string>(list: readonly { key: T }[], v: unknown, fallback: T): T =>
  list.some(x => x.key === v) ? (v as T) : fallback;

export function newFeature(partial: Partial<Feature> = {}): Feature {
  return {
    id: uid(),
    name: "",
    categories: [],
    tags: [],
    description: "",
    activation: "action",
    effectType: "utility",
    target: "self",
    targetText: "",
    benefit: "",
    condition: "",
    damage: "",
    damageAdds: [],
    damageType: "",
    damageTypeFromAttack: false,
    damageOtherTarget: false,
    effectText: "",
    save: "",
    duration: { kind: "instant", amount: 1, text: "" },
    uses: { max: null, used: 0, reset: "long" },
    resourceId: null,
    resourceCost: 1,
    triggers: [],
    appliesTo: { scope: "none", attackIds: [] },
    rollMods: [],
    acMod: { mode: "none", value: 0 },
    links: [],
    ...partial,
  };
}

export function newRollMod(partial: Partial<RollMod> = {}): RollMod {
  return { target: "check", ability: null, skill: null, bonus: "", mode: "none", ...partial };
}

export function normalizeRollMod(raw: unknown): RollMod {
  const m = obj(raw);
  return newRollMod({
    target: oneOf(ROLL_TARGETS, m.target, "check"),
    ability: (ABILITIES as readonly string[]).includes(m.ability as string) ? (m.ability as Ability) : null,
    skill: SKILLS.some(s => s.key === m.skill) ? (m.skill as SkillKey) : null,
    bonus: str(m.bonus).slice(0, 40),
    mode: oneOf(ADV_MODES, m.mode, "none"),
  });
}

export function normalizeAcMod(raw: unknown): AcMod {
  const m = obj(raw);
  return { mode: oneOf(AC_MODES, m.mode, "none"), value: num(m.value, 0) };
}

/** Frühere Bögen hatten feste Angriffsboni statt Wurfmodifikatoren. */
function legacyAttackMods(raw: unknown): RollMod[] {
  const m = obj(raw);
  const out: RollMod[] = [];
  const toHit = num(m.toHit, 0);
  const damage = num(m.damageBonus, 0);
  if (toHit || m.advantage === true) {
    out.push(newRollMod({ target: "attack", bonus: toHit ? String(toHit) : "", mode: m.advantage === true ? "advantage" : "none" }));
  }
  if (damage) out.push(newRollMod({ target: "damage", bonus: String(damage) }));
  return out;
}

/** Kategorien; ältere Daten haben genau eine Kategorie als Text. */
function normalizeCategories(f: Record<string, unknown>): string[] {
  const list = Array.isArray(f.categories) ? f.categories : typeof f.category === "string" ? [f.category] : [];
  const clean = list.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean);
  return [...new Set(clean)];
}

/** Hauptkategorie (gruppiert die Liste) */
export function mainCategory(f: Pick<Feature, "categories">) {
  return f.categories[0] ?? "";
}

export function normalizeFeature(raw: unknown): Feature {
  const f = obj(raw);
  const duration = obj(f.duration);
  const uses = obj(f.uses);
  const applies = obj(f.appliesTo);
  return newFeature({
    id: str(f.id) || uid(),
    name: str(f.name),
    categories: normalizeCategories(f),
    tags: Array.isArray(f.tags) ? f.tags.filter((t): t is string => typeof t === "string") : [],
    description: str(f.description),
    activation: oneOf(ACTIVATIONS, f.activation, "action"),
    effectType: oneOf(EFFECT_TYPES, f.effectType, "utility"),
    target: oneOf(TARGETS, f.target, "self"),
    targetText: str(f.targetText),
    benefit: str(f.benefit),
    condition: str(f.condition),
    damage: str(f.damage),
    damageAdds: (Array.isArray(f.damageAdds) ? f.damageAdds : []).map(raw => {
      const a = obj(raw);
      // Ältere Daten haben genau ein Attribut
      const list = Array.isArray(a.abilities) ? a.abilities : [a.ability];
      const abilities = ABILITIES.filter(ab => list.includes(ab));
      return newDamageAdd({
        kind: oneOf(DAMAGE_ADDS, a.kind, "ability"),
        abilities: abilities.length ? abilities : ["con"],
        className: str(a.className).slice(0, 60),
      });
    }),
    damageType: str(f.damageType),
    damageTypeFromAttack: f.damageTypeFromAttack === true,
    damageOtherTarget: f.damageOtherTarget === true,
    effectText: str(f.effectText).slice(0, 200),
    save: str(f.save),
    duration: {
      kind: oneOf(DURATIONS, duration.kind, "instant"),
      amount: Math.max(1, num(duration.amount, 1)),
      text: str(duration.text),
    },
    uses: {
      max: typeof uses.max === "number" ? Math.max(0, uses.max) : null,
      used: Math.max(0, num(uses.used, 0)),
      reset: oneOf(USE_RESETS, uses.reset, "long"),
    },
    resourceId: typeof f.resourceId === "string" ? f.resourceId : null,
    resourceCost: Math.max(0, num(f.resourceCost, 1)),
    triggers: Array.isArray(f.triggers) ? f.triggers.filter((t): t is Trigger => TRIGGERS.some(x => x.key === t)) : [],
    appliesTo: {
      scope: oneOf(SCOPES, applies.scope, "none"),
      attackIds: Array.isArray(applies.attackIds) ? applies.attackIds.filter((t): t is string => typeof t === "string") : [],
    },
    rollMods: Array.isArray(f.rollMods) ? f.rollMods.map(normalizeRollMod) : legacyAttackMods(f.attackMods),
    acMod: normalizeAcMod(f.acMod),
    links: (Array.isArray(f.links) ? f.links : [])
      .map(l => {
        const o = obj(l);
        return { featureId: str(o.featureId), cost: Math.max(0, num(o.cost, 1)), when: oneOf(LINK_WHEN, o.when, "use") };
      })
      .filter(l => l.featureId),
  });
}

export function normalizeCombat(raw: unknown): CombatState {
  const c = obj(raw);
  const used = obj(c.used);
  return {
    active: c.active === true,
    round: Math.max(1, num(c.round, 1)),
    used: { action: used.action === true, bonus: used.bonus === true, reaction: used.reaction === true },
    movement: Math.max(0, num(c.movement, 0)),
    effects: (Array.isArray(c.effects) ? c.effects : []).map(e => {
      const o = obj(e);
      return {
        id: str(o.id) || uid(),
        name: str(o.name),
        featureId: typeof o.featureId === "string" ? o.featureId : null,
        remaining: typeof o.remaining === "number" ? o.remaining : null,
        concentration: o.concentration === true,
        note: str(o.note),
        ac: o.ac ? normalizeAcMod(o.ac) : null,
      };
    }),
    lightAttack: typeof c.lightAttack === "string" ? c.lightAttack : null,
    offhandUsed: c.offhandUsed === true,
  };
}

// ── Nutzungen ───────────────────────────────────────────────────────────

function resourceOf(c: CharacterData, f: Feature): Resource | undefined {
  return f.resourceId ? c.resources.find(r => r.id === f.resourceId) : undefined;
}

const minLeft = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

/** Verknüpfte Fähigkeiten (die es im Bogen noch gibt). */
export function linkedFeatures(c: CharacterData, f: Feature) {
  return f.links
    .map(link => ({ link, feature: c.features.find(x => x.id === link.featureId && x.id !== f.id) }))
    .filter((x): x is { link: FeatureLink; feature: Feature } => Boolean(x.feature));
}

/** Fähigkeiten, die diese Fähigkeit mitverwenden. */
export function dependentFeatures(c: CharacterData, f: Feature) {
  return c.features.filter(x => x.id !== f.id && x.links.some(l => l.featureId === f.id));
}

/** Verbleibende Einsätze; null = unbegrenzt. Verknüpfte Fähigkeiten begrenzen mit. */
export function usesLeft(c: CharacterData, f: Feature, depth = 0): number | null {
  const own = f.uses.max == null ? null : Math.max(0, f.uses.max - f.uses.used);
  const res = resourceOf(c, f);
  const fromResource = res && f.resourceCost > 0 ? Math.floor((res.max - res.used) / f.resourceCost) : null;
  let left = minLeft(own, fromResource);
  if (depth < 3) {
    for (const { link, feature } of linkedFeatures(c, f)) {
      const other = usesLeft(c, feature, depth + 1);
      if (other != null && link.cost > 0) left = minLeft(left, Math.floor(other / link.cost));
    }
  }
  return left;
}

/** Nutzungen bzw. Ressource einer Fähigkeit verbrauchen, ohne sie einzusetzen. */
export function consumeUses(c: CharacterData, f: Feature, count = 1) {
  if (count <= 0) return;
  if (f.uses.max != null) f.uses.used = Math.min(f.uses.max, f.uses.used + count);
  const res = resourceOf(c, f);
  if (res && f.resourceCost > 0) res.used = Math.min(res.max, res.used + f.resourceCost * count);
}

/** Verbrauch rückgängig machen (z. B. Option im Würfeldialog wieder abgewählt). */
export function refundUses(c: CharacterData, f: Feature, count = 1) {
  if (count <= 0) return;
  if (f.uses.max != null) f.uses.used = Math.max(0, f.uses.used - count);
  const res = resourceOf(c, f);
  if (res && f.resourceCost > 0) res.used = Math.max(0, res.used - f.resourceCost * count);
}

/** Einsatz rückgängig machen: eigene und mitverbrauchte Nutzungen zurück. */
export function refundFeature(c: CharacterData, f: Feature) {
  refundUses(c, f, 1);
  for (const { link, feature } of linkedFeatures(c, f)) {
    if (link.when === "use") refundUses(c, feature, link.cost);
  }
}

/** Verknüpfung „wenn es gelingt“ bestätigen: Nutzungen der anderen Fähigkeit verbrauchen. */
export function confirmLinkSuccess(c: CharacterData, f: Feature, featureId: string) {
  const link = f.links.find(l => l.featureId === featureId);
  const other = c.features.find(x => x.id === featureId);
  if (link && other) consumeUses(c, other, link.cost);
}

export function isAvailable(c: CharacterData, f: Feature) {
  const left = usesLeft(c, f);
  return left == null || left > 0;
}

const ECONOMY: Partial<Record<Activation, keyof CombatState["used"]>> = {
  action: "action",
  bonus: "bonus",
  reaction: "reaction",
};

/** Ist die passende Aktionsart im laufenden Kampf schon verbraucht? */
export function economySpent(c: CharacterData, activation: Activation) {
  const slot = ECONOMY[activation];
  return Boolean(c.combat.active && slot && c.combat.used[slot]);
}

export function durationRounds(f: Feature): number | null {
  switch (f.duration.kind) {
    case "rounds":
      return f.duration.amount;
    case "minutes":
    case "concentration":
      return f.duration.amount * 10;
    case "hours":
      return f.duration.amount * 600;
    default:
      return null;
  }
}

/**
 * Fähigkeit einsetzen: Nutzung/Ressource verbrauchen, im Kampf die
 * Aktionsart markieren und bei andauernder Wirkung einen Effekt anlegen.
 * Gibt Hinweise zurück (z. B. beendete Konzentration).
 */
export function useFeature(c: CharacterData, f: Feature, opts: { markEconomy?: boolean } = {}): string[] {
  const notes: string[] = [];
  consumeUses(c, f, 1);
  for (const { link, feature } of linkedFeatures(c, f)) {
    if (link.when === "use") consumeUses(c, feature, link.cost);
  }

  if (c.combat.active && opts.markEconomy !== false) {
    const slot = ECONOMY[f.activation];
    if (slot) c.combat.used[slot] = true;
  }

  if (f.duration.kind !== "instant" && f.activation !== "passive") {
    notes.push(...addEffect(c, {
      name: f.name,
      featureId: f.id,
      remaining: durationRounds(f),
      concentration: f.duration.kind === "concentration",
      note: f.benefit || f.duration.text,
      ac: f.acMod.mode !== "none" ? { ...f.acMod } : null,
    }));
  }
  return notes;
}

export function addEffect(c: CharacterData, effect: NewEffect): string[] {
  const notes: string[] = [];
  if (effect.concentration) {
    const previous = c.combat.effects.filter(e => e.concentration);
    if (previous.length) notes.push(`Konzentration auf „${previous.map(e => e.name).join(", ")}“ beendet.`);
    c.combat.effects = c.combat.effects.filter(e => !e.concentration);
  }
  // Gleicher Effekt erneut → Dauer auffrischen statt doppelt
  c.combat.effects = c.combat.effects.filter(e => !(effect.featureId && e.featureId === effect.featureId));
  c.combat.effects.push({ id: uid(), ...effect, ac: effect.ac ?? null });
  return notes;
}

// ── Kampfablauf ─────────────────────────────────────────────────────────

function resetTurn(c: CharacterData) {
  c.combat.used = { action: false, bonus: false, reaction: false };
  c.combat.movement = 0;
  c.combat.lightAttack = null;
  c.combat.offhandUsed = false;
}

export function startCombat(c: CharacterData) {
  c.combat.active = true;
  c.combat.round = 1;
  resetTurn(c);
  for (const f of c.features) if (f.uses.reset === "turn") f.uses.used = 0;
}

export function endCombat(c: CharacterData) {
  c.combat.active = false;
  c.combat.round = 1;
  resetTurn(c);
  // Effekte mit Rundendauer enden mit dem Kampf, längere bleiben
  c.combat.effects = c.combat.effects.filter(e => e.remaining == null || e.remaining > 10);
}

/**
 * Nächster eigener Zug: Aktionen zurücksetzen, "pro Zug"-Nutzungen auffüllen,
 * Effektdauern um eine Runde verringern. Gibt abgelaufene Effekte zurück.
 */
export function nextTurn(c: CharacterData): string[] {
  c.combat.round++;
  resetTurn(c);
  for (const f of c.features) if (f.uses.reset === "turn") f.uses.used = 0;
  const expired: string[] = [];
  c.combat.effects = c.combat.effects.filter(e => {
    if (e.remaining == null) return true;
    e.remaining--;
    if (e.remaining <= 0) {
      expired.push(e.name);
      return false;
    }
    return true;
  });
  return expired;
}

/** Rasten: Nutzungen und Effekte zurücksetzen. */
export function restFeatures(c: CharacterData, kind: "short" | "long") {
  for (const f of c.features) {
    const r = f.uses.reset;
    if (r === "turn" || r === "short" || (kind === "long" && (r === "long" || r === "dawn"))) f.uses.used = 0;
  }
  // Eine Rast dauert mindestens eine Stunde: kurzlebige Effekte sind vorbei
  if (kind === "long") {
    c.combat.effects = [];
  } else {
    c.combat.effects = c.combat.effects.filter(e => {
      const f = c.features.find(x => x.id === e.featureId);
      if (f?.duration.kind === "untilShort") return false;
      return e.remaining == null || e.remaining > 600;
    });
  }
  c.combat.active = false;
}

// ── Angriffe ────────────────────────────────────────────────────────────

export function isRangedAttack(a: Attack) {
  return a.kind === "ranged";
}

/** Gilt die Fähigkeit für diesen Angriff? */
export function appliesToAttack(f: Feature, a: Attack): boolean {
  const scope = f.appliesTo.scope;
  const isSpell = a.ability === "spell";
  switch (scope) {
    case "none":
      return false;
    case "all":
      return true;
    case "melee":
      return !isRangedAttack(a);
    case "ranged":
      return isRangedAttack(a);
    case "weapon":
      return !isSpell;
    case "spell":
      return isSpell;
    case "specific":
      return f.appliesTo.attackIds.includes(a.id);
  }
}

export type AttackOption = {
  feature: Feature;
  /** Wirkt ohnehin (passiv oder als aktiver Effekt) */
  automatic: boolean;
  available: boolean;
  spent: boolean;
};

/**
 * Vorschläge für einen Angriff mit Waffe X:
 *  - before: vor dem Wurf (Vorteil, Trefferbonus, Schadensbonus, passive Boni)
 *  - onHit:  nach einem Treffer (Zusatzschaden wie Hinterhältiger Angriff)
 */
export function attackOptions(c: CharacterData, a: Attack) {
  const active = new Set(c.combat.effects.map(e => e.featureId));
  const before: AttackOption[] = [];
  const onHit: AttackOption[] = [];
  for (const f of c.features) {
    if (!appliesToAttack(f, a)) continue;
    const automatic = f.activation === "passive" || active.has(f.id);
    const option = { feature: f, automatic, available: automatic || isAvailable(c, f), spent: !automatic && economySpent(c, f.activation) };
    const hitTrigger = f.triggers.includes("hit") || f.triggers.includes("crit");
    if (hitTrigger && !automatic) onHit.push(option);
    else before.push(option);
  }
  const order = (x: AttackOption, y: AttackOption) =>
    Number(y.automatic) - Number(x.automatic) || Number(y.available) - Number(x.available) || x.feature.name.localeCompare(y.feature.name);
  return { before: before.sort(order), onHit: onHit.sort(order) };
}

// ── Schaden und Heilung ─────────────────────────────────────────────────

/** Stufe einer Klasse (Name ohne Gross-/Kleinschreibung); 0, wenn der Charakter sie nicht hat */
function classLevel(c: CharacterData, name: string) {
  const n = name.trim().toLocaleLowerCase("de");
  return c.classes.filter(k => k.name.trim().toLocaleLowerCase("de") === n).reduce((sum, k) => sum + (k.level || 0), 0);
}

/** Muss im Kampf ein Attribut gewählt werden? */
export function isAbilityChoice(add: DamageAdd) {
  return add.kind === "ability" && add.abilities.length > 1;
}

/** Zuschläge, bei denen im Kampf ein Attribut gewählt wird (mit Index in `damageAdds`) */
export function abilityChoices(f: Pick<Feature, "damageAdds">) {
  return f.damageAdds.flatMap((add, index) => (isAbilityChoice(add) ? [{ add, index }] : []));
}

/** Gewähltes Attribut des Zuschlags; ohne gültige Wahl das mit dem höchsten Modifikator */
export function pickedAbility(c: CharacterData, add: DamageAdd, pick?: Ability): Ability {
  if (pick && add.abilities.includes(pick)) return pick;
  return add.abilities.reduce((best, ab) => (abilityMod(c.abilities[ab]) > abilityMod(c.abilities[best]) ? ab : best), add.abilities[0] ?? "con");
}

export function damageAddValue(c: CharacterData, add: DamageAdd, pick?: Ability): number {
  const level = Math.max(1, c.classes.reduce((sum, k) => sum + (k.level || 0), 0));
  switch (add.kind) {
    case "ability":
      return abilityMod(c.abilities[pickedAbility(c, add, pick)]);
    case "level":
      return level;
    case "classLevel":
      return classLevel(c, add.className);
    case "proficiency":
      return c.profBonusOverride ?? proficiencyBonus(level);
  }
}

export function damageAddLabel(add: DamageAdd, pick?: Ability): string {
  switch (add.kind) {
    case "ability":
      return `${pick && add.abilities.includes(pick) ? ABILITY_SHORT[pick] : add.abilities.map(ab => ABILITY_SHORT[ab]).join("/")}-Mod.`;
    case "level":
      return "Stufe";
    case "classLevel": {
      const name = add.className.trim();
      return name ? `${name[0]!.toLocaleUpperCase("de")}${name.slice(1)}stufe` : "Klassenstufe";
    }
    case "proficiency":
      return "Übung";
  }
}

/** Würfel der Fähigkeit inklusive Zuschläge; null ohne Würfel und ohne Zuschläge */
export function featureDamageExpr(c: CharacterData, f: Pick<Feature, "damage" | "damageAdds">, picks: AbilityPicks = {}): DiceExpr | null {
  const base = f.damage.trim() ? parseDice(f.damage) : { groups: [], bonus: 0 };
  if (!base || (!base.groups.length && !base.bonus && !f.damageAdds.length)) return null;
  const bonus = f.damageAdds.reduce((sum, a, i) => sum + damageAddValue(c, a, picks[i]), 0);
  return addExpr(base, { groups: [], bonus });
}

/**
 * Schadensart der Fähigkeit; mit „wie der Angriff“ die Art des auslösenden
 * Angriffs, ohne Angriff ein Platzhalter für Listen.
 */
export function featureDamageType(f: Pick<Feature, "damageType" | "damageTypeFromAttack">, attack?: Pick<Attack, "damageType">): string {
  if (!f.damageTypeFromAttack) return f.damageType.trim();
  return attack ? attack.damageType.trim() : "wie Angriff";
}

/**
 * Was der Wurf der Fähigkeit bewirkt: Schaden, Heilung oder eine sonstige
 * Wirkung als Text; null ohne Wurf.
 */
export function featureRollKind(f: Pick<Feature, "effectType" | "effectText">): "damage" | "healing" | "other" | null {
  if (f.effectText.trim()) return "other";
  if (f.effectType === "damage" || f.effectType === "healing") return f.effectType;
  return null;
}

/** Text hinter den Würfeln: Schadensart oder sonstige Wirkung */
export function featureRollLabel(f: Feature, attack?: Pick<Attack, "damageType">): string {
  return featureRollKind(f) === "other" ? f.effectText.trim() : featureDamageType(f, attack);
}

/**
 * Kurztext der Zuschläge mit aktuellem Wert, z. B. "Kämpferstufe +3, KON-Mod. +2".
 * Ohne Wahl bei mehreren Attributen der höchste Modifikator.
 */
export function describeDamageAdds(c: CharacterData, adds: DamageAdd[], picks: AbilityPicks = {}) {
  return adds
    .map((a, i) => {
      const pick = isAbilityChoice(a) ? pickedAbility(c, a, picks[i]) : undefined;
      return `${damageAddLabel(a, pick)} ${formatSigned(damageAddValue(c, a, pick))}`;
    })
    .join(", ");
}

function formatSigned(n: number) {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

// ── Wurfmodifikatoren ───────────────────────────────────────────────────

/**
 * „Vorteil auf den Schadenswurf“: Waffenschadenswürfel zweimal würfeln und
 * ein Ergebnis wählen (Wilder Angreifer).
 */
export function isDamageTwice(m: RollMod) {
  return m.target === "damage" && m.mode === "advantage";
}

/**
 * Art der Fähigkeit aus ihren Bausteinen ableiten (für Filter und das
 * Würfeln von Schaden/Heilung), solange sie nicht ausdrücklich gesetzt ist.
 */
export function deriveEffectType(
  f: Pick<Feature, "damage" | "acMod" | "rollMods"> & { damageAdds?: DamageAdd[]; effectText?: string },
  healing = false
): EffectType {
  // Sonstige Wirkung: kein Schaden und keine Heilung
  if ((f.damage.trim() || f.damageAdds?.length) && !f.effectText?.trim()) return healing ? "healing" : "damage";
  if (f.acMod.mode !== "none") return "defense";
  if (f.rollMods.some(m => m.bonus.trim() || m.mode !== "none")) return "buff";
  return "utility";
}


export type RollContext = { kind: RollKind; ability?: Ability | null; skill?: SkillKey | null };

/**
 * Passt ein Modifikator zum Wurf? Fertigkeitswürfe und Initiative sind
 * Attributswürfe, Todesrettungswürfe sind Rettungswürfe.
 */
export function rollModMatches(m: RollMod, ctx: RollContext): boolean {
  const abilityOk = !m.ability || m.ability === ctx.ability;
  switch (m.target) {
    case "attack":
      return ctx.kind === "attack";
    case "damage":
      return false;
    case "check":
      return (ctx.kind === "check" || ctx.kind === "skill" || ctx.kind === "initiative") && abilityOk;
    case "skill":
      return ctx.kind === "skill" && (!m.skill || m.skill === ctx.skill);
    case "save":
      return (ctx.kind === "save" && abilityOk) || (ctx.kind === "deathSave" && !m.ability);
    case "initiative":
      return ctx.kind === "initiative";
    case "deathSave":
      return ctx.kind === "deathSave";
  }
}

/** Wirkt die Fähigkeit gerade (passiv oder als aktiver Effekt)? */
export function isActiveFeature(c: CharacterData, f: Feature) {
  return f.activation === "passive" || c.combat.effects.some(e => e.featureId === f.id);
}

const SPONTANEOUS: Activation[] = ["free", "before", "reaction"];

export type RollFeature = { feature: Feature; mods: RollMod[]; automatic: boolean; available: boolean };

/**
 * Fähigkeiten, die einen W20-Wurf ausserhalb des Angriffs-Assistenten
 * verändern (Attribut, Fertigkeit, Rettung, Initiative, Zauberangriff).
 */
export function rollFeatures(c: CharacterData, ctx: RollContext): RollFeature[] {
  const out: RollFeature[] = [];
  for (const f of c.features) {
    // Zauberangriff: nur Fähigkeiten für alle Angriffe oder Zauberangriffe
    if (ctx.kind === "attack" && f.appliesTo.scope !== "all" && f.appliesTo.scope !== "spell") continue;
    const mods = f.rollMods.filter(m => rollModMatches(m, ctx));
    if (!mods.length) continue;
    const automatic = isActiveFeature(c, f);
    // Wählbar im Wurf sind nur Fähigkeiten ohne Dauer, die man spontan einsetzt.
    // Andere (z. B. Segen) wirken, sobald sie als Effekt aktiv sind.
    if (!automatic && (f.duration.kind !== "instant" || !SPONTANEOUS.includes(f.activation))) continue;
    out.push({ feature: f, mods, automatic, available: automatic || isAvailable(c, f) });
  }
  return out.sort(
    (x, y) => Number(y.automatic) - Number(x.automatic) || Number(y.available) - Number(x.available) || x.feature.name.localeCompare(y.feature.name)
  );
}

export type ModSum = {
  flat: number;
  dice: { label: string; sign: 1 | -1; groups: DiceGroup[] }[];
  advantage: boolean;
  disadvantage: boolean;
};

/** Modifikatoren zusammenzählen: fester Bonus, Bonuswürfel, Vorteil/Nachteil. */
export function sumMods(entries: { label: string; mods: RollMod[] }[]): ModSum {
  const sum: ModSum = { flat: 0, dice: [], advantage: false, disadvantage: false };
  for (const { label, mods } of entries) {
    for (const m of mods) {
      const b = parseBonus(m.bonus);
      if (b) {
        sum.flat += b.flat;
        if (b.dice.length) sum.dice.push({ label, sign: b.sign, groups: b.dice });
      }
      if (m.mode === "advantage") sum.advantage = true;
      if (m.mode === "disadvantage") sum.disadvantage = true;
    }
  }
  return sum;
}

/** Vorteil und Nachteil heben sich auf, egal wie viele Quellen. */
export function combineAdvantage(base: "normal" | "advantage" | "disadvantage", advantage: boolean, disadvantage: boolean) {
  const adv = advantage || base === "advantage";
  const dis = disadvantage || base === "disadvantage";
  return adv && dis ? "normal" : adv ? "advantage" : dis ? "disadvantage" : "normal";
}

/** Kurzbeschreibung der Modifikatoren für Listen. */
export function describeRollMods(mods: RollMod[]) {
  return mods
    .map(m => {
      const target = ROLL_TARGETS.find(t => t.key === m.target)?.label ?? m.target;
      const filter = m.skill ? SKILLS.find(s => s.key === m.skill)?.name : m.ability ? ABILITY_SHORT[m.ability] : "";
      if (isDamageTwice(m)) return "Schadenswürfel zweimal würfeln, Ergebnis wählen";
      const b = parseBonus(m.bonus);
      const parts = [b ? formatBonus(b) : "", m.mode === "advantage" ? "Vorteil" : m.mode === "disadvantage" ? "Nachteil" : ""].filter(Boolean);
      return parts.length ? `${target}${filter ? ` (${filter})` : ""} ${parts.join(", ")}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

// ── Vorschläge ──────────────────────────────────────────────────────────

/** Zauber-Zeitaufwand ("1 action", "Bonus Action", "1 reaction, which …") → Aktivierung */
export function activationFromCastingTime(text: string): Activation | null {
  const t = text.toLowerCase();
  if (t.includes("bonus")) return "bonus";
  if (t.includes("reaction")) return "reaction";
  if (t.includes("action")) return "action";
  return null;
}

export type FeatureFilter = { search: string; categories: string[]; tags: string[]; effectTypes: string[] };

export function matchesFilter(f: Feature, filter: FeatureFilter) {
  const q = filter.search.trim().toLowerCase();
  if (q && ![f.name, f.benefit, f.description, f.condition, ...f.categories, ...f.tags].some(x => x.toLowerCase().includes(q))) return false;
  if (filter.categories.length && !filter.categories.some(cat => f.categories.includes(cat))) return false;
  if (filter.tags.length && !filter.tags.some(t => f.tags.includes(t))) return false;
  if (filter.effectTypes.length && !filter.effectTypes.includes(f.effectType)) return false;
  return true;
}

export const label = {
  activation: (k: Activation) => ACTIVATIONS.find(x => x.key === k)?.label ?? k,
  effect: (k: EffectType) => EFFECT_TYPES.find(x => x.key === k)?.label ?? k,
  target: (k: Target) => TARGETS.find(x => x.key === k)?.label ?? k,
  trigger: (k: Trigger) => TRIGGERS.find(x => x.key === k)?.label ?? k,
  reset: (k: UseReset) => USE_RESETS.find(x => x.key === k)?.label ?? k,
  duration(f: Feature) {
    const d = f.duration;
    switch (d.kind) {
      case "instant":
        return "Sofort";
      case "rounds":
        return `${d.amount} ${d.amount === 1 ? "Runde" : "Runden"}`;
      case "minutes":
        return `${d.amount} ${d.amount === 1 ? "Minute" : "Minuten"}`;
      case "hours":
        return `${d.amount} ${d.amount === 1 ? "Stunde" : "Stunden"}`;
      case "concentration":
        return `Konzentration, ${d.amount} ${d.amount === 1 ? "Minute" : "Minuten"}`;
      case "untilShort":
        return "Bis zur kurzen Rast";
      case "untilLong":
        return "Bis zur langen Rast";
      case "special":
        return d.text || "Speziell";
    }
  },
};
