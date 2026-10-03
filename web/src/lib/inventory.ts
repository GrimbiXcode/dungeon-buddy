/**
 * Inventar mit Mengen und Verbrauchsgütern.
 *
 * Angriffe und Fähigkeiten können einen Gegenstand verbrauchen (Pfeile,
 * Wurfdolche, Heiltrank …). Was davon nach dem Kampf zurückkommt, legt der
 * Gegenstand fest: Geschosse zur Hälfte (abgerundet), Wurfwaffen ganz,
 * Tränke und Ähnliches gar nicht.
 */
import type { Attack, CharacterData } from "./character";
import { uid } from "./format";

export const AMMO_TYPES = [
  { key: "arrow", label: "Pfeile", one: "Pfeil", pack: 20 },
  { key: "bolt", label: "Bolzen", one: "Bolzen", pack: 20 },
  { key: "slingBullet", label: "Schleuderkugeln", one: "Schleuderkugel", pack: 20 },
  { key: "needle", label: "Blasrohrnadeln", one: "Blasrohrnadel", pack: 50 },
  { key: "firearmBullet", label: "Kugeln", one: "Kugel", pack: 10 },
] as const;
export type AmmoType = (typeof AMMO_TYPES)[number]["key"];

export const RECOVERIES = [
  { key: "half", label: "Hälfte bergen", hint: "Die Hälfte (abgerundet) kommt nach dem Kampf zurück, wie bei Geschossen." },
  { key: "all", label: "Alles aufsammeln", hint: "Kommt nach dem Kampf vollständig zurück, z. B. geworfene Waffen." },
  { key: "none", label: "Verbraucht", hint: "Ist weg, z. B. Tränke oder Alchemistenfeuer." },
] as const;
export type Recovery = (typeof RECOVERIES)[number]["key"];

export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  /** null = normaler Gegenstand, sonst Geschoss dieses Typs */
  ammo: AmmoType | null;
  /** Was nach dem Kampf von verbrauchten Stücken zurückkommt */
  recover: Recovery;
  notes: string;
};

/** Verbrauch eines Angriffs: Gegenstand und Menge pro Angriff */
export type Consumption = { itemId: string; amount: number };

/** Ab dieser Menge warnt die Anzeige bei Verbrauchsgütern */
export const LOW_STOCK = 5;

export const ammoInfo = (t: AmmoType) => AMMO_TYPES.find(a => a.key === t)!;
export const recoveryLabel = (r: Recovery) => RECOVERIES.find(x => x.key === r)!.label;

const MAX_QUANTITY = 99999;
export const clampQuantity = (n: number) => Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number.isFinite(n) ? n : 0)));

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function newInventoryItem(partial: Partial<InventoryItem> = {}): InventoryItem {
  const ammo = partial.ammo ?? null;
  return { id: uid(), name: "", quantity: 1, ammo, recover: ammo ? "half" : "none", notes: "", ...partial };
}

export function normalizeInventoryItem(raw: unknown): InventoryItem {
  const o = obj(raw);
  const ammo = AMMO_TYPES.some(a => a.key === o.ammo) ? (o.ammo as AmmoType) : null;
  return newInventoryItem({
    id: str(o.id) || uid(),
    name: str(o.name).slice(0, 120),
    quantity: clampQuantity(typeof o.quantity === "number" ? o.quantity : 1),
    ammo,
    recover: RECOVERIES.some(r => r.key === o.recover) ? (o.recover as Recovery) : ammo ? "half" : "none",
    notes: str(o.notes),
  });
}

export function normalizeConsumption(raw: unknown): Consumption | null {
  const o = obj(raw);
  const itemId = str(o.itemId);
  if (!itemId) return null;
  const amount = typeof o.amount === "number" && Number.isFinite(o.amount) ? Math.max(1, Math.floor(o.amount)) : 1;
  return { itemId, amount };
}

export function itemById(c: CharacterData, id: string | null | undefined) {
  return id ? c.inventory.find(i => i.id === id) : undefined;
}

/** Name für eine Menge: „1 Pfeil“, „3 Pfeile“; andere Gegenstände unverändert */
export function countLabel(item: InventoryItem, n: number) {
  if (item.ammo && n === 1 && item.name.trim().toLowerCase() === ammoInfo(item.ammo).label.toLowerCase()) {
    return `1 ${ammoInfo(item.ammo).one}`;
  }
  return `${n} × ${item.name || "Gegenstand"}`;
}

// ── Verbrauch ────────────────────────────────────────────────────────────

/**
 * Wurfwaffen im Nahkampf (Dolch, Handbeil …): Der Angriffsdialog fragt, ob
 * geworfen wird. Verbraucht wird nur beim Werfen.
 */
export const asksThrow = (a: Attack) => Boolean(a.consumes) && a.kind === "melee" && a.properties.includes("Wurfwaffe");

