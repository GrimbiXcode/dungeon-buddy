import { conditionEffect, exhaustionEffect, type Ability, type RollKind } from "./dnd";
import { session } from "./session.svelte";
import type { Ruleset } from "./types";
import type { RollModeSetting } from "./character";
import type { DiceGroup } from "./dice";

export type AdvMode = "normal" | "advantage" | "disadvantage";
export type AdvSource = { label: string; mode: "advantage" | "disadvantage" };

export type DamageRequest = {
  type: "damage";
  title: string;
  subtitle?: string;
  /** Würfelausdruck inkl. Bonus, z. B. "2d6+3" */
  dice: string;
  damageType?: string;
  heal?: boolean;
  /** Sonstige Wirkung statt Schaden/Heilung, z. B. "vom erlittenen Schaden abziehen" */
  effect?: string;
  crit?: boolean;
  /** Kritische Treffer ermöglichen (bei Heilung sinnlos) */
  canCrit?: boolean;
  /**
   * Diese Würfel (Teil von `dice`, z. B. die Waffenwürfel "1d8") zweimal
   * würfeln und ein Ergebnis wählen (Wilder Angreifer).
   */
  twice?: { label: string; dice: string };
  /** Nur bei kritischem Treffer dazu, ohne Verdopplung (Brutaler kritischer Treffer) */
  critExtra?: string;
  physical: boolean;
};

/**
 * Fähigkeit, die einen W20-Wurf verändert: fester Bonus, Bonuswürfel
 * (Segen 1W4, Taktisches Verständnis 1W10) und/oder Vorteil/Nachteil.
 */
export type RollOption = {
  id: string;
  label: string;
  detail?: string;
  flat: number;
  dice: DiceGroup[];
  sign: 1 | -1;
  mode: "advantage" | "disadvantage" | null;
  /** Wirkt ohnehin (passiv oder aktiver Effekt) und lässt sich nicht abwählen */
  auto: boolean;
  /** Keine Nutzungen mehr übrig */
  disabled?: boolean;
  /** Aktuell einsetzbar? (live, z. B. wenn eine andere Option dieselbe Ressource verbraucht hat) */
  available?: () => boolean;
  /** Beim An-/Abwählen, z. B. Nutzung verbrauchen bzw. zurückgeben */
  onToggle?: (on: boolean) => void;
  /** Nach dem Wurf: Verbrauch erst bestätigen, wenn der Wurf gelingt */
  onSuccess?: { label: string; run: () => void };
};

export type D20Request = {
  type: "d20";
  title: string;
  subtitle?: string;
  modifier: number;
  kind: RollKind;
  physical: boolean;
  /** Voreinstellung für Vorteil/Nachteil (ältere Aufrufer; besser `sources`) */
  mode?: AdvMode;
  /** Quellen für Vorteil/Nachteil (Erschöpfung, Zustände, Fähigkeiten); heben sich nach Regel auf */
  sources?: AdvSource[];
  /** Pauschaler Abzug, z. B. Erschöpfung (2024) */
  penalty?: number;
  notes?: string[];
  /** Ziel, gegen das gewürfelt wird (z. B. SG 10 bei Todesrettungswürfen) */
  target?: number;
  /** Kritischer Treffer ab diesem W20-Wert (Angriffe; Standard 20) */
  critRange?: number;
  /** Anschliessender Schadenswurf (Angriffe) */
  followUp?: Omit<DamageRequest, "physical" | "type">;
  /** Rückmeldung des Ergebnisses (behaltener W20 und Gesamtwert) */
  onResult?: (kept: number, total: number) => void;
  /** Fähigkeiten, die den Wurf verändern (automatisch oder wählbar) */
  options?: RollOption[];
};

export type RollRequest = D20Request | DamageRequest;

export type RollLogEntry = {
  id: number;
  at: Date;
  title: string;
  detail: string;
  total: number;
  flag?: "crit" | "fumble";
};

export const roller = $state({
  request: null as RollRequest | null,
  log: [] as RollLogEntry[],
});

let nextId = 1;

export function openRoll(request: RollRequest) {
  roller.request = request;
}

export function closeRoll() {
  roller.request = null;
}

export function logRoll(entry: Omit<RollLogEntry, "id" | "at">) {
  const id = nextId++;
  roller.log.unshift({ ...entry, id, at: new Date() });
  if (roller.log.length > 30) roller.log.length = 30;
  return id;
}

/** Eintrag nachträglich anpassen (z. B. Bonuswürfel nach dem Wurf). */
export function updateLog(id: number, patch: Partial<Omit<RollLogEntry, "id" | "at">>) {
  const entry = roller.log.find(e => e.id === id);
  if (entry) Object.assign(entry, patch);
}

/** Physisch würfeln? Charakter-Einstellung schlägt Profil-Einstellung. */
export function isPhysical(setting: RollModeSetting | undefined): boolean {
  if (setting === "physical") return true;
  if (setting === "digital") return false;
  return session.user?.settings.diceMode === "physical";
}

/** Baut eine W20-Anfrage inkl. Erschöpfungsregeln der Kampagnen-Regelversion. */
export function d20Request(opts: {
  title: string;
  subtitle?: string;
  modifier: number;
  kind: RollKind;
  ruleset: Ruleset;
  exhaustion: number;
  rollMode: RollModeSetting;
  target?: number;
  critRange?: number;
  followUp?: D20Request["followUp"];
  onResult?: D20Request["onResult"];
  options?: RollOption[];
  notes?: string[];
  sources?: AdvSource[];
  /** Zustände des Charakters (Vergiftet, Liegend …) */
  conditions?: string[];
  ability?: Ability | null;
}): D20Request {
  const ex = exhaustionEffect(opts.ruleset, opts.exhaustion, opts.kind);
  const cond = conditionEffect(opts.conditions ?? [], opts.kind, opts.ability ?? null, opts.ruleset);
  return {
    type: "d20",
    title: opts.title,
    subtitle: opts.subtitle,
    modifier: opts.modifier,
    kind: opts.kind,
    physical: isPhysical(opts.rollMode),
    mode: "normal",
    sources: [...(ex.disadvantage ? [{ label: "Erschöpfung", mode: "disadvantage" as const }] : []), ...cond.sources, ...(opts.sources ?? [])],
    penalty: ex.penalty,
    notes: [...(ex.note ? [ex.note] : []), ...cond.notes, ...(opts.notes ?? [])],
    target: opts.target,
    critRange: opts.kind === "attack" ? opts.critRange : undefined,
    followUp: opts.followUp,
    onResult: opts.onResult,
    options: opts.options,
  };
}
