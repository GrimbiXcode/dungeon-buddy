import { getContext, setContext } from "svelte";
import type { CharacterData } from "../../lib/character";
import type { RollKind } from "../../lib/dnd";
import type { Ruleset } from "../../lib/types";

export type SheetContext = {
  readonly ruleset: Ruleset;
  readonly editing: boolean;
  readonly data: CharacterData;
  readonly campaignId: string;
  readonly characterId: string;
  rollD20(title: string, modifier: number, kind: RollKind, opts?: { subtitle?: string; target?: number; damage?: DamageSpec }): void;
  rollDamage(title: string, dice: string, opts?: { damageType?: string; heal?: boolean; subtitle?: string }): void;
};

export type DamageSpec = { title: string; dice: string; damageType?: string };

const KEY = Symbol("character-sheet");

export function setSheet(ctx: SheetContext) {
  setContext(KEY, ctx);
}

export function sheet(): SheetContext {
  return getContext<SheetContext>(KEY);
}
