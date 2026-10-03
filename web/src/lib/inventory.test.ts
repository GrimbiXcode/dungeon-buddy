import { describe, expect, it } from "vitest";
import { newAttack, normalizeCharacter, type CharacterData } from "./character";
import { endCombat, newFeature, refundFeature, startCombat, useFeature, usesLeft } from "./features";
import {
  applyRecovery,
  asksThrow,
  consumeItem,
  hasStock,
  healingDiceFor,
  importEquipmentText,
  newInventoryItem,
  parseEquipmentText,
  refundItem,
  removeItem,
  suggestConsumption,
} from "./inventory";
import { attackFromLibrary, attackToLibrary, featureFromLibrary, featureToLibrary } from "./library";

function sheet(): CharacterData {
  return normalizeCharacter({});
}

describe("Inventar: Daten", () => {
  it("ältere Bögen ohne Inventar bleiben gültig", () => {
    const c = normalizeCharacter({ equipment: "- Seil", attacks: [{ name: "Kurzbogen", kind: "ranged" }] });
    expect(c.inventory).toEqual([]);
    expect(c.equipment).toBe("- Seil");
    expect(c.attacks[0]!.consumes).toBeNull();
    expect(c.combat.spent).toEqual({});
  });

  it("normalisiert Gegenstände und Verbrauch", () => {
    const c = normalizeCharacter({
      inventory: [{ id: "p", name: "Pfeile", quantity: 12.7, ammo: "arrow" }, { name: "Seil", quantity: -3 }],
      attacks: [{ name: "Langbogen", consumes: { itemId: "p", amount: 0 } }],
    });
    expect(c.inventory[0]).toMatchObject({ id: "p", quantity: 12, ammo: "arrow", recover: "half" });
    expect(c.inventory[1]).toMatchObject({ quantity: 0, ammo: null, recover: "none" });
    expect(c.attacks[0]!.consumes).toEqual({ itemId: "p", amount: 1 });
  });
});

describe("Inventar: Vorschläge beim Anlegen einer Waffe", () => {
  it("Fernkampfwaffen bekommen passende Geschosse", () => {
    const c = sheet();
    const s = suggestConsumption(c, newAttack({ name: "Langbogen", kind: "ranged" }));
    expect(s?.kind).toBe("new");
    expect(s?.item).toMatchObject({ name: "Pfeile", quantity: 20, ammo: "arrow", recover: "half" });
    expect(suggestConsumption(c, newAttack({ name: "Schwere Armbrust", kind: "ranged" }))?.item).toMatchObject({ name: "Bolzen", ammo: "bolt" });
    expect(suggestConsumption(c, newAttack({ name: "Blasrohr", kind: "ranged" }))?.item).toMatchObject({ quantity: 50, ammo: "needle" });
  });

  it("vorhandene Stapel werden verknüpft statt doppelt angelegt", () => {
    const c = sheet();
    const arrows = newInventoryItem({ name: "Pfeile", quantity: 7, ammo: "arrow" });
    c.inventory.push(arrows);
    const s = suggestConsumption(c, newAttack({ name: "Kurzbogen", kind: "ranged" }));
    expect(s).toMatchObject({ kind: "existing", item: { id: arrows.id } });
  });

  it("Wurfwaffen verbrauchen sich selbst und kommen ganz zurück", () => {
    const c = sheet();
    const daggers = newInventoryItem({ name: "Wurfdolche", quantity: 4 });
    c.inventory.push(daggers);
    expect(suggestConsumption(c, newAttack({ name: "Wurfdolch", properties: ["Wurfwaffe"] }))).toMatchObject({ kind: "existing", item: { id: daggers.id } });
    expect(suggestConsumption(sheet(), newAttack({ name: "Wurfspeer", properties: ["Wurfwaffe"] }))?.item).toMatchObject({ name: "Wurfspeer", recover: "all" });
  });

  it("Alchemistenfeuer ist verbraucht, Nahkampfwaffen brauchen nichts", () => {
    expect(suggestConsumption(sheet(), newAttack({ name: "Alchemistenfeuer", kind: "ranged" }))?.item).toMatchObject({ recover: "none" });
    expect(suggestConsumption(sheet(), newAttack({ name: "Langschwert" }))).toBeNull();
  });
});

