/**
 * Eigene Bibliothek: Fähigkeiten, Angriffe, Rüstungen und Zauber, die du
 * bei anderen Charakteren wiederverwenden und mit Freunden teilen kannst.
 *
 * Einträge sind Kopien. Verweise innerhalb eines Bogens (Ressourcen,
 * verknüpfte Fähigkeiten, bestimmte Waffen) werden über Namen gespeichert
 * und beim Übernehmen in einen Bogen wieder aufgelöst.
 */
import { normalizeArmor, type ArmorItem } from "./armor";
import { newResource, normalizeAttack, type Attack, type CharacterData } from "./character";
import { LINK_WHEN, linkedFeatures, normalizeFeature, type Feature, type LinkWhen } from "./features";
import { uid } from "./format";
import type { Ruleset, Spell, SpellData } from "./types";

export const LIBRARY_KINDS = [
  { key: "feature", label: "Fähigkeit", plural: "Fähigkeiten" },
  { key: "attack", label: "Angriff", plural: "Angriffe" },
  { key: "armor", label: "Rüstung", plural: "Rüstungen & Schilde" },
  { key: "spell", label: "Zauber", plural: "Zauber" },
] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number]["key"];

export const kindLabel = (k: LibraryKind) => LIBRARY_KINDS.find(x => x.key === k)?.label ?? k;

