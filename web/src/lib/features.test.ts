import { describe, expect, it } from "vitest";
import { longRest, newAttack, normalizeCharacter, shortRest } from "./character";
import { diceString } from "./dice";
import { buildPreset, FEATURE_PRESETS } from "./feature-presets";
import {
  activationFromCastingTime,
  addEffect,
  appliesToAttack,
  attackOptions,
  deriveEffectType,
  describeDamageAdds,
  describeRollMods,
  economySpent,
  featureDamageExpr,
  endCombat,
  isAvailable,
  isDamageTwice,
  matchesFilter,
  newDamageAdd,
  newFeature,
  newRollMod,
  nextTurn,
  normalizeFeature,
  startCombat,
  useFeature,
  usesLeft,
} from "./features";

function rogue() {
  const c = normalizeCharacter({ classes: [{ name: "Schurke", level: 5, hitDie: 8 }], abilities: { dex: 18 } });
  const rapier = newAttack({ name: "Rapier", ability: "dex", damage: "1d8", kind: "melee", properties: ["Finesse"] });
  const bow = newAttack({ name: "Kurzbogen", ability: "dex", damage: "1d6", kind: "ranged" });
  c.attacks = [rapier, bow];
  const sneak = buildPreset("sneak", "2024", "Spezies");
  sneak.damage = "3d6";
  const archery = buildPreset("archery", "2024", "Spezies");
  const cunning = buildPreset("cunning", "2024", "Spezies");
  const gwm = buildPreset("gwm", "2014", "Volk");
  gwm.appliesTo.attackIds = [rapier.id];
  c.features = [sneak, archery, cunning, gwm];
  return { c, rapier, bow, sneak, archery, cunning, gwm };
}

describe("Fähigkeiten", () => {
  it("normalisiert unvollständige Daten", () => {
    const f = normalizeFeature({ name: "X", activation: "quatsch", uses: { max: 2 } });
    expect(f.activation).toBe("action");
    expect(f.uses).toEqual({ max: 2, used: 0, reset: "long" });
    expect(f.appliesTo.scope).toBe("none");
  });

  it("alle Vorlagen lassen sich bauen", () => {
    for (const p of FEATURE_PRESETS) {
      for (const r of ["2014", "2024"] as const) expect(buildPreset(p.key, r, "Spezies").name).toBeTruthy();
    }
  });

  it("Nutzungen und Ressourcen", () => {
    const c = normalizeCharacter({ resources: [{ id: "ki", name: "Ki", max: 5, used: 3 }] });
    const flurry = newFeature({ name: "Schlaghagel", activation: "bonus", resourceId: "ki", resourceCost: 1 });
    const limited = newFeature({ uses: { max: 2, used: 1, reset: "short" } });
    c.features = [flurry, limited];
    expect(usesLeft(c, flurry)).toBe(2);
    expect(usesLeft(c, limited)).toBe(1);
    useFeature(c, flurry);
    useFeature(c, limited);
    expect(c.resources[0]!.used).toBe(4);
    expect(isAvailable(c, limited)).toBe(false);
    shortRest(c);
    expect(isAvailable(c, limited)).toBe(true);
  });

  it("Zauber-Zeitaufwand wird erkannt", () => {
    expect(activationFromCastingTime("1 action")).toBe("action");
    expect(activationFromCastingTime("Bonus Action")).toBe("bonus");
    expect(activationFromCastingTime("Reaction, which you take when …")).toBe("reaction");
    expect(activationFromCastingTime("1 minute")).toBeNull();
  });
});