describe("Inventar: Verbrauch im Kampf", () => {
  function archer() {
    const c = sheet();
    const arrows = newInventoryItem({ name: "Pfeile", quantity: 2, ammo: "arrow" });
    c.inventory.push(arrows);
    const bow = newAttack({ name: "Langbogen", kind: "ranged", consumes: { itemId: arrows.id, amount: 1 } });
    c.attacks.push(bow);
    return { c, arrows, bow };
  }

  it("zieht ab, merkt sich den Verbrauch im Kampf und sperrt bei 0", () => {
    const { c, arrows, bow } = archer();
    startCombat(c);
    expect(hasStock(c, bow)).toBe(true);
    consumeItem(c, arrows, 1);
    consumeItem(c, arrows, 1);
    expect(arrows.quantity).toBe(0);
    expect(c.combat.spent[arrows.id]).toBe(2);
    expect(hasStock(c, bow)).toBe(false);
    expect(consumeItem(c, arrows, 1)).toBe(0);
  });

  it("ein zweiter Stapel desselben Geschosses reicht", () => {
    const { c, arrows, bow } = archer();
    arrows.quantity = 0;
    c.inventory.push(newInventoryItem({ name: "Pfeile +1", quantity: 3, ammo: "arrow" }));
    expect(hasStock(c, bow)).toBe(true);
  });

  it("ausserhalb des Kampfs wird abgezogen, aber nichts zum Bergen vorgemerkt", () => {
    const { c, arrows } = archer();
    consumeItem(c, arrows, 1);
    expect(arrows.quantity).toBe(1);
    expect(c.combat.spent).toEqual({});
  });

  it("Rückgängig gibt das Geschoss zurück und korrigiert den Zähler", () => {
    const { c, arrows } = archer();
    startCombat(c);
    consumeItem(c, arrows, 1);
    refundItem(c, arrows, 1);
    expect(arrows.quantity).toBe(2);
    expect(c.combat.spent[arrows.id]).toBeUndefined();
  });

  it("Wurfwaffen im Nahkampf fragen nach dem Werfen und sperren nicht", () => {
    const c = sheet();
    const dagger = newInventoryItem({ name: "Dolch", quantity: 0, recover: "all" });
    c.inventory.push(dagger);
    const a = newAttack({ name: "Dolch", properties: ["Finesse", "Leicht", "Wurfwaffe"], consumes: { itemId: dagger.id, amount: 1 } });
    expect(asksThrow(a)).toBe(true);
    expect(hasStock(c, a)).toBe(true);
    expect(asksThrow(newAttack({ name: "Dolch", properties: ["Wurfwaffe"] }))).toBe(false);
  });

  it("nach dem Kampf: Hälfte der Geschosse (abgerundet), Wurfwaffen ganz, Tränke nicht", () => {
    const c = sheet();
    const arrows = newInventoryItem({ name: "Pfeile", quantity: 20, ammo: "arrow" });
    const daggers = newInventoryItem({ name: "Wurfdolche", quantity: 3, recover: "all" });
    const potion = newInventoryItem({ name: "Heiltrank", quantity: 2, recover: "none" });
    c.inventory.push(arrows, daggers, potion);
    startCombat(c);
    consumeItem(c, arrows, 7);
    consumeItem(c, daggers, 2);
    consumeItem(c, potion, 1);
    const rows = endCombat(c);
    expect(rows.map(r => [r.name, r.spent, r.back])).toEqual([
      ["Pfeile", 7, 3],
      ["Wurfdolche", 2, 2],
    ]);
    expect(c.combat.spent).toEqual({});
    applyRecovery(c, rows);
    expect(arrows.quantity).toBe(16);
    expect(daggers.quantity).toBe(3);
    expect(potion.quantity).toBe(1);
  });

  it("angepasste Bergung ist auf die verbrauchte Menge begrenzt", () => {
    const c = sheet();
    const arrows = newInventoryItem({ name: "Pfeile", quantity: 0, ammo: "arrow" });
    c.inventory.push(arrows);
    applyRecovery(c, [{ itemId: arrows.id, name: "Pfeile", recover: "half", spent: 4, back: 9 }]);
    expect(arrows.quantity).toBe(4);
  });
});

