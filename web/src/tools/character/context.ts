import { getContext, setContext } from "svelte";
import type { Attack, CharacterData } from "../../lib/character";
import type { ArmorItem } from "../../lib/armor";
import type { AbilityPicks, Feature } from "../../lib/features";
import type { Ability, RollKind, SkillKey } from "../../lib/dnd";
import type { Ruleset } from "../../lib/types";

export type SheetContext = {
  readonly ruleset: Ruleset;
  readonly editing: boolean;
  readonly data: CharacterData;
  /** null, wenn der Bogen ausserhalb einer Kampagne geöffnet ist */
  readonly campaignId: string | null;
  readonly characterId: string;
  rollD20(
    title: string,
    modifier: number,
    kind: RollKind,
    opts?: {
      subtitle?: string;
      target?: number;
      damage?: DamageSpec;
      ability?: Ability | null;
      skill?: SkillKey | null;
      /** Ergebnis (wird bei erneutem Wurf im Dialog erneut gemeldet) */
      onResult?: (kept: number, total: number) => void;
    }
  ): void;
  rollDamage(title: string, dice: string, opts?: { damageType?: string; heal?: boolean; effect?: string; subtitle?: string }): void;
  /**
   * Fähigkeit einsetzen (Nutzung, Aktionsart, Effekt, ggf. Würfelwurf).
   * Ohne picks fragt der Bogen nach, wenn mehrere Attribute zur Wahl stehen.
   */
  useFeature(f: Feature, picks?: AbilityPicks): void;
  /** Angriffs-Assistent für eine Waffe öffnen (offhand: Zusatzangriff mit leichter Waffe) */
  openAttack(a: Attack, opts?: { offhand?: boolean }): void;
  /** Eintrag in die eigene Bibliothek kopieren */
  addToLibrary(kind: "feature", item: Feature): void;
  addToLibrary(kind: "attack", item: Attack): void;
  addToLibrary(kind: "armor", item: ArmorItem): void;
  /** Eintrag aus der Bibliothek in den Bogen übernehmen */
  openLibrary(kind: "feature" | "attack" | "armor"): void;
};

export type DamageSpec = { title: string; dice: string; damageType?: string };

const KEY = Symbol("character-sheet");

export function setSheet(ctx: SheetContext) {
  setContext(KEY, ctx);
}

export function sheet(): SheetContext {
  return getContext<SheetContext>(KEY);
}
