import {
  Award,
  BookOpen,
  CircleUser,
  Crosshair,
  Dices,
  Flag,
  Footprints,
  Heart,
  Hourglass,
  Images,
  LayoutDashboard,
  LibraryBig,
  MapPin,
  Moon,
  Pencil,
  Play,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Sunrise,
  Swords,
  Timer,
  UserRound,
  Users,
  Wand,
  Zap,
} from "@lucide/svelte";
import type { GameIconKey } from "./gameIcons";

/**
 * Thematische Icons nach Bedeutung: Lucide für Hell/Dunkel, game-icons.net im Adventurer-Modus.
 * Steuer-Icons (Plus, X, Pfeile, Löschen …) bleiben direkt Lucide.
 */
export const ICONS = {
  // Navigation
  overview: { lucide: LayoutDashboard, game: "castle" },
  journal: { lucide: ScrollText, game: "book-cover" },
  network: { lucide: Users, game: "three-friends" },
  characterSheet: { lucide: BookOpen, game: "scroll-unfurled" },
  spellbook: { lucide: Wand, game: "spell-book" },
  attachments: { lucide: Images, game: "swap-bag" },
  campaignSettings: { lucide: Settings, game: "anvil" },
  characters: { lucide: Users, game: "visored-helm" },
  library: { lucide: LibraryBig, game: "bookshelf" },
  profile: { lucide: CircleUser, game: "hood" },
  admin: { lucide: ShieldCheck, game: "crown" },
  // Charakter
  hp: { lucide: Heart, game: "heart-bottle" },
  armor: { lucide: Shield, game: "checked-shield" },
  initiative: { lucide: Zap, game: "lightning-helix" },
  speed: { lucide: Footprints, game: "boot-prints" },
  proficiency: { lucide: Award, game: "biceps" },
  inspiration: { lucide: Sparkles, game: "sparkles" },
  death: { lucide: Skull, game: "skull-crossed-bones" },
  // Kampf & Zauber
  attack: { lucide: Swords, game: "crossed-swords" },
  roll: { lucide: Dices, game: "dice-twenty-faces-twenty" },
  hit: { lucide: Crosshair, game: "archery-target" },
  cast: { lucide: Sparkles, game: "magic-swirl" },
  round: { lucide: Timer, game: "gong" },
  nextTurn: { lucide: Hourglass, game: "sands-of-time" },
  endCombat: { lucide: Flag, game: "flying-flag" },
  shortRest: { lucide: Sunrise, game: "campfire" },
  longRest: { lucide: Moon, game: "camping-tent" },
  play: { lucide: Play, game: "rolling-dices" },
  // Netzwerk & Werkzeuge
  faction: { lucide: Flag, game: "knight-banner" },
  location: { lucide: MapPin, game: "position-marker" },
  relationship: { lucide: UserRound, game: "shaking-hands" },
  edit: { lucide: Pencil, game: "quill" },
  search: { lucide: Search, game: "spyglass" },
} as const satisfies Record<string, { lucide: typeof Heart; game: GameIconKey }>;

export type IconName = keyof typeof ICONS;
