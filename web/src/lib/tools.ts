import type { IconName } from "./icons";
import { session } from "./session.svelte";

export const TOOLS = [
  {
    slug: "tagebuch",
    name: "Tagebuch",
    icon: "journal" as IconName,
    description: "Einträge pro Session und Tag im Spiel.",
  },
  {
    slug: "netzwerk",
    name: "Soziales Netzwerk",
    short: "Netzwerk",
    icon: "network" as IconName,
    description: "NPCs, ihre Beziehungen zu dir und untereinander.",
  },
  {
    slug: "charaktere",
    name: "Charakterbogen",
    short: "Charakter",
    icon: "characterSheet" as IconName,
    description: "Digital oder als Würfelhilfe für echte Würfel.",
  },
  {
    slug: "zauberbuch",
    name: "Zauberbuch",
    short: "Zauber",
    icon: "spellbook" as IconName,
    description: "Zauber aus dem SRD übernehmen, vorbereiten, würfeln.",
  },
  {
    slug: "anhaenge",
    name: "Anhänge",
    icon: "attachments" as IconName,
    description: "Karten, Szenenbilder, Fotos und PDFs zur Kampagne.",
  },
] as const;

export type ToolSlug = (typeof TOOLS)[number]["slug"];

/** Tools dieser Instanz: Anhänge gibt es nur mit S3-Speicher auf dem Server. */
export function availableTools() {
  return TOOLS.filter(t => t.slug !== "anhaenge" || session.info?.attachments);
}

/** Link auf ein Tool; „Charakterbogen“ führt direkt zum aktiven Charakter. */
export function toolHref(campaign: { id: string; activeCharacterId?: string | null }, slug: string) {
  if (slug === "charaktere" && campaign.activeCharacterId) return `/k/${campaign.id}/charaktere/${campaign.activeCharacterId}`;
  return `/k/${campaign.id}${slug ? `/${slug}` : ""}`;
}

export function campaignNav() {
  return [
    { slug: "", name: "Übersicht", short: "Übersicht", icon: "overview" as IconName },
    ...availableTools().map(t => ({ slug: t.slug, name: t.name, short: "short" in t ? t.short : t.name, icon: t.icon })),
    { slug: "einstellungen", name: "Kampagne bearbeiten", short: "Kampagne", icon: "campaignSettings" as IconName },
  ];
}
