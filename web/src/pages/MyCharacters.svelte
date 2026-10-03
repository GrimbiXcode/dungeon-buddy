<script lang="ts">
  import { onMount } from "svelte";
  import { Flag, GitFork, Plus, Trash2 } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import AppShell from "../components/AppShell.svelte";
  import CharacterCard from "../components/CharacterCard.svelte";
  import Modal from "../components/Modal.svelte";
  import NewCharacterModal from "../components/NewCharacterModal.svelte";
  import { del, get, patch, post } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { navigate } from "../lib/router.svelte";
  import { CAMPAIGN_THEMES, rulesetLabel } from "../lib/themes";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign, CharacterRecord, CharacterStatus } from "../lib/types";

  type View = "alive" | "dead" | "all";

  let characters = $state<CharacterRecord[]>([]);
  let campaigns = $state<Campaign[]>([]);
  let loading = $state(true);
  let view = $state<View>("alive");
  let search = $state("");
  let creating = $state(false);
  let managing = $state<CharacterRecord | null>(null);
  let forking = $state<CharacterRecord | null>(null);
  let forkName = $state("");
  let forkCampaigns = $state<string[]>([]);
  let forkReplace = $state(true);

  const STATUS_LABEL: Record<CharacterStatus, string> = { active: "Aktiv", dead: "Verstorben", retired: "Im Ruhestand" };

  const shown = $derived(
    characters.filter(c => {
      if (view === "alive" && c.status === "dead") return false;
      if (view === "dead" && c.status !== "dead") return false;
      const q = search.trim().toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || (c.campaigns ?? []).some(x => x.name.toLowerCase().includes(q));
    })
  );
  const counts = $derived({
    alive: characters.filter(c => c.status !== "dead").length,
    dead: characters.filter(c => c.status === "dead").length,
  });

  onMount(load);

  async function load() {
    try {
      [characters, campaigns] = await Promise.all([get<CharacterRecord[]>("/api/characters"), get<Campaign[]>("/api/campaigns")]);
    } catch (e) {
      toastError(e);
    } finally {
      loading = false;
    }
  }

  const themeColor = (key: string) => CAMPAIGN_THEMES.find(t => t.key === key)?.color ?? "#a78bfa";

  async function setStatus(c: CharacterRecord, status: CharacterStatus) {
    try {
      await patch(`/api/characters/${c.id}`, { status });
      c.status = status;
      const stillPlaying = (c.campaigns ?? []).filter(x => x.active);
      if (status === "dead" && stillPlaying.length) {
        toast(`${c.name} spielt noch in ${stillPlaying.map(x => x.name).join(", ")} – dort kannst du ihn austauschen.`, "info", 6000);
      }
    } catch (e) {
      toastError(e);
    }
  }

  async function remove(c: CharacterRecord) {
    const n = c.campaigns?.length ?? 0;
    const ok = await confirmDialog(
      `${c.name} endgültig löschen? Der Bogen und alle seine Zauber verschwinden${n ? ` – auch aus ${n} Kampagne${n === 1 ? "" : "n"}` : ""}. Kopien bleiben erhalten.`,
      { title: "Charakter löschen", confirmLabel: "Endgültig löschen" }
    );
    if (!ok) return;
    try {
      await del(`/api/characters/${c.id}`);
      characters = characters.filter(x => x.id !== c.id);
      toast("Charakter gelöscht.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  // ── Kampagnen-Zuweisung ─────────────────────────────────────────────────
  function linkOf(c: CharacterRecord, campaignId: string) {
    return c.campaigns?.find(x => x.campaignId === campaignId);
  }

  async function setAssignment(c: CharacterRecord, campaign: Campaign, state: "assign" | "leave" | "remove") {
    try {
      const url = `/api/campaigns/${campaign.id}/characters`;
      if (state === "assign") await post(url, { characterId: c.id });
      else if (state === "leave") await patch(`${url}/${c.id}`, { active: false, leftReason: "Ausgeschieden" });
      else await del(`${url}/${c.id}`);
      const fresh = await get<CharacterRecord>(`/api/characters/${c.id}`);
      const i = characters.findIndex(x => x.id === c.id);
      if (i >= 0) characters[i] = fresh;
      if (managing?.id === c.id) managing = fresh;
    } catch (e) {
      toastError(e);
    }
  }

  // ── Kopie (Fork) ────────────────────────────────────────────────────────
  function openFork(c: CharacterRecord) {
    forking = c;
    forkName = `${c.name} (Kopie)`;
    forkCampaigns = [];
    forkReplace = true;
  }

  async function fork() {
    const original = forking;
    if (!original) return;
    try {
      const copy = await post<CharacterRecord>(`/api/characters/${original.id}/fork`, { name: forkName });
      for (const campaignId of forkCampaigns) {
        const link = linkOf(original, campaignId);
        if (forkReplace && link?.active) {
          await post(`/api/campaigns/${campaignId}/characters/${original.id}/replace`, {
            replacementId: copy.id,
            reason: "Durch Kopie ersetzt",
          });
        } else {
          await post(`/api/campaigns/${campaignId}/characters`, { characterId: copy.id });
        }
      }
      forking = null;
      toast(`Kopie „${copy.name}“ erstellt. Änderungen daran wirken nur auf die Kopie.`, "success", 5000);
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  const selectableCampaigns = $derived(campaigns.filter(c => !c.archivedAt));
</script>

<AppShell>
  <div class="page-header">
    <div>
      <h1>Meine Charaktere</h1>
      <p class="muted">
        Deine Charaktere über alle Kampagnen hinweg. Ein Charakter kann in mehreren Kampagnen spielen – Stufe, Werte und
        Zauber gelten überall. Für einen unabhängigen Ableger erstellst du eine Kopie.
      </p>
    </div>
    <button class="btn btn-primary" onclick={() => (creating = true)}><Plus size={16} /> Neuer Charakter</button>
  </div>

  {#if loading}
    <div class="spinner"></div>
  {:else if characters.length === 0}
    <div class="empty">
      <h3>Noch keine Charaktere</h3>
      <p>Erstelle deinen ersten Charakter und weise ihn danach einer oder mehreren Kampagnen zu.</p>
      <button class="btn btn-primary" onclick={() => (creating = true)}><Plus size={16} /> Charakter erstellen</button>
    </div>
  {:else}
    <div class="toolbar">
      <div class="search">
        <Icon name="search" size={15} />
        <input class="input" placeholder="Name oder Kampagne …" bind:value={search} aria-label="Charaktere durchsuchen" />
      </div>
      <div class="segmented" role="group" aria-label="Filter">
        <button aria-pressed={view === "alive"} onclick={() => (view = "alive")}>Lebend ({counts.alive})</button>
        <button aria-pressed={view === "dead"} onclick={() => (view = "dead")}>Verstorben ({counts.dead})</button>
        <button aria-pressed={view === "all"} onclick={() => (view = "all")}>Alle</button>
      </div>
    </div>

    {#if shown.length === 0}
      <p class="muted">Keine Charaktere in dieser Ansicht.</p>
    {/if}
    <div class="grid-auto">
      {#each shown as c (c.id)}
        <CharacterCard character={c} href="/charaktere/{c.id}" dimmed={c.status !== "active"}>
          {#snippet meta()}
            {#if c.campaigns?.length}
              <div class="chip-row">
                {#each c.campaigns as link (link.campaignId)}
                  <a
                    class="campaign"
                    class:former={!link.active}
                    href="/k/{link.campaignId}/charaktere/{c.id}"
                    title={link.active ? "Spielt hier mit" : `Ausgeschieden: ${link.leftReason || "–"}`}
                  >
                    <span class="dot" style="background:{themeColor(link.theme)}"></span>{link.name}
                  </a>
                {/each}
              </div>
            {:else}
              <span class="faint">Keiner Kampagne zugewiesen</span>
            {/if}
          {/snippet}
          {#snippet actions()}
            <button class="btn btn-sm" onclick={() => (managing = c)}><Flag size={14} /> Kampagnen</button>
            <button class="btn btn-sm" onclick={() => openFork(c)}><GitFork size={14} /> Kopieren</button>
            <select
              class="select input-sm status"
              value={c.status}
              aria-label="Status von {c.name}"
              onchange={e => setStatus(c, (e.currentTarget as HTMLSelectElement).value as CharacterStatus)}
            >
              {#each Object.entries(STATUS_LABEL) as [key, label] (key)}<option value={key}>{label}</option>{/each}
            </select>
            <button class="btn btn-sm btn-ghost btn-icon" aria-label="{c.name} löschen" onclick={() => remove(c)}><Trash2 size={14} /></button>
          {/snippet}
        </CharacterCard>
      {/each}
    </div>
  {/if}
</AppShell>

{#if creating}
  <NewCharacterModal
    onclose={() => (creating = false)}
    oncreated={c => {
      creating = false;
      navigate(`/charaktere/${c.id}?bearbeiten=1`);
    }}
  />
{/if}

{#if managing}
  {@const c = managing}
  <Modal title="{c.name} – Kampagnen" onclose={() => (managing = null)}>
    <p class="small muted">
      Spielt der Charakter in mehreren Kampagnen, teilen sich alle denselben Bogen. Ausgeschiedene bleiben im Verlauf der
      Kampagne sichtbar.
    </p>
    {#if campaigns.length === 0}
      <p class="muted">Du hast noch keine Kampagne. <a href="/">Zur Übersicht</a></p>
    {/if}
    <div class="stack">
      {#each campaigns.filter(x => !x.archivedAt || linkOf(c, x.id)) as campaign (campaign.id)}
        {@const link = linkOf(c, campaign.id)}
        <div class="assign-row">
          <span class="dot" style="background:{themeColor(campaign.theme)}"></span>
          <div class="grow">
            <strong>{campaign.name}</strong>
            <span class="tiny muted block">
              {rulesetLabel(campaign.ruleset)}
              {#if campaign.ruleset !== c.ruleset} · Charakter nutzt {rulesetLabel(c.ruleset)}{/if}
              {#if link?.active} · spielt mit{:else if link} · ausgeschieden ({link.leftReason || "–"}){/if}
              {#if campaign.archivedAt} · archiviert{/if}
            </span>
          </div>
          {#if !link}
            <button class="btn btn-sm btn-primary" onclick={() => setAssignment(c, campaign, "assign")}>Zuweisen</button>
          {:else if link.active}
            <button class="btn btn-sm" onclick={() => setAssignment(c, campaign, "leave")}>Ausscheiden</button>
          {:else}
            <button class="btn btn-sm" onclick={() => setAssignment(c, campaign, "assign")}>Wieder aufnehmen</button>
            <button class="btn btn-sm btn-ghost btn-icon" aria-label="Aus Verlauf entfernen" onclick={() => setAssignment(c, campaign, "remove")}><Trash2 size={14} /></button>
          {/if}
        </div>
      {/each}
    </div>
    <p class="tiny muted hint">Einen verstorbenen Charakter ersetzt du am einfachsten direkt in der Kampagne unter „Charaktere → Austauschen“.</p>
  </Modal>
{/if}

{#if forking}
  {@const original = forking}
  <Modal title="{original.name} kopieren" onclose={() => (forking = null)}>
    <p class="small muted">
      Die Kopie übernimmt Bogen und Zauber, ist danach aber völlig eigenständig: Änderungen wirken nur auf die Kopie,
      nicht auf das Original oder andere Kopien.
    </p>
    <div class="field">
      <label for="fork-name">Name der Kopie</label>
      <input id="fork-name" class="input" bind:value={forkName} maxlength="200" />
    </div>
    {#if selectableCampaigns.length}
      <span class="label">Kopie gleich einer Kampagne zuweisen (optional)</span>
      <div class="stack fork-list">
        {#each selectableCampaigns as campaign (campaign.id)}
          {@const link = linkOf(original, campaign.id)}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={forkCampaigns.includes(campaign.id)}
              onchange={() =>
                (forkCampaigns = forkCampaigns.includes(campaign.id)
                  ? forkCampaigns.filter(x => x !== campaign.id)
                  : [...forkCampaigns, campaign.id])}
            />
            {campaign.name}
            {#if link?.active}<span class="tiny muted">(Original spielt hier)</span>{/if}
          </label>
        {/each}
      </div>
      {#if forkCampaigns.some(id => linkOf(original, id)?.active)}
        <label class="checkbox small">
          <input type="checkbox" bind:checked={forkReplace} /> Dort, wo das Original spielt, das Original durch die Kopie ersetzen
        </label>
      {/if}
    {/if}
    {#snippet footer()}
      <button class="btn" onclick={() => (forking = null)}>Abbrechen</button>
      <button class="btn btn-primary" disabled={!forkName.trim()} onclick={fork}><GitFork size={16} /> Kopie erstellen</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .toolbar { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
  .search { position: relative; flex: 1; min-width: 14rem; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 0.6rem; color: var(--faint); }
  .search input { padding-left: 2rem; }
  .campaign {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text);
  }
  .campaign.former { color: var(--faint); text-decoration: line-through; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .status { width: auto; }
  .assign-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .block { display: block; }
  .hint { margin-top: 0.9rem; }
  .fork-list { margin: 0.4rem 0 0.8rem; gap: 0.4rem; }
</style>
