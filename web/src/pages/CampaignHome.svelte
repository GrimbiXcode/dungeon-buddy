<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowRight } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import Markdown from "../components/Markdown.svelte";
  import { campaignApi, get } from "../lib/api";
  import { formatDate } from "../lib/format";
  import { rulesetLabel } from "../lib/themes";
  import { availableTools, toolHref } from "../lib/tools";
  import type { Campaign, CampaignCharacter, JournalEntry } from "../lib/types";

  let { campaign }: { campaign: Campaign } = $props();

  let entries = $state<JournalEntry[]>([]);
  let characters = $state<CampaignCharacter[]>([]);
  let counts = $state<Record<string, number>>({});

  onMount(async () => {
    const [j, c, list] = await Promise.all([
      get<JournalEntry[]>(campaignApi(campaign.id, "journal")).catch(() => []),
      get<CampaignCharacter[]>(campaignApi(campaign.id, "characters")).then(list => list.filter(c => c.active)).catch(() => []),
      get<Campaign[]>("/api/campaigns").catch(() => []),
    ]);
    entries = j.slice(0, 3);
    characters = c;
    const me = list.find(x => x.id === campaign.id);
    counts = {
      tagebuch: me?.journalCount ?? 0,
      netzwerk: me?.npcCount ?? 0,
      charaktere: me?.characterCount ?? 0,
      zauberbuch: me?.spellCount ?? 0,
      anhaenge: me?.attachmentCount ?? 0,
    };
  });

  const countLabel: Record<string, string> = {
    tagebuch: "Einträge",
    netzwerk: "NPCs",
    charaktere: "Charaktere",
    zauberbuch: "Zauber",
    anhaenge: "Anhänge",
  };
</script>

<div class="page-header">
  <div>
    <span class="badge badge-accent">{rulesetLabel(campaign.ruleset)}</span>
    <h1 class="title">{campaign.name}</h1>
  </div>
</div>

{#if campaign.description}
  <div class="card description"><Markdown source={campaign.description} /></div>
{/if}

<div class="tools">
  {#each availableTools() as tool (tool.slug)}
    <a class="card card-link tool" href={toolHref(campaign, tool.slug)}>
      <span class="icon"><Icon name={tool.icon} size={22} /></span>
      <span class="grow">
        <strong>{tool.name}</strong>
        <span class="block small muted">{counts[tool.slug] ?? "–"} {countLabel[tool.slug]}</span>
      </span>
      <ArrowRight size={16} class="faint" />
    </a>
  {/each}
</div>

<div class="columns">
  <section>
    <div class="row-between"><h2>Zuletzt im Tagebuch</h2><a class="small" href="/k/{campaign.id}/tagebuch">Alle</a></div>
    {#if entries.length === 0}
      <p class="muted small">Noch keine Einträge.</p>
    {:else}
      <div class="stack">
        {#each entries as e (e.id)}
          <a class="card card-link entry" href="/k/{campaign.id}/tagebuch">
            <div class="chip-row tiny muted">
              {#if e.sessionNumber != null}<span class="badge">Session {e.sessionNumber}</span>{/if}
              {#if e.ingameDay != null}<span class="badge">Tag {e.ingameDay}</span>{/if}
              {#if e.sessionDate}<span>{formatDate(e.sessionDate)}</span>{/if}
            </div>
            <strong>{e.title || "Ohne Titel"}</strong>
            <p class="small muted excerpt">{e.content.slice(0, 180)}</p>
          </a>
        {/each}
      </div>
    {/if}
  </section>
  <section>
    <div class="row-between"><h2>Charaktere</h2><a class="small" href="/k/{campaign.id}/charaktere">Alle</a></div>
    {#if characters.length === 0}
      <p class="muted small">Noch kein Charakterbogen.</p>
    {:else}
      <div class="stack">
        {#each characters as c (c.id)}
          <a class="card card-link" href="/k/{campaign.id}/charaktere/{c.id}"><strong>{c.name}</strong></a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .title { margin-top: 0.4rem; }
  .description { margin-bottom: 1.2rem; }
  .tools { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-bottom: 2rem; }
  .tool { display: flex; align-items: center; gap: 0.8rem; }
  .icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-text); flex: none; }
  .block { display: block; }
  .columns { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  h2 { font-size: 1.05rem; margin: 0 0 0.6rem; }
  .entry strong { display: block; margin-top: 0.3rem; }
  .excerpt { margin: 0.2rem 0 0; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