export type LibraryItem = {
  id: string;
  userId: string;
  kind: LibraryKind;
  name: string;
  /** Regelversion, für die der Eintrag erfasst wurde; null = beide */
  ruleset: Ruleset | null;
  data: Record<string, unknown>;
  /** Herkunft, z. B. Anzeigename des Freundes bei einer Kopie */
  sourceName: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryInput = Pick<LibraryItem, "kind" | "name" | "ruleset" | "data">;

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const norm = (s: string) => s.trim().toLowerCase();

type FeatureRefs = {
  resourceRef?: { name: string; max: number; reset: string } | null;
  linkRefs?: { name: string; cost: number; when: LinkWhen }[];
  attackRefs?: string[];
};

// ── Bogen → Bibliothek ───────────────────────────────────────────────────

export function featureToLibrary(c: CharacterData, f: Feature): LibraryInput["data"] {
  const copy = plain(f) as Partial<Feature> & FeatureRefs;
  const resource = f.resourceId ? c.resources.find(r => r.id === f.resourceId) : undefined;
  copy.resourceRef = resource ? { name: resource.name, max: resource.max, reset: resource.reset } : null;
  copy.linkRefs = linkedFeatures(c, f).map(({ link, feature }) => ({ name: feature.name, cost: link.cost, when: link.when }));
  copy.attackRefs = f.appliesTo.scope === "specific" ? c.attacks.filter(a => f.appliesTo.attackIds.includes(a.id)).map(a => a.name) : [];
  delete copy.id;
  copy.resourceId = null;
  copy.links = [];
  copy.appliesTo = { scope: f.appliesTo.scope, attackIds: [] };
  copy.uses = { ...f.uses, used: 0 };
  return copy as Record<string, unknown>;
}

export function attackToLibrary(a: Attack): LibraryInput["data"] {
  const copy = plain(a) as Partial<Attack>;
  delete copy.id;
  return copy as Record<string, unknown>;
}

export function armorToLibrary(a: ArmorItem): LibraryInput["data"] {
  const copy = plain(a) as Partial<ArmorItem>;
  delete copy.id;
  copy.equipped = false;
  return copy as Record<string, unknown>;
}

export function spellToLibrary(s: Spell): LibraryInput["data"] {
  return { level: s.level, srdKey: s.srdKey, data: plain(s.data), notes: s.notes };
}

// ── Bibliothek → Bogen ───────────────────────────────────────────────────

/** Verweise aus geteilten Daten nur in gültiger Form übernehmen */
function linkRefsOf(refs: FeatureRefs) {
  return (Array.isArray(refs.linkRefs) ? refs.linkRefs : []).flatMap(l =>
    l && typeof l.name === "string"
      ? [{ name: l.name, cost: Number.isFinite(Number(l.cost)) ? Math.max(0, Number(l.cost)) : 1, when: LINK_WHEN.some(w => w.key === l.when) ? l.when : ("use" as const) }]
      : []
  );
}

/**
 * Fähigkeit in einen Bogen übernehmen; fehlende Ressourcen werden angelegt.
 * `name`: Name des Bibliothekseintrags (kann umbenannt worden sein).
 */
export function featureFromLibrary(c: CharacterData, data: Record<string, unknown>, name?: string): Feature {
  const refs = data as FeatureRefs;
  const f = normalizeFeature({ ...data, id: uid(), ...(name?.trim() ? { name: name.trim() } : {}) });
  f.uses.used = 0;
  f.resourceId = null;
  if (refs.resourceRef?.name) {
    let r = c.resources.find(x => norm(x.name) === norm(refs.resourceRef!.name));
    if (!r) {
      const reset = refs.resourceRef.reset;
      r = newResource({
        name: refs.resourceRef.name,
        max: Number(refs.resourceRef.max) || 1,
        reset: reset === "short" || reset === "none" ? reset : "long",
      });
      c.resources.push(r);
    }
    f.resourceId = r.id;
  }
  f.links = linkRefsOf(refs).flatMap(l => {
    const target = c.features.find(x => norm(x.name) === norm(l.name));
    return target ? [{ featureId: target.id, cost: l.cost, when: l.when }] : [];
  });
  const attackRefs = Array.isArray(refs.attackRefs) ? refs.attackRefs.filter((n): n is string => typeof n === "string") : [];
  f.appliesTo.attackIds = c.attacks.filter(a => attackRefs.some(n => norm(n) === norm(a.name))).map(a => a.id);
  return f;
}

/** Verknüpfungen, die sich im Ziel-Bogen nicht auflösen liessen (für Hinweise). */
export function unresolvedLinks(c: CharacterData, data: Record<string, unknown>) {
  const refs = data as FeatureRefs;
  return linkRefsOf(refs).filter(l => !c.features.some(x => norm(x.name) === norm(l.name))).map(l => l.name);
}

export function attackFromLibrary(data: Record<string, unknown>, name?: string): Attack {
  return normalizeAttack({ ...data, id: uid(), ...(name?.trim() ? { name: name.trim() } : {}) });
}

export function armorFromLibrary(data: Record<string, unknown>, name?: string): ArmorItem {
  return normalizeArmor({ ...data, id: uid(), equipped: false, ...(name?.trim() ? { name: name.trim() } : {}) });
}

export function spellFromLibrary(item: LibraryItem) {
  const d = item.data as { level?: number; srdKey?: string | null; data?: Partial<SpellData>; notes?: string };
  return {
    name: item.name,
    level: Math.min(9, Math.max(0, Number(d.level) || 0)),
    srdKey: typeof d.srdKey === "string" ? d.srdKey : null,
    data: d.data ?? {},
    notes: typeof d.notes === "string" ? d.notes : "",
  };
}

/** Kurzbeschreibung für Listen. */
export function librarySummary(item: LibraryItem): string {
  const d = item.data;
  switch (item.kind) {
    case "feature": {
      const f = normalizeFeature(d);
      return [f.categories.join(", "), f.benefit].filter(Boolean).join(" · ");
    }
    case "attack": {
      const a = normalizeAttack(d);
      return [a.kind === "ranged" ? "Fernkampf" : "Nahkampf", [a.damage, a.damageType].filter(Boolean).join(" "), a.properties.join(", ")].filter(Boolean).join(" · ");
    }
    case "armor": {
      const a = normalizeArmor(d);
      return a.type === "shield" ? `Schild +${a.baseAc + a.bonus}` : `RK ${a.baseAc + a.bonus}`;
    }
    case "spell": {
      const s = spellFromLibrary(item);
      const sd = s.data;
      return [s.level === 0 ? "Zaubertrick" : `Grad ${s.level}`, sd.school, sd.castingTime].filter(Boolean).join(" · ");
    }
  }
}
