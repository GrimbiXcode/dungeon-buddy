#!/usr/bin/env node
/**
 * Erzeugt server/data/srd/spells-{2014,2024}.json aus einem Checkout von
 * https://github.com/5e-bits/5e-database (MIT). Die Zaubertexte selbst
 * stammen aus dem System Reference Document 5.1 bzw. 5.2 von Wizards of the
 * Coast und stehen unter CC-BY-4.0.
 *
 * Aufruf: node scripts/build-srd.mjs /pfad/zu/5e-database
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Aufruf: node scripts/build-srd.mjs /pfad/zu/5e-database");
  process.exit(1);
}
const outDir = path.resolve(import.meta.dirname, "../server/data/srd");
mkdirSync(outDir, { recursive: true });

const ABILITY = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const join = v => (Array.isArray(v) ? v.join("\n\n") : (v ?? "")).trim();

/** "increases by 1d6 for each slot level above 3" → "1d6" */
function upcastDice(text) {
  const m = /increases? by (\d+d\d+)(?: [a-z]+)? for (?:each|every) (?:spell )?slot level above/i.exec(text);
  return m ? m[1] : null;
}

function saveAbility(spell, description) {
  const fromDc = spell.dc?.dc_type?.index;
  if (fromDc) return fromDc;
  const m = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(description);
  return m ? ABILITY[m[1].toLowerCase()] : null;
}

function convert(spell) {
  const description = join(spell.description ?? spell.desc);
  const higherLevel = join(spell.higher_level);
  const damageList = Array.isArray(spell.damage) ? spell.damage : spell.damage ? [spell.damage] : [];
  const dmg = damageList[0];
  let damageDice = null;
  if (dmg?.damage_at_slot_level) {
    damageDice = dmg.damage_at_slot_level[String(spell.level)] ?? Object.values(dmg.damage_at_slot_level)[0];
  } else if (dmg?.damage_at_character_level) {
    damageDice = dmg.damage_at_character_level["1"] ?? Object.values(dmg.damage_at_character_level)[0];
  }
  let heal = spell.heal_at_slot_level?.[String(spell.level)] ?? null;
  if (!heal) {
    // SRD 5.2 hat keine strukturierten Heilwerte – aus dem Text lesen.
    const m = /regains? (?:a number of )?Hit Points equal to (\d+d\d+)( plus your spellcasting ability modifier)?/i.exec(description);
    if (m) heal = m[2] ? `${m[1]} + MOD` : m[1];
  }
  const components = (spell.components ?? []).join(", ");

  return {
    key: spell.index,
    name: spell.name,
    level: spell.level,
    school: spell.school?.name ?? "",
    castingTime: spell.casting_time ?? "",
    range: spell.range ?? "",
    components: spell.material ? `${components} (${spell.material})` : components,
    duration: spell.duration ?? "",
    concentration: Boolean(spell.concentration),
    ritual: Boolean(spell.ritual),
    classes: (spell.classes ?? []).map(c => c.name),
    description,
    higherLevel,
    attack: spell.attack_type ?? null,
    save: saveAbility(spell, description),
    damage: damageDice ? String(damageDice).replace(/\s*\+\s*MOD/i, "") : null,
    damageType: dmg?.damage_type?.name ?? null,
    heal: heal ? String(heal).replace(/\s*\+\s*MOD/i, "") : null,
    healAddsModifier: heal ? /\+\s*MOD/i.test(heal) : false,
    upcast: upcastDice(higherLevel) ?? upcastDice(description),
  };
}

for (const ruleset of ["2014", "2024"]) {
  const file = path.join(source, "src", ruleset, "en", "5e-SRD-Spells.json");
  const spells = JSON.parse(readFileSync(file, "utf8"))
    .map(convert)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const out = {
    ruleset,
    source: ruleset === "2014" ? "SRD 5.1" : "SRD 5.2",
    license:
      "This work includes material from the System Reference Document by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd and licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).",
    spells,
  };
  writeFileSync(path.join(outDir, `spells-${ruleset}.json`), JSON.stringify(out));
  console.log(`${ruleset}: ${spells.length} Zauber`);
}
