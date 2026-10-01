import type { Npc, NpcRelation, NpcStatus } from "../../lib/types";

export type AttitudeInfo = {
  value: number;
  label: string;
  /** mit weichen Trennstellen für schmale Auswahlknöpfe */
  soft: string;
  /** CSS-Farbe (Variable, im Netzwerk-Wrapper für hell/dunkel definiert) */
  color: string;
};

/** Skala -2 … +2 (Haltung gegenüber dir / der Gruppe bzw. zwischen NPCs). */
export const ATTITUDES: AttitudeInfo[] = [
  { value: -2, label: "Feindlich", soft: "Feind\u00adlich", color: "var(--att-n2)" },
  { value: -1, label: "Unfreundlich", soft: "Unfreund\u00adlich", color: "var(--att-n1)" },
  { value: 0, label: "Neutral", soft: "Neutral", color: "var(--att-0)" },
  { value: 1, label: "Freundlich", soft: "Freund\u00adlich", color: "var(--att-p1)" },
  { value: 2, label: "Verbündet", soft: "Verbün\u00addet", color: "var(--att-p2)" },
];

export function attitudeInfo(value: number | null | undefined): AttitudeInfo {
  const v = Math.max(-2, Math.min(2, Math.round(value ?? 0)));
  return ATTITUDES[v + 2]!;
}

export const attitudeLabel = (value: number) => attitudeInfo(value).label;
export const attitudeColor = (value: number) => attitudeInfo(value).color;

export const STATUSES: { value: NpcStatus; label: string }[] = [
  { value: "alive", label: "Lebendig" },
  { value: "dead", label: "Tot" },
  { value: "missing", label: "Verschollen" },
  { value: "unknown", label: "Unbekannt" },
];

export function statusLabel(status: NpcStatus) {
  return STATUSES.find(s => s.value === status)?.label ?? status;
}

/** Ob der NPC im Netz mit „Du / Gruppe“ verbunden wird. */
export function hasPlayerLink(npc: Npc) {
  return npc.attitude !== 0 || npc.relation.trim() !== "";
}

/** Beziehungen eines NPCs, aus seiner Sicht (ausgehend/eingehend). */
export type RelationView = { relation: NpcRelation; outgoing: boolean; otherId: string };

export function relationsOf(npcId: string, relations: NpcRelation[]): RelationView[] {
  const out: RelationView[] = [];
  for (const r of relations) {
    if (r.fromNpcId === npcId) out.push({ relation: r, outgoing: true, otherId: r.toNpcId });
    else if (r.toNpcId === npcId) out.push({ relation: r, outgoing: false, otherId: r.fromNpcId });
  }
  return out;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
