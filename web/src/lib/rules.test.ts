import { describe, expect, it } from "vitest";
import { addExpr, critExpr, diceString, formatDice, parseDice, rollDie, scaleExpr } from "./dice";
import { abilityMod, cantripMultiplier, conditionEffect, exhaustionEffect, formatMod, proficiencyBonus } from "./dnd";
import {
  applyDamage,
  applyHealing,
  applyDeathSave,
  attackDamageBonus,
  effectiveMaxHp,
  effectiveSpeed,
  attackToHit,
  hitDiceLeft,
  hitDicePools,
  initiative,
  checkBonus,
  longRest,
  newAttack,
  normalizeCharacter,
  passive,
  saveBonus,
  shortRest,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
} from "./character";

describe("Würfelausdrücke", () => {
  it("liest gängige Formen", () => {
    expect(parseDice("2d6+3")).toEqual({ groups: [{ count: 2, sides: 6 }], bonus: 3 });
    expect(parseDice("d20")).toEqual({ groups: [{ count: 1, sides: 20 }], bonus: 0 });
    expect(parseDice("1W8 + 1d6 − 1")).toEqual({ groups: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }], bonus: -1 });
    expect(parseDice("1d6+1d6")).toEqual({ groups: [{ count: 2, sides: 6 }], bonus: 0 });
    expect(parseDice("5")).toEqual({ groups: [], bonus: 5 });
  });

  it("lehnt Unsinn ab", () => {
    expect(parseDice("")).toBeNull();
    expect(parseDice("2x6")).toBeNull();
    expect(parseDice("-1d6")).toBeNull();
  });

  it("formatiert und rechnet", () => {
    const e = parseDice("8d6")!;
    expect(formatDice(critExpr(e))).toBe("16W6");
    expect(diceString(addExpr(e, scaleExpr(parseDice("1d6")!, 2)))).toBe("10d6");
    expect(diceString({ groups: [{ count: 1, sides: 8 }], bonus: -2 })).toBe("1d8-2");
    expect(parseDice(formatDice(parseDice("2d4+2")!))).toEqual(parseDice("2d4+2"));
  });

  it("würfelt im gültigen Bereich", () => {
    for (let i = 0; i < 2000; i++) {
      const n = rollDie(20);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
    }
  });
});