/** Gegenstand und Menge, die ein Angriff verbraucht (nur, wenn es den Gegenstand noch gibt) */
export function attackConsumption(c: CharacterData, a: Attack) {
  const item = itemById(c, a.consumes?.itemId);
  return item && a.consumes ? { item, amount: a.consumes.amount } : null;
}

/**
 * Reicht der Bestand für einen Angriff? Ohne Verbrauch immer; Wurfwaffen im
 * Nahkampf können auch ohne Vorrat zuschlagen; bei Geschossen zählt jeder
 * Stapel desselben Typs (Pfeile, Pfeile +1 …).
 */
export function hasStock(c: CharacterData, a: Attack) {
  const use = attackConsumption(c, a);
  if (!use || asksThrow(a)) return true;
  const stacks = use.item.ammo ? c.inventory.filter(i => i.ammo === use.item.ammo) : [use.item];
  return stacks.some(i => i.quantity >= use.amount);
}

/**
 * Menge abziehen. Im laufenden Kampf wird sie für das Bergen vorgemerkt.
 * Gibt die tatsächlich abgezogene Menge zurück.
 */
export function consumeItem(c: CharacterData, item: InventoryItem, amount: number) {
  const n = Math.min(item.quantity, Math.max(0, amount));
  item.quantity -= n;
  if (c.combat.active && n > 0) c.combat.spent[item.id] = (c.combat.spent[item.id] ?? 0) + n;
  return n;
}

/** Verbrauch rückgängig machen (Fehlklick, abgewählte Option). */
export function refundItem(c: CharacterData, item: InventoryItem, amount: number) {
  const n = Math.max(0, amount);
  item.quantity = clampQuantity(item.quantity + n);
  const spent = c.combat.spent[item.id];
  if (spent) {
    const rest = spent - n;
    if (rest > 0) c.combat.spent[item.id] = rest;
    else delete c.combat.spent[item.id];
  }
}

/** Vorschlag, wie viele verbrauchte Stücke zurückkommen */
export function recoverable(recover: Recovery, spent: number) {
  if (recover === "all") return spent;
  if (recover === "half") return Math.floor(spent / 2);
  return 0;
}

export type RecoveryRow = { itemId: string; name: string; recover: Recovery; spent: number; back: number };

/** Im Kampf verbrauchte Gegenstände, von denen etwas zurückkommen kann */
export function recoveryRows(c: CharacterData): RecoveryRow[] {
  return Object.entries(c.combat.spent).flatMap(([itemId, spent]) => {
    const item = itemById(c, itemId);
    if (!item || spent <= 0 || item.recover === "none") return [];
    return [{ itemId, name: item.name, recover: item.recover, spent, back: recoverable(item.recover, spent) }];
  });
}

/** Geborgene Stücke zurück ins Inventar (Menge pro Zeile höchstens die verbrauchte). */
export function applyRecovery(c: CharacterData, rows: RecoveryRow[]) {
  for (const row of rows) {
    const item = itemById(c, row.itemId);
    if (item) item.quantity = clampQuantity(item.quantity + Math.min(row.spent, Math.max(0, row.back)));
  }
}

// ── Vorschläge ───────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLocaleLowerCase("de");

/** Geschosstyp aus dem Waffennamen */
export function ammoForWeapon(name: string): AmmoType | null {
  const n = norm(name);
  if (/blasrohr/.test(n)) return "needle";
  if (/armbrust/.test(n)) return "bolt";
  if (/bogen/.test(n)) return "arrow";
  if (/schleuder/.test(n)) return "slingBullet";
  if (/muskete|pistole/.test(n)) return "firearmBullet";
  return null;
}

