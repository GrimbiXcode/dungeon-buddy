export type Ruleset = "2014" | "2024";
export type DiceMode = "digital" | "physical";
export type ColorMode = "system" | "light" | "dark" | "adventurer";

export type UserSettings = {
  colorMode?: ColorMode;
  /** Anzeige von Strecken/Gewichten; intern bleibt alles in ft/lb */
  units?: "imperial" | "metric";
  /** Einheitenrechner am Bildschirmrand (Standard: an) */
  unitCalculator?: boolean;
  diceMode?: DiceMode;
  lastCampaignId?: string | null;
};

export type BlockReason = "abuse" | "spam" | "terms" | "automated" | "other";

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  abuse: "Missbrauch",
  spam: "Spam",
  terms: "Verstoss gegen die Nutzungsregeln",
  automated: "Automatisierte Nutzung",
  other: "Anderer Grund",
};

export type User = {
  id: string;
  telegramId: string;
  displayName: string;
  settings: UserSettings;
  role: "user" | "admin";
  blockedAt: string | null;
  blockedReason: BlockReason | null;
  createdAt: string;
};

export type UnblockStatus = "pending" | "approved" | "rejected";

export type UnblockRequest = {
  id: string;
  status: UnblockStatus;
  reviewNote: string;
  reviewedAt: string | null;
  createdAt: string;
};

export type AuthInfo = {
  appName: string;
  botConfigured: boolean;
  botUsername: string | null;
  devLogin: boolean;
  /** Anhänge verfügbar (S3-Speicher konfiguriert) */
  attachments: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  theme: string;
  ruleset: Ruleset;
  archivedAt: string | null;
  /** Aktiver Charakter: „Charakterbogen“ öffnet direkt seinen Bogen */
  activeCharacterId: string | null;
  createdAt: string;
  updatedAt: string;
  journalCount?: number;
  npcCount?: number;
  characterCount?: number;
  spellCount?: number;
  attachmentCount?: number;
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
  /** Anhang mit dem Bild des NPCs */
  imageId: string | null;
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

export type CharacterStatus = "active" | "dead" | "retired";

/** Zuordnung eines Charakters zu einer Kampagne (in der Charakterliste). */
export type CharacterCampaignLink = {
  campaignId: string;
  name: string;
  theme: string;
  ruleset: Ruleset;
  archived: boolean;
  active: boolean;
  joinedAt: string;
  leftAt: string | null;
  leftReason: string;
};

export type CharacterRecord = {
  id: string;
  userId: string;
  name: string;
  data: Record<string, unknown>;
  revision: number;
  ruleset: Ruleset;
  status: CharacterStatus;
  forkedFrom: string | null;
  forkedFromName?: string | null;
  /** Anhang mit dem Porträt */
  portraitId: string | null;
  campaigns?: CharacterCampaignLink[];
  createdAt: string;
  updatedAt: string;
};

/** Charakter aus Sicht einer Kampagne (mit Zuordnungsdaten). */
export type CampaignCharacter = CharacterRecord & {
  active: boolean;
  joinedAt: string;
  leftAt: string | null;
  leftReason: string;
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
  /** RK-Wirkung, solange der Zauber wirkt (Magierrüstung, Schild …) */
  acMod?: { mode: "bonus" | "base" | "min"; value: number } | null;
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
  campaignId: string | null;
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

export type AttachmentCategory = "portrait" | "map" | "notes" | "table" | "scene" | "rules" | "adventure" | "other";

export type Attachment = {
  id: string;
  campaignId: string | null;
  characterId: string | null;
  kind: "image" | "pdf";
  category: AttachmentCategory;
  title: string;
  description: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  createdAt: string;
  updatedAt: string;
};
