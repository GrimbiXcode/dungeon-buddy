/**
 * Würfelausdrücke wie "2d6+3", "1d8 + 1d6 - 1" oder "d20".
 */
export type DiceGroup = { count: number; sides: number };
export type DiceExpr = { groups: DiceGroup[]; bonus: number };

export function parseDice(input: string | null | undefined): DiceExpr | null {
  if (!input) return null;
  const clean = input.replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();
  if (!clean) return null;
  const terms = clean.match(/[+-]?[^+-]+/g);
  if (!terms) return null;
  const groups: DiceGroup[] = [];
  let bonus = 0;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const m = /^(\d*)[dw](\d+)$/.exec(body);
    if (m) {
      const count = m[1] ? Number(m[1]) : 1;
      const sides = Number(m[2]);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000 || sign < 0) return null;
      const existing = groups.find(g => g.sides === sides);
      if (existing) existing.count += count;
      else groups.push({ count, sides });
    } else if (/^\d+$/.test(body)) {
      bonus += sign * Number(body);
    } else {
      return null;
    }
  }
  return { groups, bonus };
}

export function formatDice(expr: DiceExpr): string {
  const dice = expr.groups.map(g => `${g.count}W${g.sides}`).join(" + ");
  if (!expr.bonus) return dice || "0";
  if (!dice) return String(expr.bonus);
  return `${dice} ${expr.bonus < 0 ? "−" : "+"} ${Math.abs(expr.bonus)}`;
}

/** Kritischer Treffer: Anzahl der Würfel verdoppeln, Bonus bleibt. */
/** Kompakte, wieder einlesbare Form, z. B. "2d6+3". */
export function diceString(expr: DiceExpr): string {
  const dice = expr.groups.map(g => `${g.count}d${g.sides}`).join("+");
  if (!expr.bonus) return dice || "0";
  return `${dice}${expr.bonus > 0 ? "+" : "-"}${Math.abs(expr.bonus)}`;
}

export function critExpr(expr: DiceExpr): DiceExpr {
  return { groups: expr.groups.map(g => ({ ...g, count: g.count * 2 })), bonus: expr.bonus };
}

/** Würfel multiplizieren (z. B. Zaubertrick-Skalierung). */
export function scaleExpr(expr: DiceExpr, factor: number): DiceExpr {
  return { groups: expr.groups.map(g => ({ ...g, count: g.count * factor })), bonus: expr.bonus };
}

/** Zwei Ausdrücke addieren (z. B. Hochstufen: 8d6 + 2×1d6). */
export function addExpr(a: DiceExpr, b: DiceExpr): DiceExpr {
  const groups = a.groups.map(g => ({ ...g }));
  for (const g of b.groups) {
    const existing = groups.find(x => x.sides === g.sides);
    if (existing) existing.count += g.count;
    else groups.push({ ...g });
  }
  return { groups, bonus: a.bonus + b.bonus };
}

export function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  // Gleichverteilt ohne Modulo-Verzerrung
  const limit = Math.floor(0xffffffff / sides) * sides;
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return (buf[0]! % sides) + 1;
}

export function rollGroup(group: DiceGroup): number[] {
  return Array.from({ length: group.count }, () => rollDie(group.sides));
}

export function groupRange(group: DiceGroup) {
  return { min: group.count, max: group.count * group.sides };
}
