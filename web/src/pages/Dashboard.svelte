<script lang="ts">
  import { onMount } from "svelte";
  import { ArchiveRestore, ChevronDown, Plus, Trash2 } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import AppShell from "../components/AppShell.svelte";
  import CampaignForm from "../components/CampaignForm.svelte";
  import Modal from "../components/Modal.svelte";
  import { del, get, patch } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { navigate } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { CAMPAIGN_THEMES, rulesetLabel } from "../lib/themes";
  import { toast, toastError } from "../lib/toast.svelte";
  import { availableTools, toolHref, TOOLS, type ToolSlug } from "../lib/tools";
  import type { Campaign } from "../lib/types";

  let campaigns = $state<Campaign[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let showArchived = $state(false);
  /** Tool, für das eine Kampagne gewählt werden muss */
  let pickFor = $state<ToolSlug | null>(null);

  const active = $derived(campaigns.filter(c => !c.archivedAt));
  const archived = $derived(campaigns.filter(c => c.archivedAt));

  onMount(load);

  async function load() {
    try {
      campaigns = await get<Campaign[]>("/api/campaigns");
    } catch (e) {
      toastError(e);
    } finally {
      loading = false;
    }
  }

  function themeColor(key: string) {
    return CAMPAIGN_THEMES.find(t => t.key === key)?.color ?? "#a78bfa";
  }

  /** Tool öffnen: in der zuletzt genutzten Kampagne oder nach Auswahl. */
  function openTool(slug: ToolSlug) {
    const last = active.find(c => c.id === session.user?.settings.lastCampaignId);
    const target = last ?? (active.length === 1 ? active[0] : null);
    if (target) navigate(toolHref(target, slug));
    else if (active.length === 0) showForm = true;
    else pickFor = slug;
  }

  async function setArchived(c: Campaign, value: boolean) {
    try {
      const updated = await patch<Campaign>(`/api/campaigns/${c.id}`, { archived: value });
      Object.assign(c, updated);
      toast(value ? "Kampagne archiviert." : "Kampagne wiederhergestellt.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  async function remove(c: Campaign) {
    const ok = await confirmDialog(
      `„${c.name}“ mit allen Tagebucheinträgen, NPCs, Charakterbögen und Zaubern endgültig löschen?`,
      { title: "Kampagne löschen", confirmLabel: "Endgültig löschen" }
    );
    if (!ok) return;
    try {
      await del(`/api/campaigns/${c.id}`);
      campaigns = campaigns.filter(x => x.id !== c.id);
      toast("Kampagne gelöscht.", "success");
    } catch (e) {
      toastError(e);
    }
  }
</script>

<AppShell>
  <div class="page-header">
    <div>
      <h1>Willkommen, {session.user?.displayName}</h1>
      <p class="muted">Wähle ein Werkzeug oder eine Kampagne.</p>
    </div>
    <div class="row">
      <a class="btn" href="/charaktere"><Icon name="characters" size={16} /> Meine Charaktere</a>
      <a class="btn" href="/bibliothek"><Icon name="library" size={16} /> Bibliothek</a>
    </div>
  </div>

  <section>
    <h2 class="section-title">Werkzeuge</h2>
    <div class="tools">
      {#each availableTools() as tool (tool.slug)}
        <button class="card card-link tool" onclick={() => openTool(tool.slug)}>
          <span class="tool-icon"><Icon name={tool.icon} size={22} /></span>
          <span>
            <strong>{tool.name}</strong>
            <span class="muted small block">{tool.description}</span>
          </span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <div class="row-between section-head">
      <h2 class="section-title">Meine Kampagnen</h2>
      <button class="btn btn-primary" onclick={() => (showForm = true)}><Plus size={16} /> Neue Kampagne</button>
    </div>

    {#if loading}
      <div class="spinner"></div>
    {:else if active.length === 0}
      <div class="empty">
        <h3>Noch keine Kampagne</h3>
        <p>Lege die Kampagne an, in der du spielst. Jede Kampagne hat ihr eigenes Tagebuch, Netzwerk, Charakterbögen und Zauberbuch.</p>
        <button class="btn btn-primary" onclick={() => (showForm = true)}><Plus size={16} /> Erste Kampagne erstellen</button>
      </div>
    {:else}
      <div class="grid-auto">
        {#each active as c (c.id)}
          <a class="card card-link campaign" href="/k/{c.id}" data-theme={c.theme}>
            <span class="stripe" style="background:{themeColor(c.theme)}"></span>
            <div class="row-between">
              <h3 class="truncate">{c.name}</h3>
              <span class="badge">{rulesetLabel(c.ruleset)}</span>
            </div>
            {#if c.description}<p class="muted small desc">{c.description}</p>{/if}
            <div class="chip-row tiny muted counts">
              <span>{c.journalCount ?? 0} Einträge</span>·
              <span>{c.npcCount ?? 0} NPCs</span>·
              <span>{c.characterCount ?? 0} Charaktere</span>·
              <span>{c.spellCount ?? 0} Zauber</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}

    {#if archived.length}
      <button class="btn btn-ghost archived-toggle" onclick={() => (showArchived = !showArchived)} aria-expanded={showArchived}>
        <ChevronDown size={16} style="transform: rotate({showArchived ? 180 : 0}deg)" /> Archiviert ({archived.length})
      </button>
      {#if showArchived}
        <div class="stack">
          {#each archived as c (c.id)}
            <div class="card row-between archived">
              <div class="grow">
                <a href="/k/{c.id}"><strong>{c.name}</strong></a>
                <span class="badge">{rulesetLabel(c.ruleset)}</span>
              </div>
              <div class="row">
                <button class="btn btn-sm" onclick={() => setArchived(c, false)}><ArchiveRestore size={15} /> Wiederherstellen</button>
                <button class="btn btn-sm btn-danger" onclick={() => remove(c)}><Trash2 size={15} /> Löschen</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>
</AppShell>

{#if showForm}
  <CampaignForm
    onclose={() => (showForm = false)}
    onsaved={c => {
      showForm = false;
      navigate(`/k/${c.id}`);
    }}
  />
{/if}

{#if pickFor}
  {@const tool = TOOLS.find(t => t.slug === pickFor)!}
  <Modal title="{tool.name} – Kampagne wählen" size="sm" onclose={() => (pickFor = null)}>
    <div class="stack">
      {#each active as c (c.id)}
        <a class="card card-link pick" href={toolHref(c, tool.slug)} data-theme={c.theme}>
          <span class="dot" style="background:{themeColor(c.theme)}"></span>
          <strong class="grow truncate">{c.name}</strong>
          <span class="badge">{rulesetLabel(c.ruleset)}</span>
        </a>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  section { margin-bottom: 2.2rem; }
  .section-title { font-size: 1.1rem; margin-bottom: 0.8rem; }
  .section-head { margin-bottom: 0.8rem; }
  .section-head h2 { margin: 0; }
  .tools { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  .tool {
    display: flex;
    gap: 0.8rem;
    align-items: flex-start;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .tool-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .block { display: block; }
  .campaign { position: relative; overflow: hidden; padding-top: 1.2rem; }
  .campaign h3 { margin: 0; }
  .stripe { position: absolute; inset: 0 0 auto 0; height: 5px; }
  .desc {
    margin: 0.5rem 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .counts { margin-top: 0.8rem; gap: 0.3rem; }
  .archived-toggle { margin: 1rem 0 0.5rem; }
  .archived { padding: 0.7rem 0.9rem; }
  .pick { display: flex; align-items: center; gap: 0.6rem; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
</style>
