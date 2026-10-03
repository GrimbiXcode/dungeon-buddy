import { describe, expect, it } from "vitest";
import { armorClass, newArmor, setEquipped, stealthDisadvantage } from "./armor";
import {
  attackAbility,
  attackDamageBonus,
  attackToHit,
  newAttack,
  normalizeAttack,
  normalizeCharacter,
  offhandIsNick,
  offhandWeapons,
  sortProperties,
} from "./character";
import { parseBonus } from "./dice";
import { buildPreset } from "./feature-presets";
import {
  addEffect,
  combineAdvantage,
  confirmLinkSuccess,
  attackOptions,
  newFeature,
  newRollMod,
  normalizeFeature,
  refundFeature,
  rollFeatures,
  rollModMatches,
  sumMods,
  useFeature,
  usesLeft,
  WEAPON_PROPERTIES,
} from "./features";
import { featureFromLibrary, featureToLibrary } from "./library";

describe("Bonusausdrücke", () => {
  it("liest Zahlen und Würfel mit Vorzeichen", () => {
    expect(parseBonus("2")).toEqual({ flat: 2, dice: [], sign: 1 });
    expect(parseBonus("-1")).toEqual({ flat: -1, dice: [], sign: 1 });
    expect(parseBonus("+1d4")).toEqual({ flat: 0, dice: [{ count: 1, sides: 4 }], sign: 1 });
    expect(parseBonus("−1W4")).toEqual({ flat: 0, dice: [{ count: 1, sides: 4 }], sign: -1 });
    expect(parseBonus("1d10+1")).toEqual({ flat: 1, dice: [{ count: 1, sides: 10 }], sign: 1 });
    expect(parseBonus("")).toBeNull();
    expect(parseBonus("abc")).toBeNull();
  });
});

describe("Wurfmodifikatoren", () => {
  it("alte feste Angriffsboni werden übernommen", () => {
    const f = normalizeFeature({ name: "Alt", attackMods: { toHit: 2, damageBonus: 3, advantage: true } });
    expect(f.rollMods).toEqual([
      newRollMod({ target: "attack", bonus: "2", mode: "advantage" }),
      newRollMod({ target: "damage", bonus: "3" }),
    ]);
  });

  it("Attributswürfe umfassen Fertigkeiten und Initiative", () => {
    const strCheck = newRollMod({ target: "check", ability: "str" });
    expect(rollModMatches(strCheck, { kind: "check", ability: "str" })).toBe(true);
    expect(rollModMatches(strCheck, { kind: "skill", ability: "str", skill: "athletics" })).toBe(true);
    expect(rollModMatches(strCheck, { kind: "check", ability: "dex" })).toBe(false);
    const anyCheck = newRollMod({ target: "check" });
    expect(rollModMatches(anyCheck, { kind: "initiative", ability: "dex" })).toBe(true);
    expect(rollModMatches(anyCheck, { kind: "save", ability: "dex" })).toBe(false);
    const stealth = newRollMod({ target: "skill", skill: "stealth" });
    expect(rollModMatches(stealth, { kind: "skill", ability: "dex", skill: "stealth" })).toBe(true);
    expect(rollModMatches(stealth, { kind: "skill", ability: "dex", skill: "acrobatics" })).toBe(false);
    expect(rollModMatches(newRollMod({ target: "save" }), { kind: "deathSave" })).toBe(true);
  });

  it("summiert Bonus, Würfel und Vorteil", () => {
    const sum = sumMods([
      { label: "Segen", mods: [newRollMod({ bonus: "1d4" })] },
      { label: "Ring", mods: [newRollMod({ bonus: "1", mode: "advantage" })] },
    ]);
    expect(sum.flat).toBe(1);
    expect(sum.dice).toEqual([{ label: "Segen", sign: 1, groups: [{ count: 1, sides: 4 }] }]);
    expect(sum.advantage).toBe(true);
    expect(combineAdvantage("disadvantage", true, false)).toBe("normal");
    expect(combineAdvantage("normal", false, true)).toBe("disadvantage");
  });

  it("aktive Effekte wirken automatisch, spontane Fähigkeiten sind wählbar", () => {
    const c = normalizeCharacter({});
    const bless = buildPreset("bless", "2024", "Spezies");
    const tactical = buildPreset("tacticalMind", "2024", "Spezies");
    const rage = buildPreset("rage", "2024", "Spezies");
    c.features = [bless, tactical, rage];

    // Segen wirkt erst als Effekt, Taktisches Verständnis ist wählbar
    let opts = rollFeatures(c, { kind: "check", ability: "str" });
    expect(opts.map(o => o.feature.name)).toEqual(["Taktisches Verständnis"]);
    expect(opts[0]!.automatic).toBe(false);

    useFeature(c, rage);
    useFeature(c, bless);
    opts = rollFeatures(c, { kind: "save", ability: "str" });
    expect(opts.map(o => [o.feature.name, o.automatic])).toEqual([
      ["Kampfrausch", true],
      ["Segen", true],
    ]);
    expect(rollFeatures(c, { kind: "save", ability: "dex" }).map(o => o.feature.name)).toEqual(["Segen"]);
  });
});

