/**
 * Eigene Bibliothek: Fähigkeiten, Angriffe, Rüstungen und Zauber, die du
 * bei anderen Charakteren wiederverwenden und mit Freunden teilen kannst.
 *
 * Einträge sind Kopien. Verweise innerhalb eines Bogens (Ressourcen, Gegenstände,
 * verknüpfte Fähigkeiten, bestimmte Waffen) werden über Namen gespeichert
 * und beim Übernehmen in einen Bogen wieder aufgelöst.
 */
import { normalizeArmor, type ArmorItem } from "./armor";
import { newResource, normalizeAttack, type Attack, type CharacterData } from "./character";
import { linkedFeatures, normalizeFeature, type Feature, type LinkWhen } from "./features";
import { uid } from "./format";
import { itemById, newInventoryItem, type AmmoType, type InventoryItem, type Recovery } from "./inventory";
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

/** Verweis auf einen Gegenstand im Inventar, über Namen und Geschosstyp */
type ItemRef = { name: string; ammo: AmmoType | null; recover: Recovery };

type FeatureRefs = {
  resourceRef?: { name: string; max: number; reset: string } | null;
  itemRef?: ItemRef | null;
  linkRefs?: { name: string; cost: number; when: LinkWhen }[];
  attackRefs?: string[];
};

// ── Bogen → Bibliothek ───────────────────────────────────────────────────

function itemRef(c: CharacterData, id: string | null | undefined): ItemRef | null {
  const item = itemById(c, id);
  return item ? { name: item.name, ammo: item.ammo, recover: item.recover } : null;
}

export function featureToLibrary(c: CharacterData, f: Feature): LibraryInput["data"] {
  const copy = plain(f) as Partial<Feature> & FeatureRefs;
  const resource = f.resourceId ? c.resources.find(r => r.id === f.resourceId) : undefined;
  copy.resourceRef = resource ? { name: resource.name, max: resource.max, reset: resource.reset } : null;
  copy.linkRefs = linkedFeatures(c, f).map(({ link, feature }) => ({ name: feature.name, cost: link.cost, when: link.when }));
  copy.attackRefs = f.appliesTo.scope === "specific" ? c.attacks.filter(a => f.appliesTo.attackIds.includes(a.id)).map(a => a.name) : [];
  delete copy.id;
  copy.resourceId = null;
  copy.itemRef = itemRef(c, f.itemId);
  copy.itemId = null;
  copy.links = [];
  copy.appliesTo = { scope: f.appliesTo.scope, attackIds: [] };
  copy.uses = { ...f.uses, used: 0 };
  return copy as Record<string, unknown>;
}

export function attackToLibrary(c: CharacterData, a: Attack): LibraryInput["data"] {
  const copy = plain(a) as Partial<Attack> & { consumesRef?: (ItemRef & { amount: number }) | null };
  delete copy.id;
  const ref = itemRef(c, a.consumes?.itemId);
  copy.consumesRef = ref && a.consumes ? { ...ref, amount: a.consumes.amount } : null;
  copy.consumes = null;
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

/**
 * Gegenstand im Ziel-Bogen finden (gleicher Name, sonst gleicher Geschosstyp)
 * oder mit Menge 0 anlegen, damit die Verknüpfung erhalten bleibt.
 */
function resolveItem(c: CharacterData, ref: ItemRef | null | undefined): InventoryItem | null {
  if (!ref?.name) return null;
  const found =
    c.inventory.find(i => norm(i.name) === norm(ref.name)) ?? (ref.ammo ? c.inventory.find(i => i.ammo === ref.ammo) : undefined);
  if (found) return found;
  const item = newInventoryItem({ name: ref.name, quantity: 0, ammo: ref.ammo ?? null, recover: ref.recover ?? "none" });
  c.inventory.push(item);
  return item;
}

/** Fähigkeit in einen Bogen übernehmen; fehlende Ressourcen werden angelegt. */
export function featureFromLibrary(c: CharacterData, data: Record<string, unknown>): Feature {
  const refs = data as FeatureRefs;
  const f = normalizeFeature({ ...data, id: uid() });
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
  f.itemId = resolveItem(c, refs.itemRef)?.id ?? null;
  f.links = (refs.linkRefs ?? []).flatMap(l => {
    const target = c.features.find(x => norm(x.name) === norm(l.name));
    return target ? [{ featureId: target.id, cost: l.cost, when: l.when }] : [];
  });
  f.appliesTo.attackIds = c.attacks.filter(a => (refs.attackRefs ?? []).some(n => norm(n) === norm(a.name))).map(a => a.id);
  return f;
}

/** Verknüpfungen, die sich im Ziel-Bogen nicht auflösen liessen (für Hinweise). */
export function unresolvedLinks(c: CharacterData, data: Record<string, unknown>) {
  const refs = data as FeatureRefs;
  return (refs.linkRefs ?? []).filter(l => !c.features.some(x => norm(x.name) === norm(l.name))).map(l => l.name);
}

export function attackFromLibrary(c: CharacterData, data: Record<string, unknown>): Attack {
  const a = normalizeAttack({ ...data, id: uid(), consumes: null });
  const ref = (data as { consumesRef?: (ItemRef & { amount?: number }) | null }).consumesRef;
  const item = resolveItem(c, ref);
  if (item) a.consumes = { itemId: item.id, amount: Math.max(1, Number(ref?.amount) || 1) };
  return a;
}

export function armorFromLibrary(data: Record<string, unknown>): ArmorItem {
  return normalizeArmor({ ...data, id: uid(), equipped: false });
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