describe("Angriff mit Waffe X", () => {
  it("schlägt passende Fähigkeiten vor", () => {
    const { c, rapier, bow, sneak, archery, gwm } = rogue();
    expect(appliesToAttack(archery, rapier)).toBe(false);
    expect(appliesToAttack(archery, bow)).toBe(true);
    expect(appliesToAttack(gwm, rapier)).toBe(true);
    expect(appliesToAttack(gwm, bow)).toBe(false);

    const rapierOpts = attackOptions(c, rapier);
    expect(rapierOpts.before.map(o => o.feature.id)).toEqual([gwm.id]);
    expect(rapierOpts.onHit.map(o => o.feature.id)).toEqual([sneak.id]);

    const bowOpts = attackOptions(c, bow);
    expect(bowOpts.before).toHaveLength(1);
    expect(bowOpts.before[0]!.feature.id).toBe(archery.id);
    expect(bowOpts.before[0]!.automatic).toBe(true); // passiv
  });

  it("aktive Effekte gelten automatisch", () => {
    const c = normalizeCharacter({ classes: [{ name: "Barbar", level: 3, hitDie: 12 }] });
    const axe = newAttack({ name: "Axt", kind: "melee" });
    c.attacks = [axe];
    const rage = buildPreset("rage", "2024", "Spezies");
    c.features = [rage];
    expect(attackOptions(c, axe).before[0]!.automatic).toBe(false);
    startCombat(c);
    useFeature(c, rage);
    expect(c.combat.used.bonus).toBe(true);
    expect(economySpent(c, "bonus")).toBe(true);
    expect(attackOptions(c, axe).before[0]!.automatic).toBe(true);
  });
});

describe("Kampfablauf", () => {
  it("Runden, Aktionen und Effektdauer", () => {
    const { c, sneak, cunning } = rogue();
    startCombat(c);
    useFeature(c, sneak);
    useFeature(c, cunning);
    expect(isAvailable(c, sneak)).toBe(false);
    expect(c.combat.used.bonus).toBe(true);
    addEffect(c, { name: "Segen", featureId: null, remaining: 2, concentration: true, note: "" });

    expect(nextTurn(c)).toEqual([]);
    expect(c.combat.round).toBe(2);
    expect(c.combat.used.bonus).toBe(false);
    expect(isAvailable(c, sneak)).toBe(true); // einmal pro Zug
    expect(c.combat.effects[0]!.remaining).toBe(1);
    expect(nextTurn(c)).toEqual(["Segen"]);
    expect(c.combat.effects).toHaveLength(0);
  });

  it("nur eine Konzentration gleichzeitig", () => {
    const c = normalizeCharacter({});
    addEffect(c, { name: "Segen", featureId: null, remaining: 10, concentration: true, note: "" });
    const notes = addEffect(c, { name: "Hast", featureId: null, remaining: 10, concentration: true, note: "" });
    expect(notes[0]).toContain("Segen");
    expect(c.combat.effects.map(e => e.name)).toEqual(["Hast"]);
  });

  it("Kampfende und lange Rast räumen auf", () => {
    const c = normalizeCharacter({});
    startCombat(c);
    addEffect(c, { name: "Kurz", featureId: null, remaining: 3, concentration: false, note: "" });
    addEffect(c, { name: "Lang", featureId: null, remaining: 600, concentration: false, note: "" });
    endCombat(c);
    expect(c.combat.active).toBe(false);
    expect(c.combat.effects.map(e => e.name)).toEqual(["Lang"]);
    longRest(c, "2024");
    expect(c.combat.effects).toHaveLength(0);
  });

  it("alte Bögen mit Freitext-Merkmalen bleiben lesbar", () => {
    const c = normalizeCharacter({ features: "**Zweite Luft**" });
    expect(c.features).toEqual([]);
    expect(c.featureNotes).toBe("**Zweite Luft**");
  });
});

describe("Bausteine im Editor", () => {
  it("leitet die Art aus den Bausteinen ab", () => {
    const base = newFeature();
    expect(deriveEffectType(base)).toBe("utility");
    expect(deriveEffectType({ ...base, damage: "2d6" })).toBe("damage");
    expect(deriveEffectType({ ...base, damage: "1d10+5" }, true)).toBe("healing");
    expect(deriveEffectType({ ...base, acMod: { mode: "bonus", value: 2 } })).toBe("defense");
    expect(deriveEffectType({ ...base, rollMods: [newRollMod({ target: "check", mode: "advantage" })] })).toBe("buff");
  });

  it("Wilder Angreifer: Waffenschadenswürfel zweimal würfeln, einmal pro Zug bei Treffer", () => {
    const savage = buildPreset("savageAttacker", "2024", "Spezies");
    expect(savage.rollMods.some(isDamageTwice)).toBe(true);
    expect(savage.uses).toEqual({ max: 1, used: 0, reset: "turn" });
    expect(describeRollMods(savage.rollMods)).toBe("Schadenswürfel zweimal würfeln, Ergebnis wählen");
    // Die Art bleibt beim Ableiten erhalten (Buff)
    expect(deriveEffectType(savage)).toBe(savage.effectType);

    const { c, rapier } = rogue();
    c.features.push(savage);
    const opts = attackOptions(c, rapier);
    expect(opts.onHit.map(o => o.feature.name)).toContain("Wilder Angreifer");
    // Nur bei Waffenangriffen, nicht bei Zauberangriffen
    const spell = newAttack({ name: "Feuerpfeil", ability: "spell", damage: "1d10", kind: "ranged" });
    expect(appliesToAttack(savage, spell)).toBe(false);
  });
});