describe("Abhängigkeiten zwischen Fähigkeiten", () => {
  function fighter() {
    const c = normalizeCharacter({});
    const secondWind = buildPreset("secondWind", "2024", "Spezies");
    c.features = [secondWind];
    const tactical = buildPreset("tacticalMind", "2024", "Spezies", c.features);
    c.features.push(tactical);
    return { c, secondWind, tactical };
  }

  it("Vorlage verknüpft Taktisches Verständnis mit Durchschnaufen", () => {
    const { tactical, secondWind } = fighter();
    expect(tactical.links).toEqual([{ featureId: secondWind.id, cost: 1, when: "success" }]);
  });

  it("verknüpfte Nutzungen begrenzen und werden erst bei Erfolg verbraucht", () => {
    const { c, secondWind, tactical } = fighter();
    expect(usesLeft(c, tactical)).toBe(2);
    useFeature(c, tactical);
    expect(secondWind.uses.used).toBe(0);
    confirmLinkSuccess(c, tactical, secondWind.id);
    expect(secondWind.uses.used).toBe(1);
    confirmLinkSuccess(c, tactical, secondWind.id);
    expect(usesLeft(c, tactical)).toBe(0);
  });

  it("Verknüpfung „beim Einsetzen“ verbraucht sofort, Rückgabe stellt wieder her", () => {
    const c = normalizeCharacter({});
    const pool = newFeature({ name: "Pool", uses: { max: 3, used: 0, reset: "long" } });
    const user = newFeature({ name: "Nutzer", activation: "free", links: [{ featureId: pool.id, cost: 2, when: "use" }] });
    c.features = [pool, user];
    expect(usesLeft(c, user)).toBe(1);
    useFeature(c, user);
    expect(pool.uses.used).toBe(2);
    refundFeature(c, user);
    expect(pool.uses.used).toBe(0);
  });
});

