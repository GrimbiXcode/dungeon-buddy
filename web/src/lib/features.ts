/**
 * Konfigurierbare Fähigkeiten (Klassenmerkmale, Herkunft, Talente,
 * Ausrüstung, …) und der Zustand des Kampf-Assistenten.
 *
 * Alles liegt in den Charakterdaten (jsonb) und wird über
 * `normalizeFeature` / `normalizeCombat` in Form gebracht.
 */
import type { Attack, CharacterData, Resource } from "./character";
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

/** Vorgeschlagene Kategorien; eigene sind jederzeit möglich. */
export function baseCategories(speciesLabel: string) {
  return ["Klasse", "Unterklasse", speciesLabel, "Hintergrund", "Talent", "Ausrüstung", "Magischer Gegenstand", "Sonstiges"];
}

export const WEAPON_PROPERTIES = [
  "Finesse",
  "Leicht",
  "Schwer",
  "Zweihändig",
  "Vielseitig",
  "Weitreichend",
  "Wurfwaffe",
  "Munition",
  "Laden",
  "Magisch",
  "Versilbert",
] as const;

// ── Typen ───────────────────────────────────────────────────────────────

export type Feature = {
  id: string;
  name: string;
  /** Herkunft im Bogen: Klasse, Spezies, Talent, Ausrüstung … oder eigene */
  category: string;
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
  damageType: string;
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
  attackMods: { toHit: number; damageBonus: number; advantage: boolean };
};

export type ActiveEffect = {
  id: string;
  name: string;
  featureId: string | null;
  /** Verbleibende Runden; null = unbestimmt (bis Rast, speziell) */
  remaining: number | null;
  concentration: boolean;
  note: string;
};

export type CombatState = {
  active: boolean;
  round: number;
  used: { action: boolean; bonus: boolean; reaction: boolean };
  movement: number;
  effects: ActiveEffect[];
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
    category: "Klasse",
    tags: [],
    description: "",
    activation: "action",
    effectType: "utility",
    target: "self",
    targetText: "",
    benefit: "",
    condition: "",
    damage: "",
    damageType: "",
    save: "",
    duration: { kind: "instant", amount: 1, text: "" },
    uses: { max: null, used: 0, reset: "long" },
    resourceId: null,
    resourceCost: 1,
    triggers: [],
    appliesTo: { scope: "none", attackIds: [] },
    attackMods: { toHit: 0, damageBonus: 0, advantage: false },
    ...partial,
  };
}

export function normalizeFeature(raw: unknown): Feature {
  const f = obj(raw);
  const duration = obj(f.duration);
  const uses = obj(f.uses);
  const applies = obj(f.appliesTo);
  const mods = obj(f.attackMods);
  return newFeature({
    id: str(f.id) || uid(),
    name: str(f.name),
    category: str(f.category, "Sonstiges"),
    tags: Array.isArray(f.tags) ? f.tags.filter((t): t is string => typeof t === "string") : [],
    description: str(f.description),
    activation: oneOf(ACTIVATIONS, f.activation, "action"),
    effectType: oneOf(EFFECT_TYPES, f.effectType, "utility"),
    target: oneOf(TARGETS, f.target, "self"),
    targetText: str(f.targetText),
    benefit: str(f.benefit),
    condition: str(f.condition),
    damage: str(f.damage),
    damageType: str(f.damageType),
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
    attackMods: {
      toHit: num(mods.toHit, 0),
      damageBonus: num(mods.damageBonus, 0),
      advantage: mods.advantage === true,
    },
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
      };
    }),
  };
}

// ── Nutzungen ───────────────────────────────────────────────────────────

function resourceOf(c: CharacterData, f: Feature): Resource | undefined {
  return f.resourceId ? c.resources.find(r => r.id === f.resourceId) : undefined;
}

/** Verbleibende Einsätze; null = unbegrenzt. */
export function usesLeft(c: CharacterData, f: Feature): number | null {
  const own = f.uses.max == null ? null : Math.max(0, f.uses.max - f.uses.used);
  const res = resourceOf(c, f);
  const fromResource = res && f.resourceCost > 0 ? Math.floor((res.max - res.used) / f.resourceCost) : null;
  if (own == null) return fromResource;
  if (fromResource == null) return own;
  return Math.min(own, fromResource);
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
  if (f.uses.max != null) f.uses.used = Math.min(f.uses.max, f.uses.used + 1);
  const res = resourceOf(c, f);
  if (res && f.resourceCost > 0) res.used = Math.min(res.max, res.used + f.resourceCost);

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
    }));
  }
  return notes;
}

export function addEffect(c: CharacterData, effect: Omit<ActiveEffect, "id">): string[] {
  const notes: string[] = [];
  if (effect.concentration) {
    const previous = c.combat.effects.filter(e => e.concentration);
    if (previous.length) notes.push(`Konzentration auf „${previous.map(e => e.name).join(", ")}“ beendet.`);
    c.combat.effects = c.combat.effects.filter(e => !e.concentration);
  }
  // Gleicher Effekt erneut → Dauer auffrischen statt doppelt
  c.combat.effects = c.combat.effects.filter(e => !(effect.featureId && e.featureId === effect.featureId));
  c.combat.effects.push({ id: uid(), ...effect });
  return notes;
}

// ── Kampfablauf ─────────────────────────────────────────────────────────

export function startCombat(c: CharacterData) {
  c.combat.active = true;
  c.combat.round = 1;
  c.combat.used = { action: false, bonus: false, reaction: false };
  c.combat.movement = 0;
  for (const f of c.features) if (f.uses.reset === "turn") f.uses.used = 0;
}

export function endCombat(c: CharacterData) {
  c.combat.active = false;
  c.combat.round = 1;
  c.combat.used = { action: false, bonus: false, reaction: false };
  c.combat.movement = 0;
  // Effekte mit Rundendauer enden mit dem Kampf, längere bleiben
  c.combat.effects = c.combat.effects.filter(e => e.remaining == null || e.remaining > 10);
}

/**
 * Nächster eigener Zug: Aktionen zurücksetzen, "pro Zug"-Nutzungen auffüllen,
 * Effektdauern um eine Runde verringern. Gibt abgelaufene Effekte zurück.
 */
export function nextTurn(c: CharacterData): string[] {
  c.combat.round++;
  c.combat.used = { action: false, bonus: false, reaction: false };
  c.combat.movement = 0;
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
  if (q && ![f.name, f.benefit, f.description, f.condition, f.category, ...f.tags].some(x => x.toLowerCase().includes(q))) return false;
  if (filter.categories.length && !filter.categories.includes(f.category)) return false;
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