describe("Inventar: Fähigkeiten verbrauchen Gegenstände", () => {
  it("Heiltrank trinken zieht ab und begrenzt die Nutzungen", () => {
    const c = sheet();
    const potion = newInventoryItem({ name: "Heiltrank", quantity: 3 });
    c.inventory.push(potion);
    const drink = newFeature({ name: "Heiltrank trinken", activation: "bonus", itemId: potion.id, itemCost: 2 });
    c.features.push(drink);
    expect(usesLeft(c, drink)).toBe(1);
    useFeature(c, drink);
    expect(potion.quantity).toBe(1);
    expect(usesLeft(c, drink)).toBe(0);
    refundFeature(c, drink);
    expect(potion.quantity).toBe(3);
  });

  it("gelöschte Gegenstände lösen ihre Verweise", () => {
    const c = sheet();
    const potion = newInventoryItem({ name: "Heiltrank" });
    c.inventory.push(potion);
    c.features.push(newFeature({ itemId: potion.id }));
    c.attacks.push(newAttack({ consumes: { itemId: potion.id, amount: 1 } }));
    removeItem(c, potion.id);
    expect(c.inventory).toEqual([]);
    expect(c.features[0]!.itemId).toBeNull();
    expect(c.attacks[0]!.consumes).toBeNull();
  });
});

describe("Inventar: Freitext übernehmen", () => {
  it("erkennt Mengen in Listenzeilen", () => {
    expect(parseEquipmentText("Rucksack:\n- 20 Pfeile\n* Heiltrank (2)\n- 3x Fackel\n- Seil (15 m)\n- Ration ×5\n\nText")).toEqual([
      { line: 1, name: "Pfeile", quantity: 20 },
      { line: 2, name: "Heiltrank", quantity: 2 },
      { line: 3, name: "Fackel", quantity: 3 },
      { line: 4, name: "Seil (15 m)", quantity: 1 },
      { line: 5, name: "Ration", quantity: 5 },
    ]);
  });

  it("übernimmt Zeilen ins Inventar, markiert Geschosse und lässt den Rest stehen", () => {
    const c = sheet();
    c.equipment = "Im Rucksack:\n- 20 Pfeile\n- Wurfpfeile (5)\n- Seil";
    const items = importEquipmentText(c);
    expect(items.map(i => [i.name, i.quantity, i.ammo])).toEqual([
      ["Pfeile", 20, "arrow"],
      ["Wurfpfeile", 5, null],
      ["Seil", 1, null],
    ]);
    expect(c.inventory).toHaveLength(3);
    expect(c.equipment).toBe("Im Rucksack:");
  });
});

describe("Inventar: Bibliothek", () => {
  it("Angriffe nehmen ihr Verbrauchsgut über den Namen mit", () => {
    const source = sheet();
    const arrows = newInventoryItem({ name: "Pfeile", quantity: 12, ammo: "arrow" });
    source.inventory.push(arrows);
    const data = attackToLibrary(source, newAttack({ name: "Langbogen", kind: "ranged", consumes: { itemId: arrows.id, amount: 1 } }));
    expect(data.consumes).toBeNull();

    const withArrows = sheet();
    const own = newInventoryItem({ name: "Pfeile", quantity: 5, ammo: "arrow" });
    withArrows.inventory.push(own);
    expect(attackFromLibrary(withArrows, data).consumes).toEqual({ itemId: own.id, amount: 1 });

    const empty = sheet();
    const copy = attackFromLibrary(empty, data);
    expect(empty.inventory[0]).toMatchObject({ name: "Pfeile", quantity: 0, ammo: "arrow", recover: "half" });
    expect(copy.consumes?.itemId).toBe(empty.inventory[0]!.id);
  });

  it("Fähigkeiten nehmen ihren Gegenstand mit", () => {
    const source = sheet();
    const water = newInventoryItem({ name: "Weihwasser", quantity: 2 });
    source.inventory.push(water);
    const data = featureToLibrary(source, newFeature({ name: "Weihwasser werfen", itemId: water.id }));
    const target = sheet();
    const f = featureFromLibrary(target, data);
    expect(target.inventory[0]).toMatchObject({ name: "Weihwasser", quantity: 0 });
    expect(f.itemId).toBe(target.inventory[0]!.id);
  });
});

describe("Inventar: Heiltränke", () => {
  it("schlägt Heilwürfel vor", () => {
    expect(healingDiceFor("Heiltrank")).toBe("2d4+2");
    expect(healingDiceFor("Grösserer Heiltrank")).toBe("4d4+4");
    expect(healingDiceFor("Heiltrank, überlegen")).toBe("8d4+8");
    expect(healingDiceFor("Seil")).toBe("");
  });
});