describe("Rüstungsklasse", () => {
  const base = () => normalizeCharacter({ abilities: { dex: 16, con: 14, wis: 14, str: 12 } });

  it("alte Bögen behalten die feste RK, neue rechnen", () => {
    expect(normalizeCharacter({ ac: 17 }).acMode).toBe("manual");
    expect(armorClass(normalizeCharacter({ ac: 17 })).total).toBe(17);
    expect(normalizeCharacter({}).acMode).toBe("auto");
  });

  it("ohne Rüstung, leichte, mittelschwere und schwere Rüstung", () => {
    const c = base();
    expect(armorClass(c).total).toBe(13);
    const leather = newArmor({ name: "Leder", type: "light", baseAc: 11 });
    const breastplate = newArmor({ name: "Brustplatte", type: "medium", baseAc: 14, dexCap: 2 });
    const plate = newArmor({ name: "Platte", type: "heavy", baseAc: 18, dexCap: 0, strength: 15, stealthDisadvantage: true });
    c.armor = [leather, breastplate, plate];
    setEquipped(c, leather, true);
    expect(armorClass(c).total).toBe(14);
    setEquipped(c, breastplate, true);
    expect(leather.equipped).toBe(false);
    expect(armorClass(c).total).toBe(16);
    setEquipped(c, plate, true);
    const ac = armorClass(c);
    expect(ac.total).toBe(18);
    expect(ac.notes.join(" ")).toContain("STR 15");
    expect(stealthDisadvantage(c)).toBe(true);
  });

  it("Schild, ungerüstete Verteidigung und sonstiger Bonus", () => {
    const c = base();
    c.unarmoredDefense = "barbarian";
    expect(armorClass(c).total).toBe(15);
    const shield = newArmor({ name: "Schild", type: "shield", baseAc: 2 });
    c.armor = [shield];
    setEquipped(c, shield, true);
    expect(armorClass(c).total).toBe(17);
    c.unarmoredDefense = "monk"; // Mönch: nicht mit Schild
    expect(armorClass(c).total).toBe(15);
    c.acBonus = 1;
    expect(armorClass(c).total).toBe(16);
  });

  it("aktive Effekte: Bonus, Grund-RK und Mindest-RK", () => {
    const c = base();
    addEffect(c, { name: "Magierrüstung", featureId: null, remaining: null, concentration: false, note: "", ac: { mode: "base", value: 13 } });
    expect(armorClass(c).total).toBe(16);
    addEffect(c, { name: "Schild des Glaubens", featureId: null, remaining: 100, concentration: true, note: "", ac: { mode: "bonus", value: 2 } });
    expect(armorClass(c).total).toBe(18);
    addEffect(c, { name: "Rindenhaut", featureId: null, remaining: 600, concentration: false, note: "", ac: { mode: "min", value: 20 } });
    expect(armorClass(c).total).toBe(20);
  });

  it("Fähigkeit mit RK-Wirkung: passiv immer, sonst nach dem Einsetzen", () => {
    const c = base();
    const defense = buildPreset("defense", "2024", "Spezies");
    const shieldSpell = buildPreset("shield", "2024", "Spezies");
    c.features = [defense, shieldSpell];
    // Verteidigung gilt nur mit Rüstung
    expect(armorClass(c).total).toBe(13);
    useFeature(c, shieldSpell);
    expect(armorClass(c).total).toBe(18);
    c.armor = [newArmor({ name: "Lederrüstung", type: "light", baseAc: 11, equipped: true })];
    expect(armorClass(c).total).toBe(20);
  });

  it("schwere Rüstung ignoriert auch einen negativen GES-Modifikator", () => {
    const c = base();
    c.abilities.dex = 8;
    c.armor = [newArmor({ name: "Ritterrüstung", type: "heavy", baseAc: 18, equipped: true })];
    expect(armorClass(c).total).toBe(18);
    c.armor = [newArmor({ name: "Schuppenpanzer", type: "medium", baseAc: 14, dexCap: 2, equipped: true })];
    expect(armorClass(c).total).toBe(13);
  });
});

describe("Waffen", () => {
  const c = () => normalizeCharacter({ classes: [{ name: "Schurke", level: 1, hitDie: 8 }], abilities: { str: 10, dex: 16 } });

  it("Finesse: besseres Attribut vorgeschlagen, Wahl möglich", () => {
    const ch = c();
    const rapier = newAttack({ name: "Rapier", ability: "str", properties: ["Finesse"], damage: "1d8" });
    expect(attackAbility(ch, rapier)).toBe("dex");
    expect(attackToHit(ch, rapier)).toBe(3 + 2);
    expect(attackToHit(ch, rapier, { ability: "str" })).toBe(0 + 2);
    expect(attackDamageBonus(ch, rapier, { ability: "str" })).toBe(0);
  });

  it("Zusatzangriff mit leichter Waffe ohne positiven Modifikator", () => {
    const ch = c();
    const dagger = newAttack({ name: "Dolch", ability: "dex", properties: ["Finesse", "Leicht", "Wurfwaffe"], damage: "1d4", mastery: "Einkerben (Nick)" });
    const shortsword = newAttack({ name: "Kurzschwert", ability: "dex", properties: ["Finesse", "Leicht"], damage: "1d6" });
    const thrown = newAttack({ name: "Wurfhammer", ability: "str", kind: "ranged", properties: ["Leicht", "Wurfwaffe"] });
    const longsword = newAttack({ name: "Langschwert", ability: "str", damage: "1d8" });
    ch.attacks = [dagger, shortsword, thrown, longsword];
    expect(offhandWeapons(ch, shortsword, "2014").map(a => a.name)).toEqual(["Dolch"]);
    expect(offhandWeapons(ch, shortsword, "2024").map(a => a.name)).toEqual(["Dolch", "Wurfhammer"]);
    expect(offhandWeapons(ch, longsword, "2024")).toEqual([]);
    expect(attackDamageBonus(ch, dagger, { offhand: true })).toBe(0);
    ch.twoWeaponFighting = true;
    expect(attackDamageBonus(ch, dagger, { offhand: true })).toBe(3);
    ch.twoWeaponFighting = false;
    ch.abilities.dex = 8;
    expect(attackDamageBonus(ch, dagger, { offhand: true, ability: "dex" })).toBe(-1);
    expect(offhandIsNick(dagger, "2024")).toBe(true);
    expect(offhandIsNick(dagger, "2014")).toBe(false);
  });
});

