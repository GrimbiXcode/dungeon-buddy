import { BookOpen, LayoutDashboard, ScrollText, Settings, Users, Wand } from "@lucide/svelte";

export const TOOLS = [
  {
    slug: "tagebuch",
    name: "Tagebuch",
    icon: ScrollText,
    description: "Einträge pro Session und Tag im Spiel.",
  },
  {
    slug: "netzwerk",
    name: "Soziales Netzwerk",
    short: "Netzwerk",
    icon: Users,
    description: "NPCs, ihre Beziehungen zu dir und untereinander.",
  },
  {
    slug: "charaktere",
    name: "Charakterbogen",
    short: "Charakter",
    icon: BookOpen,
    description: "Digital oder als Würfelhilfe für echte Würfel.",
  },
  {
    slug: "zauberbuch",
    name: "Zauberbuch",
    short: "Zauber",
    icon: Wand,
    description: "Zauber aus dem SRD übernehmen, vorbereiten, würfeln.",
  },
] as const;

export type ToolSlug = (typeof TOOLS)[number]["slug"];

export const CAMPAIGN_NAV = [
  { slug: "", name: "Übersicht", short: "Übersicht", icon: LayoutDashboard },
  ...TOOLS.map(t => ({ slug: t.slug, name: t.name, short: "short" in t ? t.short : t.name, icon: t.icon })),
  { slug: "einstellungen", name: "Kampagne bearbeiten", short: "Kampagne", icon: Settings },
];
