import { exhaustionEffect, type RollKind } from "./dnd";
import { session } from "./session.svelte";
import type { Ruleset } from "./types";
import type { RollModeSetting } from "./character";

export type AdvMode = "normal" | "advantage" | "disadvantage";

export type DamageRequest = {
  type: "damage";
  title: string;
  subtitle?: string;
  /** Würfelausdruck inkl. Bonus, z. B. "2d6+3" */
  dice: string;
  damageType?: string;
  heal?: boolean;
  crit?: boolean;
  /** Kritische Treffer ermöglichen (bei Heilung sinnlos) */
  canCrit?: boolean;
  physical: boolean;
};

export type D20Request = {
  type: "d20";
  title: string;
  subtitle?: string;
  modifier: number;
  kind: RollKind;
  physical: boolean;
  /** Voreinstellung für Vorteil/Nachteil */
  mode?: AdvMode;
  /** Pauschaler Abzug, z. B. Erschöpfung (2024) */
  penalty?: number;
  notes?: string[];
  /** Ziel, gegen das gewürfelt wird (z. B. SG 10 bei Todesrettungswürfen) */
  target?: number;
  /** Anschliessender Schadenswurf (Angriffe) */
  followUp?: Omit<DamageRequest, "physical" | "type">;
  /** Rückmeldung des Ergebnisses (behaltener W20 und Gesamtwert) */
  onResult?: (kept: number, total: number) => void;
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
  roller.log.unshift({ ...entry, id: nextId++, at: new Date() });
  if (roller.log.length > 30) roller.log.length = 30;
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
  followUp?: D20Request["followUp"];
  onResult?: D20Request["onResult"];
}): D20Request {
  const ex = exhaustionEffect(opts.ruleset, opts.exhaustion, opts.kind);
  return {
    type: "d20",
    title: opts.title,
    subtitle: opts.subtitle,
    modifier: opts.modifier,
    kind: opts.kind,
    physical: isPhysical(opts.rollMode),
    mode: ex.disadvantage ? "disadvantage" : "normal",
    penalty: ex.penalty,
    notes: ex.note ? [ex.note] : [],
    target: opts.target,
    followUp: opts.followUp,
    onResult: opts.onResult,
  };
}