describe("Bibliothek", () => {
  it("Fähigkeit mit Ressource und Verknüpfung wandert über Namen in einen anderen Bogen", () => {
    const source = normalizeCharacter({ resources: [{ id: "ki", name: "Fokus", max: 4, used: 2, reset: "short" }] });
    const secondWind = buildPreset("secondWind", "2024", "Spezies");
    const flurry = newFeature({ name: "Schlaghagel", resourceId: "ki", resourceCost: 1, uses: { max: 2, used: 1, reset: "long" } });
    flurry.links = [{ featureId: secondWind.id, cost: 1, when: "success" }];
    source.features = [secondWind, flurry];
    const data = featureToLibrary(source, flurry);
    expect(data.id).toBeUndefined();

    const target = normalizeCharacter({});
    const otherWind = buildPreset("secondWind", "2024", "Spezies");
    target.features = [otherWind];
    const copy = featureFromLibrary(target, data);
    expect(copy.id).not.toBe(flurry.id);
    expect(copy.uses.used).toBe(0);
    expect(target.resources.map(r => [r.name, r.max, r.reset])).toEqual([["Fokus", 4, "short"]]);
    expect(copy.resourceId).toBe(target.resources[0]!.id);
    expect(copy.links).toEqual([{ featureId: otherWind.id, cost: 1, when: "success" }]);
  });
});

describe("Waffeneigenschaften", () => {
  it("sind alphabetisch sortiert, auch gespeicherte und eigene", () => {
    expect([...WEAPON_PROPERTIES]).toEqual(sortProperties([...WEAPON_PROPERTIES]));
    expect(normalizeAttack({ properties: ["Zweihändig", "Schwer", "Eigene", "Finesse"] }).properties).toEqual(["Eigene", "Finesse", "Schwer", "Zweihändig"]);
  });

  it("alte Eigenschaft „Munition“ heisst jetzt „Geschosse“", () => {
    expect(normalizeAttack({ properties: ["Munition", "Zweihändig"] }).properties).toEqual(["Geschosse", "Zweihändig"]);
    expect(WEAPON_PROPERTIES).toContain("Geschosse");
    expect(WEAPON_PROPERTIES).not.toContain("Munition");
  });
});

describe("Review-Korrekturen Angriffe", () => {
  it("Fähigkeiten nur bei kritischem Treffer stehen separat, auch passive", () => {
    const c = normalizeCharacter({});
    const axe = newAttack({ name: "Axt", ability: "str", damage: "1d12", kind: "melee" });
    c.attacks = [axe];
    const brutal = newFeature({ name: "Brutaler kritischer Treffer", activation: "passive", damage: "1d12", triggers: ["crit"], appliesTo: { scope: "melee", attackIds: [] } });
    c.features = [brutal];
    const opts = attackOptions(c, axe);
    expect(opts.before).toEqual([]);
    expect(opts.onCrit.map(o => o.feature.name)).toEqual(["Brutaler kritischer Treffer"]);
  });

  it("Angriffe mit Zauberattribut erhalten den Zauberangriffsbonus", () => {
    const c = normalizeCharacter({ abilities: { cha: 16 }, spellcasting: { ability: "cha", attackBonusExtra: 1 } });
    const blast = newAttack({ name: "Schauriger Strahl", ability: "spell", damage: "1d10", kind: "ranged" });
    expect(attackToHit(c, blast)).toBe(3 + 2 + 1);
  });

  it("Krit-Bereich wird begrenzt", () => {
    expect(normalizeCharacter({}).critRange).toBe(20);
    expect(normalizeCharacter({ critRange: 19 }).critRange).toBe(19);
    expect(normalizeCharacter({ critRange: 3 }).critRange).toBe(15);
  });
});