describe("Grundregeln", () => {
  it("Attributsmodifikator", () => {
    expect(abilityMod(1)).toBe(-5);
    expect(abilityMod(9)).toBe(-1);
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(17)).toBe(3);
    expect(abilityMod(30)).toBe(10);
  });

  it("Übungsbonus nach Stufe", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it("Zaubertrick-Skalierung", () => {
    expect([1, 4, 5, 10, 11, 16, 17, 20].map(cantripMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("formatMod", () => {
    expect(formatMod(3)).toBe("+3");
    expect(formatMod(0)).toBe("+0");
    expect(formatMod(-2)).toBe("−2");
  });

  it("Erschöpfung 2024: −2 pro Stufe auf alle W20-Tests", () => {
    expect(exhaustionEffect("2024", 3, "attack")).toMatchObject({ penalty: -6, disadvantage: false });
    expect(exhaustionEffect("2024", 0, "save")).toMatchObject({ penalty: 0, disadvantage: false });
  });

  it("Erschöpfung 2014: Nachteil je nach Stufe und Wurfart", () => {
    expect(exhaustionEffect("2014", 1, "skill").disadvantage).toBe(true);
    expect(exhaustionEffect("2014", 1, "attack").disadvantage).toBe(false);
    expect(exhaustionEffect("2014", 3, "save").disadvantage).toBe(true);
    expect(exhaustionEffect("2014", 2, "save").penalty).toBe(0);
  });
});

describe("Charakter", () => {
  const thorin = () =>
    normalizeCharacter({
      classes: [{ name: "Kämpfer", level: 5, hitDie: 10 }],
      abilities: { str: 17, dex: 12, con: 16, wis: 13 },
      saveProficiencies: { str: true, con: true },
      skills: { athletics: 1, intimidation: 2 },
      hp: { max: 49, current: 30, temp: 5 },
      spellcasting: { ability: "wis", slots: [{ max: 4, used: 3 }] },
      resources: [
        { name: "Tatendrang", max: 1, used: 1, reset: "short" },
        { name: "X", max: 2, used: 2, reset: "long" },
      ],
      hitDiceUsed: 4,
      exhaustion: 2,
    });

  it("normalisiert fehlende Felder", () => {
    const c = normalizeCharacter({ abilities: { str: "x" }, skills: { athletics: 7 } });
    expect(c.abilities.str).toBe(10);
    expect(c.skills.athletics).toBe(0);
    expect(c.spellcasting.slots).toHaveLength(9);
    expect(c.rollMode).toBe("inherit");
  });

  it("Boni", () => {
    const c = thorin();
    expect(saveBonus(c, "str")).toBe(6);
    expect(saveBonus(c, "dex")).toBe(1);
    expect(skillBonus(c, "athletics")).toBe(6);
    expect(skillBonus(c, "intimidation")).toBe(6); // CHA 10 (+0) + Expertise (2 × 3)
    expect(passive(c, "perception", "2024")).toBe(11);
    expect(passive(c, "perception", "2014")).toBe(6); // Erschöpfung 2 (2014): Nachteil → −5
    expect(initiative(c, "2014")).toBe(1);
    expect(spellAttackBonus(c)).toBe(4);
    expect(spellSaveDc(c)).toBe(12);
  });

  it("Alleskönner gibt halben Übungsbonus auf ungeübte Fertigkeiten", () => {
    const c = thorin();
    c.jackOfAllTrades = true;
    expect(skillBonus(c, "stealth")).toBe(1 + 1);
    expect(skillBonus(c, "athletics")).toBe(6);
  });

  it("Angriffe", () => {
    const c = thorin();
    const sword = newAttack({ ability: "str", damage: "1d8", damageBonus: 1, toHitBonus: 1 });
    expect(attackToHit(c, sword)).toBe(3 + 3 + 1);
    expect(attackDamageBonus(c, sword)).toBe(4);
    expect(attackToHit(c, { ...sword, proficient: false })).toBe(4);
  });

  it("Schaden zieht zuerst temporäre TP ab, Heilung bis Maximum", () => {
    const c = thorin();
    applyDamage(c, 8);
    expect(c.hp).toEqual({ max: 49, current: 27, temp: 0 });
    applyHealing(c, 100);
    expect(c.hp.current).toBe(49);
  });

  it("Rasten", () => {
    const c = thorin();
    shortRest(c);
    expect(c.resources.map(r => r.used)).toEqual([0, 2]);
    longRest(c, "2014");
    expect(c.hp.current).toBe(49);
    expect(c.spellcasting.slots[0]!.used).toBe(0);
    expect(hitDiceLeft(c)).toBe(5 - 2); // 2014: Hälfte (2) zurück
    expect(c.exhaustion).toBe(1);

    const d = thorin();
    longRest(d, "2024");
    expect(d.hitDiceUsed).toEqual({}); // 2024: alle zurück
  });
});

describe("Trefferwürfel und Alleskönner", () => {
  it("führt Trefferwürfel je Würfelgrösse, alte Gesamtzahl wird verteilt", () => {
    const c = normalizeCharacter({ classes: [{ name: "Kämpfer", level: 5, hitDie: 10 }, { name: "Magier", level: 3, hitDie: 6 }], hitDiceUsed: 6 });
    expect(hitDicePools(c)).toEqual([
      { die: 10, total: 5, used: 5 },
      { die: 6, total: 3, used: 1 },
    ]);
    expect(hitDiceLeft(c)).toBe(2);
    longRest(c, "2014"); // 4 zurück, grosse zuerst
    expect(hitDicePools(c).map(p => p.used)).toEqual([1, 1]);
  });

  it("Alleskönner: 2014 auch Attributswürfe und Initiative, 2024 nur Fertigkeiten", () => {
    const c = normalizeCharacter({ classes: [{ name: "Barde", level: 5, hitDie: 8 }], abilities: { dex: 14 }, jackOfAllTrades: true });
    expect(initiative(c, "2014")).toBe(3);
    expect(initiative(c, "2024")).toBe(2);
    expect(checkBonus(c, "str", "2014")).toBe(1);
    expect(checkBonus(c, "str", "2024")).toBe(0);
  });
});

describe("Todesrettung", () => {
  const down = () => normalizeCharacter({ hp: { max: 20, current: 5, temp: 0 } });

  it("Schaden bei 0 TP zählt Fehlschläge, massiver Schaden tötet", () => {
    const c = down();
    expect(applyDamage(c, 5)).toMatch(/bewusstlos/);
    applyDamage(c, 1);
    expect(c.deathSaves.failures).toBe(1);
    applyDamage(c, 1, { crit: true });
    expect(c.deathSaves.failures).toBe(3);
    const d = down();
    expect(applyDamage(d, 25)).toMatch(/sofortiger Tod/);
    expect(d.deathSaves.failures).toBe(3);
  });

  it("Wurfergebnis wird eingetragen", () => {
    const c = down();
    c.hp.current = 0;
    applyDeathSave(c, 12, 12);
    applyDeathSave(c, 5, 5);
    applyDeathSave(c, 1, 1);
    expect(c.deathSaves).toEqual({ successes: 1, failures: 3 });
    const d = down();
    d.hp.current = 0;
    d.deathSaves = { successes: 2, failures: 2 };
    applyDeathSave(d, 20, 20);
    expect(d.hp.current).toBe(1);
    expect(d.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});

describe("Zustände und Erschöpfung", () => {
  it("Zustände setzen Vorteil/Nachteil", () => {
    expect(conditionEffect(["Vergiftet"], "attack", null, "2024").sources).toEqual([{ label: "Vergiftet", mode: "disadvantage" }]);
    expect(conditionEffect(["Vergiftet"], "skill", "wis", "2014").sources).toHaveLength(1);
    expect(conditionEffect(["Liegend"], "save", "dex", "2024").sources).toEqual([]);
    expect(conditionEffect(["Festgesetzt"], "save", "dex", "2024").sources).toHaveLength(1);
    expect(conditionEffect(["Unsichtbar"], "initiative", "dex", "2024").sources[0]!.mode).toBe("advantage");
    expect(conditionEffect(["Unsichtbar"], "initiative", "dex", "2014").sources).toEqual([]);
    expect(conditionEffect(["Gelähmt"], "save", "str", "2014").notes).toHaveLength(1);
  });

  it("Erschöpfung verringert TP-Maximum und Bewegung", () => {
    const c = normalizeCharacter({ hp: { max: 30, current: 30 }, speed: 30, exhaustion: 4 });
    expect(effectiveMaxHp(c, "2014")).toBe(15);
    expect(effectiveMaxHp(c, "2024")).toBe(30);
    expect(effectiveSpeed(c, "2014")).toBe(15);
    expect(effectiveSpeed(c, "2024")).toBe(10);
    c.exhaustion = 5;
    expect(effectiveSpeed(c, "2014")).toBe(0);
    c.hp.current = 10;
    c.exhaustion = 5;
    longRest(c, "2014"); // Stufe 4: Maximum noch halbiert
    expect(c.hp.current).toBe(15);
  });

  it("Passive Wahrnehmung −5 bei Nachteil", () => {
    const c = normalizeCharacter({ abilities: { wis: 10 }, conditions: ["Vergiftet"] });
    expect(passive(c, "perception", "2024")).toBe(5);
  });
});