/** Geschosstyp aus dem Namen eines Gegenstands (Pfeile, Bolzen …) */
export function ammoForItem(name: string): AmmoType | null {
  const n = norm(name);
  // Wurfpfeile sind Wurfwaffen, keine Geschosse
  if (/pfeil/.test(n) && !/wurfpfeil/.test(n)) return "arrow";
  if (/bolzen/.test(n)) return "bolt";
  if (/schleuderkugel|schleudergeschoss/.test(n)) return "slingBullet";
  if (/blasrohrnadel/.test(n)) return "needle";
  if (/(^|\s)kugeln?(\s|\(|$)/.test(n)) return "firearmBullet";
  return null;
}

/** Gegenstände, die sich beim Einsatz verbrauchen */
const SPENT_ITEMS = ["alchemistenfeuer", "öl", "weihwasser", "säure", "gift"];

/** Wortstamm für den Vergleich: „Wurfdolche“ ~ „Wurfdolch“ ~ „Dolch“ */
const stem = (s: string) => norm(s).replace(/^wurf/, "").replace(/(en|e|n|s)$/, "");

export type ConsumptionSuggestion =
  | { kind: "existing"; item: InventoryItem; recover: Recovery }
  | { kind: "new"; item: InventoryItem };

/**
 * Passendes Verbrauchsgut für einen Angriff: Geschosse für Bogen, Armbrust,
 * Schleuder …, bei Wurfwaffen die Waffe selbst, bei Alchemistenfeuer &
 * Co. der Gegenstand. Vorhandene Stapel werden bevorzugt.
 */
export function suggestConsumption(c: CharacterData, a: Pick<Attack, "name" | "kind" | "properties">): ConsumptionSuggestion | null {
  const name = a.name.trim();
  if (!name) return null;
  const ammo = a.kind === "ranged" || a.properties.includes("Geschosse") ? ammoForWeapon(name) : null;
  if (ammo) {
    const hit = c.inventory.find(i => i.ammo === ammo);
    if (hit) return { kind: "existing", item: hit, recover: hit.recover };
    const info = ammoInfo(ammo);
    return { kind: "new", item: newInventoryItem({ name: info.label, quantity: info.pack, ammo, recover: "half" }) };
  }
  const n = norm(name);
  const spentWord = SPENT_ITEMS.find(w => n.includes(w));
  if (spentWord) {
    const hit = c.inventory.find(i => norm(i.name).includes(spentWord));
    if (hit) return { kind: "existing", item: hit, recover: hit.recover };
    return { kind: "new", item: newInventoryItem({ name, quantity: 1, recover: "none" }) };
  }
  if (a.properties.includes("Wurfwaffe")) {
    const s = stem(name);
    const hit = s ? c.inventory.find(i => !i.ammo && (stem(i.name).includes(s) || s.includes(stem(i.name))) && stem(i.name)) : undefined;
    if (hit) return { kind: "existing", item: hit, recover: hit.recover };
    return { kind: "new", item: newInventoryItem({ name, quantity: 1, recover: "all" }) };
  }
  return null;
}

// ── Übernahme aus dem Freitext ───────────────────────────────────────────

export type ParsedLine = { line: number; name: string; quantity: number };

/**
 * Listenzeilen aus dem bisherigen Freitext „Ausrüstung“ erkennen:
 * „- 20 Pfeile“, „- 2x Heiltrank“, „- Pfeile (20)“, „- Heiltrank ×2“,
 * „- Seil (15 m)“. Nur Zeilen mit Aufzählungszeichen zählen.
 */
export function parseEquipmentText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, line) => {
    const m = raw.match(/^\s*(?:[-*+•]|\d+\.)\s+(.*)$/);
    if (!m) return;
    let name = m[1]!.replace(/\*\*|__/g, "").trim();
    let quantity = 1;
    const lead = name.match(/^(\d{1,5})\s*(?:[x×]\s*)?(\S.*)$/i);
    const trailParen = name.match(/^(.*\S)\s*\((\d{1,5})\)$/);
    const trailTimes = name.match(/^(.*\S)\s*[x×]\s*(\d{1,5})$/i);
    if (lead) {
      quantity = Number(lead[1]);
      name = lead[2]!.trim();
    } else if (trailParen) {
      name = trailParen[1]!;
      quantity = Number(trailParen[2]);
    } else if (trailTimes) {
      name = trailTimes[1]!;
      quantity = Number(trailTimes[2]);
    }
    name = name.trim().slice(0, 120);
    if (name) out.push({ line, name, quantity: clampQuantity(quantity) });
  });
  return out;
}

/** Erkannte Zeilen ins Inventar übernehmen und aus dem Freitext entfernen. */
export function importEquipmentText(c: CharacterData): InventoryItem[] {
  const parsed = parseEquipmentText(c.equipment);
  const items = parsed.map(p => {
    const ammo = ammoForItem(p.name);
    return newInventoryItem({ name: p.name, quantity: p.quantity, ammo, recover: ammo ? "half" : "none" });
  });
  const taken = new Set(parsed.map(p => p.line));
  c.inventory.push(...items);
  c.equipment = c.equipment
    .split(/\r?\n/)
    .filter((_, i) => !taken.has(i))
    .join("\n")
    .trim();
  return items;
}

/** Verweise auf einen gelöschten Gegenstand entfernen. */
export function removeItem(c: CharacterData, id: string) {
  c.inventory = c.inventory.filter(i => i.id !== id);
  for (const a of c.attacks) if (a.consumes?.itemId === id) a.consumes = null;
  for (const f of c.features) if (f.itemId === id) f.itemId = null;
  delete c.combat.spent[id];
}

/**
 * Heilwürfel für bekannte Heiltränke (Vorschlag beim Verwenden):
 * Heiltrank 2W4+2, grösserer 4W4+4, überlegener 8W4+8, vorzüglicher 10W4+20.
 */
export function healingDiceFor(name: string): string {
  const n = norm(name);
  if (!/heiltrank|trank der heilung|potion of healing/.test(n)) return "";
  if (/vorzüglich|supreme/.test(n)) return "10d4+20";
  if (/überlegen|superior/.test(n)) return "8d4+8";
  if (/gr(ö|oe|o)(ss|ß)er|greater/.test(n)) return "4d4+4";
  return "2d4+2";
}
