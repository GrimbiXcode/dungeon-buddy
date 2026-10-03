<script lang="ts">
  import { Archive, ArchiveRestore, Trash2 } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import CampaignForm from "../components/CampaignForm.svelte";
  import Markdown from "../components/Markdown.svelte";
  import { del, patch } from "../lib/api";
  import { current } from "../lib/campaign.svelte";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { navigate } from "../lib/router.svelte";
  import { CAMPAIGN_THEMES, RULESETS } from "../lib/themes";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign } from "../lib/types";

  let { campaign }: { campaign: Campaign } = $props();
  let editing = $state(false);

  const theme = $derived(CAMPAIGN_THEMES.find(t => t.key === campaign.theme));

  async function setArchived(value: boolean) {
    try {
      current.campaign = await patch<Campaign>(`/api/campaigns/${campaign.id}`, { archived: value });
      toast(value ? "Kampagne archiviert. Du findest sie in der Übersicht unter „Archiviert“." : "Kampagne wiederhergestellt.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  async function remove() {
    const ok = await confirmDialog(
      `„${campaign.name}“ mit allen Tagebucheinträgen, NPCs, Charakterbögen und Zaubern endgültig löschen? Das kann nicht rückgängig gemacht werden.`,
      { title: "Kampagne löschen", confirmLabel: "Endgültig löschen" }
    );
    if (!ok) return;
    try {
      await del(`/api/campaigns/${campaign.id}`);
      toast("Kampagne gelöscht.", "success");
      navigate("/", { replace: true });
    } catch (e) {
      toastError(e);
    }
  }
</script>

<div class="page-header">
  <div>
    <h1>Kampagne bearbeiten</h1>
    <p class="muted">Name, Beschreibung, Regelversion und Farbschema.</p>
  </div>
  <button class="btn btn-primary" onclick={() => (editing = true)}><Icon name="edit" size={16} /> Bearbeiten</button>
</div>

<div class="stack narrow">
  <section class="card">
    <dl>
      <dt>Name</dt>
      <dd>{campaign.name}</dd>
      <dt>Regelversion</dt>
      <dd>{RULESETS.find(r => r.key === campaign.ruleset)?.name}</dd>
      <dt>Farbschema</dt>
      <dd class="row"><span class="swatch" style="background:{theme?.color}"></span>{theme?.name}</dd>
      <dt>Beschreibung</dt>
      <dd>
        {#if campaign.description}<Markdown source={campaign.description} />{:else}<span class="faint">–</span>{/if}
      </dd>
    </dl>
  </section>

  <section class="card">
    <h2>Archivieren</h2>
    <p class="small muted">
      Archivierte Kampagnen verschwinden aus der Übersicht, bleiben aber mit allen Daten erhalten und lassen sich
      jederzeit wiederherstellen.
    </p>
    {#if campaign.archivedAt}
      <button class="btn" onclick={() => setArchived(false)}><ArchiveRestore size={16} /> Wiederherstellen</button>
    {:else}
      <button class="btn" onclick={() => setArchived(true)}><Archive size={16} /> Archivieren</button>
    {/if}
  </section>

  <section class="card danger">
    <h2>Löschen</h2>
    <p class="small muted">Löscht die Kampagne mit allen Tool-Daten endgültig.</p>
    <button class="btn btn-danger" onclick={remove}><Trash2 size={16} /> Kampagne löschen</button>
  </section>
</div>

{#if editing}
  <CampaignForm
    {campaign}
    onclose={() => (editing = false)}
    onsaved={c => {
      current.campaign = c;
      editing = false;
      toast("Gespeichert.", "success");
    }}
  />
{/if}

<style>
  .narrow { max-width: 720px; }
  h2 { font-size: 1.05rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1.2rem; margin: 0; }
  dt { color: var(--muted); font-size: 0.85rem; padding-top: 0.1rem; }
  dd { margin: 0; }
  .swatch { width: 16px; height: 16px; border-radius: 50%; display: inline-block; }
  .danger { border-color: color-mix(in oklab, var(--danger) 35%, var(--border)); }
  @media (max-width: 480px) {
    dl { grid-template-columns: 1fr; gap: 0.15rem; }
    dd { margin-bottom: 0.6rem; }
  }
</style>
