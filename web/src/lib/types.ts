export type Ruleset = "2014" | "2024";
export type DiceMode = "digital" | "physical";
export type ColorMode = "system" | "light" | "dark";

export type UserSettings = {
  colorMode?: ColorMode;
  /** Anzeige von Strecken/Gewichten; intern bleibt alles in ft/lb */
  units?: "imperial" | "metric";
  /** Einheitenrechner am Bildschirmrand (Standard: an) */
  unitCalculator?: boolean;
  diceMode?: DiceMode;
  lastCampaignId?: string | null;
};

export type User = {
  id: string;
  telegramId: string;
  displayName: string;
  settings: UserSettings;
  createdAt: string;
};

export type AuthInfo = {
  appName: string;
  botConfigured: boolean;
  botUsername: string | null;
  devLogin: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  theme: string;
  ruleset: Ruleset;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  journalCount?: number;
  npcCount?: number;
  characterCount?: number;
  spellCount?: number;
};

export type JournalEntry = {
  id: string;
  campaignId: string;
  sessionNumber: number | null;
  sessionDate: string | null;
  ingameDay: number | null;
  ingameDate: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type NpcStatus = "alive" | "dead" | "missing" | "unknown";

export type Npc = {
  id: string;
  campaignId: string;
  name: string;
  role: string;
  faction: string;
  location: string;
  status: NpcStatus;
  /** -2 feindlich … +2 verbündet */
  attitude: number;
  /** Beziehung zum eigenen Charakter / zur Gruppe in Worten */
  relation: string;
  description: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type NpcRelation = {
  id: string;
  campaignId: string;
  fromNpcId: string;
  toNpcId: string;
  label: string;
  attitude: number;
  notes: string;
  createdAt: string;
};

export type CharacterRecord = {
  id: string;
  campaignId: string;
  name: string;
  data: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

/** Zauberdaten, wie sie im SRD-Export und im Zauberbuch vorliegen. */
export type SpellData = {
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description: string;
  higherLevel: string;
  attack: "melee" | "ranged" | null;
  save: string | null;
  damage: string | null;
  damageType: string | null;
  heal: string | null;
  healAddsModifier: boolean;
  upcast: string | null;
};

export type SrdSpell = SpellData & { key: string; name: string; level: number };

export type SrdSpellList = {
  ruleset: Ruleset;
  source: string;
  license: string;
  spells: SrdSpell[];
};

export type Spell = {
  id: string;
  campaignId: string;
  characterId: string | null;
  srdKey: string | null;
  name: string;
  level: number;
  data: Partial<SpellData>;
  prepared: boolean;
  alwaysPrepared: boolean;
  favorite: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
