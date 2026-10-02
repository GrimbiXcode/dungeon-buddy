<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, CircleUser, Users } from "@lucide/svelte";
  import Logo from "../components/Logo.svelte";
  import { get, patch } from "../lib/api";
  import { current } from "../lib/campaign.svelte";
  import { match, route } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { rulesetLabel } from "../lib/themes";
  import { CAMPAIGN_NAV } from "../lib/tools";
  import type { Campaign, User } from "../lib/types";
  import CampaignHome from "./CampaignHome.svelte";
  import CampaignSettings from "./CampaignSettings.svelte";
  import NotFoundInline from "../components/NotFoundInline.svelte";
  import Journal from "../tools/Journal.svelte";
  import Network from "../tools/Network.svelte";
  import Characters from "../tools/Characters.svelte";
  import CharacterSheet from "../tools/CharacterSheet.svelte";
  import Spellbook from "../tools/Spellbook.svelte";

  let { campaignId }: { campaignId: string } = $props();

  let error = $state<string | null>(null);
  const campaign = $derived(current.campaign?.id === campaignId ? current.campaign : null);
  const base = $derived(`/k/${campaignId}`);
  const sub = $derived(route.path.slice(base.length).replace(/^\//, ""));
  const section = $derived(sub.split("/")[0] ?? "");
  const characterParams = $derived(match("/k/:cid/charaktere/:characterId", route.path));

  onMount(() => {
    void load();
    return () => {
      current.campaign = null;
      delete document.body.dataset.theme;
    };
  });

  async function load() {
    try {
      current.campaign = await get<Campaign>(`/api/campaigns/${campaignId}`);
      rememberCampaign();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // Theme der Kampagne auf den ganzen Body anwenden (auch Dialoge)
  $effect(() => {
    if (campaign) document.body.dataset.theme = campaign.theme;
  });

  /** Für den Schnellzugriff auf Tools im Dashboard. */
  function rememberCampaign() {
    if (session.user?.settings.lastCampaignId === campaignId) return;
    patch<User>("/api/me", { settings: { lastCampaignId: campaignId } })
      .then(u => (session.user = u))
      .catch(() => {});
  }

  function isActive(slug: string) {
    return section === slug;
  }
</script>

{#if error}
  <div class="error-page">
    <div class="empty">
      <h3>Kampagne nicht verfügbar</h3>
      <p>{error}</p>
      <a class="btn btn-primary" href="/">Zur Übersicht</a>
    </div>
  </div>
{:else if !campaign}
  <div class="error-page"><div class="spinner"></div></div>
{:else}
  <div class="layout">
    <aside class="sidebar">
      <a href="/" class="brand"><Logo size={26} /></a>
      <a href="/" class="back small muted"><ArrowLeft size={14} /> Alle Kampagnen</a>
      <div class="campaign-name">
        <strong>{campaign.name}</strong>
        <span class="badge">{rulesetLabel(campaign.ruleset)}</span>
        {#if campaign.archivedAt}<span class="badge">Archiviert</span>{/if}
      </div>
      <nav aria-label="Werkzeuge">
        {#each CAMPAIGN_NAV as item (item.slug)}
          <a href="{base}{item.slug ? `/${item.slug}` : ''}" class:active={isActive(item.slug)} aria-current={isActive(item.slug) ? "page" : undefined}>
            <item.icon size={18} />
            <span>{item.name}</span>
          </a>
        {/each}
      </nav>
      <div class="sidebar-foot">
        <a href="/charaktere" class="profile small"><Users size={17} /> Meine Charaktere</a>
        <a href="/profil" class="profile small"><CircleUser size={17} /> {session.user?.displayName}</a>
      </div>
    </aside>

    <header class="mobile-top">
      <a href="/" class="btn btn-ghost btn-icon" aria-label="Alle Kampagnen"><ArrowLeft size={18} /></a>
      <strong class="truncate grow">{campaign.name}</strong>
      <a href="/profil" class="btn btn-ghost btn-icon" aria-label="Profil"><CircleUser size={18} /></a>
    </header>

    <main class="content">
      {#if section === ""}
        <CampaignHome {campaign} />
      {:else if section === "tagebuch"}
        <Journal {campaign} />
      {:else if section === "netzwerk"}
        <Network {campaign} />
      {:else if section === "charaktere" && characterParams}
        {#key characterParams.characterId}
          <CharacterSheet {campaign} characterId={characterParams.characterId} />
        {/key}
      {:else if section === "charaktere"}
        <Characters {campaign} />
      {:else if section === "zauberbuch"}
        <Spellbook {campaign} />
      {:else if section === "einstellungen"}
        <CampaignSettings {campaign} />
      {:else}
        <NotFoundInline />
      {/if}
    </main>

    <nav class="bottom-nav" aria-label="Werkzeuge">
      {#each CAMPAIGN_NAV.filter(i => i.slug !== "einstellungen") as item (item.slug)}
        <a href="{base}{item.slug ? `/${item.slug}` : ''}" class:active={isActive(item.slug)}>
          <item.icon size={20} />
          <span>{item.short}</span>
        </a>
      {/each}
    </nav>
  </div>
{/if}

<style>
  .error-page { min-height: 100dvh; display: grid; place-items: center; padding: 1rem; }
  .layout { min-height: 100dvh; }
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-width);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem 0.8rem;
    background: var(--surface);
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .brand:hover, .back:hover, .profile:hover { text-decoration: none; }
  .back { display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 0.4rem; }
  .campaign-name {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
  }
  .campaign-name strong { width: 100%; font-family: var(--font-display); }
  nav { display: flex; flex-direction: column; gap: 2px; margin-top: 0.4rem; }
  nav a {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    color: var(--muted);
    font-weight: 550;
  }
  nav a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
  nav a.active { background: var(--accent-soft); color: var(--accent-text); }
  .sidebar-foot { margin-top: auto; display: flex; flex-direction: column; }
  .profile { display: flex; align-items: center; gap: 0.5rem; color: var(--muted); padding: 0.5rem 0.7rem; }
  .content {
    margin-left: var(--sidebar-width);
    padding: 1.5rem clamp(1rem, 3vw, 2.2rem) 3rem;
    max-width: calc(1180px + var(--sidebar-width));
  }
  .mobile-top, .bottom-nav { display: none; }

  @media (max-width: 767px) {
    .sidebar { display: none; }
    .content { margin-left: 0; padding: 1rem 0.9rem calc(5.5rem + env(safe-area-inset-bottom)); }
    .mobile-top {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.5rem;
      background: color-mix(in oklab, var(--bg) 88%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      font-family: var(--font-display);
    }
    .bottom-nav {
      position: fixed;
      z-index: 30;
      inset: auto 0 0 0;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0;
      margin: 0;
      padding: 0.3rem 0.3rem calc(0.3rem + env(safe-area-inset-bottom));
      background: var(--surface);
      border-top: 1px solid var(--border);
      flex-direction: row;
    }
    .bottom-nav a {
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.35rem 0.1rem;
      font-size: 0.68rem;
      text-align: center;
    }
  }
</style>