describe("Kategorien", () => {
  it("übernimmt die alte Einzelkategorie und startet neue Fähigkeiten ohne Kategorie", () => {
    expect(normalizeFeature({ name: "Alt", category: "Talent" }).categories).toEqual(["Talent"]);
    expect(normalizeFeature({ name: "Neu", categories: ["Klasse", " Barbar ", "Klasse", ""] }).categories).toEqual(["Klasse", "Barbar"]);
    expect(normalizeFeature({ name: "Ohne" }).categories).toEqual([]);
    expect(newFeature().categories).toEqual([]);
  });

  it("filtert nach jeder der Kategorien", () => {
    const f = newFeature({ name: "Kampfrausch", categories: ["Klasse", "Barbar"] });
    const filter = { search: "", tags: [], effectTypes: [] };
    expect(matchesFilter(f, { ...filter, categories: ["Barbar"] })).toBe(true);
    expect(matchesFilter(f, { ...filter, categories: ["Talent"] })).toBe(false);
    expect(matchesFilter(f, { ...filter, search: "barb", categories: [] })).toBe(true);
  });

  it("Vorlagen behalten ihre Kategorie, Spezies wird umbenannt", () => {
    expect(buildPreset("rage", "2024", "Spezies").categories).toEqual(["Klasse"]);
    expect(buildPreset("breath", "2014", "Volk").categories).toEqual(["Volk"]);
  });
});

describe("Zuschläge auf Schaden und Heilung", () => {
  function fighter() {
    return normalizeCharacter({
      abilities: { con: 14, wis: 8 },
      classes: [
        { name: "Kämpfer", level: 3, hitDie: 10 },
        { name: "Schurke", level: 2, hitDie: 8 },
      ],
    });
  }

  it("rechnet Attributsmodifikator, Stufe, Klassenstufe und Übungsbonus dazu", () => {
    const c = fighter();
    const f = newFeature({
      damage: "1d10",
      damageAdds: [
        newDamageAdd({ kind: "classLevel", className: "kämpfer" }),
        newDamageAdd({ kind: "ability", ability: "con" }),
        newDamageAdd({ kind: "ability", ability: "wis" }),
        newDamageAdd({ kind: "level" }),
        newDamageAdd({ kind: "proficiency" }),
      ],
    });
    // 3 (Kämpfer) + 2 (KON) − 1 (WEI) + 5 (Stufe) + 3 (Übung)
    expect(diceString(featureDamageExpr(c, f)!)).toBe("1d10+12");
    expect(describeDamageAdds(c, f.damageAdds.slice(0, 2))).toBe("Kämpferstufe +3, KON-Mod. +2");
  });

  it("geht auch ohne Würfel und ohne Klasse", () => {
    const c = fighter();
    expect(featureDamageExpr(c, newFeature({ damageAdds: [newDamageAdd({ kind: "level" })] }))).toEqual({ groups: [], bonus: 5 });
    expect(featureDamageExpr(c, newFeature())).toBeNull();
    expect(diceString(featureDamageExpr(c, newFeature({ damage: "1d6", damageAdds: [newDamageAdd({ kind: "classLevel", className: "Magier" })] }))!)).toBe("1d6");
  });

  it("Durchschnaufen heilt 1W10 + Kämpferstufe", () => {
    const f = normalizeFeature(JSON.parse(JSON.stringify(buildPreset("secondWind", "2024", "Spezies"))));
    expect(diceString(featureDamageExpr(fighter(), f)!)).toBe("1d10+3");
    expect(deriveEffectType(f, true)).toBe("healing");
  });

  it("normalisiert unbekannte Zuschläge", () => {
    const f = normalizeFeature({ damageAdds: [{ kind: "quatsch", ability: "xyz" }, "kaputt"] });
    expect(f.damageAdds).toEqual([newDamageAdd(), newDamageAdd()]);
  });
});
