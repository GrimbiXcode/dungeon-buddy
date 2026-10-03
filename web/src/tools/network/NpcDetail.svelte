<script lang="ts">
  import { ArrowLeft, ArrowRight, Flag, ImagePlus, MapPin, Pencil, Plus, Trash2, UserRound, X } from "@lucide/svelte";
  import Modal from "../../components/Modal.svelte";
  import Markdown from "../../components/Markdown.svelte";
  import { campaignApi, del, patch, post, upload } from "../../lib/api";
  import { attachmentUrl } from "../../lib/markdown";
  import { session } from "../../lib/session.svelte";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { toast, toastError } from "../../lib/toast.svelte";
  import type { Attachment, Npc, NpcRelation } from "../../lib/types";
  import AttitudePicker from "./AttitudePicker.svelte";
  import AttitudePill from "./AttitudePill.svelte";
  import { attitudeColor, initials, relationsOf, statusLabel } from "./attitude";

  let {
    campaignId,
    npc,
    npcs,
    relations,
    onclose,
    onedit,
    ondelete,
    onselect,
    onrelationsaved,
    onrelationdeleted,
    onimagechange,
  }: {
    campaignId: string;
    npc: Npc;
    npcs: Npc[];
    relations: NpcRelation[];
    onclose: () => void;
    onedit: () => void;
    ondelete: () => void;
    onselect: (id: string) => void;
    onrelationsaved: (r: NpcRelation) => void;
    onrelationdeleted: (id: string) => void;
    onimagechange: (imageId: string | null) => void;
  } = $props();

  let imageInput: HTMLInputElement | undefined = $state();
  let imageBusy = $state(false);
  const imageUrl = $derived(`${campaignApi(campaignId, "npcs")}/${npc.id}/image`);

  async function imagePicked(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    imageBusy = true;
    try {
      const a = await upload<Attachment>(imageUrl, file, {}, { method: "PUT" });
      onimagechange(a.id);
    } catch (err) {
      toastError(err);
    } finally {
      imageBusy = false;
    }
  }

  async function removeImage() {
    if (!(await confirmDialog(`Bild von ${npc.name} entfernen?`, { title: "Bild entfernen", confirmLabel: "Entfernen" }))) return;
    try {
      await del(imageUrl);
      onimagechange(null);
    } catch (err) {
      toastError(err);
    }
  }

  const byId = $derived(new Map(npcs.map(n => [n.id, n])));
  const rels = $derived(
    relationsOf(npc.id, relations).sort((a, b) =>
      (byId.get(a.otherId)?.name ?? "").localeCompare(byId.get(b.otherId)?.name ?? "", "de")
    )
  );
  const shortName = $derived.by(() => {
    const first = npc.name.trim().split(/\s+/)[0] ?? npc.name;
    return first.length > 16 ? first.slice(0, 15) + "…" : first;
  });
  const others = $derived(npcs.filter(n => n.id !== npc.id));

  // ── Beziehungsformular ─────────────────────────────────────────────
  type Draft = { id: string | null; otherId: string; outgoing: boolean; label: string; attitude: number; notes: string };
  let draft = $state<Draft | null>(null);
  let busy = $state(false);

  // Formular schliessen, wenn auf einen anderen NPC gewechselt wird
  $effect(() => {
    void npc.id;
    draft = null;
  });

  function newRelation() {
    draft = { id: null, otherId: others[0]?.id ?? "", outgoing: true, label: "", attitude: 0, notes: "" };
  }

  function editRelation(r: NpcRelation) {
    const outgoing = r.fromNpcId === npc.id;
    draft = {
      id: r.id,
      otherId: outgoing ? r.toNpcId : r.fromNpcId,
      outgoing,
      label: r.label,
      attitude: r.attitude,
      notes: r.notes,
    };
  }

  async function saveRelation(e: SubmitEvent) {
    e.preventDefault();
    if (!draft || !draft.otherId) return;
    busy = true;
    try {
      const body = {
        fromNpcId: draft.outgoing ? npc.id : draft.otherId,
        toNpcId: draft.outgoing ? draft.otherId : npc.id,
        label: draft.label.trim(),
        attitude: draft.attitude,
        notes: draft.notes,
      };
      const base = campaignApi(campaignId, "relations");
      const saved = draft.id ? await patch<NpcRelation>(`${base}/${draft.id}`, body) : await post<NpcRelation>(base, body);
      onrelationsaved(saved);
      draft = null;
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  async function deleteRelation(r: NpcRelation) {
    const other = byId.get(r.fromNpcId === npc.id ? r.toNpcId : r.fromNpcId);
    const ok = await confirmDialog(
      `Beziehung zwischen ${npc.name} und ${other?.name ?? "?"}${r.label ? ` („${r.label}“)` : ""} löschen?`,
      { title: "Beziehung löschen" }
    );
    if (!ok) return;
    try {
      await del(`${campaignApi(campaignId, "relations")}/${r.id}`);
      onrelationdeleted(r.id);
      if (draft?.id === r.id) draft = null;
      toast("Beziehung gelöscht", "success");
    } catch (err) {
      toastError(err);
    }
  }

  async function deleteNpc() {
    const n = rels.length;
    const ok = await confirmDialog(
      `${npc.name} wirklich löschen?` +
        (n ? ` Dabei ${n === 1 ? "wird auch 1 Beziehung" : `werden auch ${n} Beziehungen`} gelöscht.` : ""),
      { title: "NPC löschen" }
    );
    if (!ok) return;
    try {
      await del(`${campaignApi(campaignId, "npcs")}/${npc.id}`);
      toast(`${npc.name} gelöscht`, "success");
      ondelete();
    } catch (err) {
      toastError(err);
    }
  }

  const uid = Math.random().toString(36).slice(2, 8);
</script>

<Modal title={npc.name} size="lg" {onclose}>
  <div class="detail" style="--c:{attitudeColor(npc.attitude)}">
    <div class="head">
      {#if session.info?.attachments}
        <div class="avatar-wrap">
          <button
            class="avatar photo-btn"
            class:dead={npc.status === "dead"}
            class:busy={imageBusy}
            disabled={imageBusy}
            onclick={() => imageInput?.click()}
            aria-label={npc.imageId ? `Bild von ${npc.name} ändern` : `Bild für ${npc.name} hinzufügen`}
            title={npc.imageId ? "Bild ändern" : "Bild hinzufügen"}
          >
            {#if npc.imageId}
              <img src={attachmentUrl(npc.imageId, "thumb")} alt="" />
            {:else}
              {initials(npc.name)}
            {/if}
            <span class="photo-hint"><ImagePlus size={16} /></span>
          </button>
          {#if npc.imageId}
            <button class="btn btn-sm btn-ghost btn-icon remove-photo" onclick={removeImage} aria-label="Bild entfernen"><X size={12} /></button>
          {/if}
          <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" bind:this={imageInput} onchange={imagePicked} tabindex="-1" aria-hidden="true" />
        </div>
      {:else}
        <div class="avatar" class:dead={npc.status === "dead"} aria-hidden="true">{initials(npc.name)}</div>
      {/if}
      <div class="grow head-text">
        {#if npc.role}<p class="role">{npc.role}</p>{/if}
        <div class="row meta">
          <AttitudePill value={npc.attitude} />
          {#if npc.status !== "alive"}
            <span class="badge" class:badge-danger={npc.status === "dead"}>{statusLabel(npc.status)}</span>
          {/if}
          {#if npc.faction}<span class="small muted iconed"><Flag size={14} /> {npc.faction}</span>{/if}
          {#if npc.location}<span class="small muted iconed"><MapPin size={14} /> {npc.location}</span>{/if}
        </div>
        {#if npc.tags.length}
          <div class="chip-row tags">
            {#each npc.tags as t (t)}<span class="badge">{t}</span>{/each}
          </div>
        {/if}
      </div>
    </div>

    <section class="you">
      <h3 class="label"><UserRound size={14} /> Beziehung zu dir / zur Gruppe</h3>
      <div class="row">
        <AttitudePill value={npc.attitude} />
        {#if npc.relation}
          <span>{npc.relation}</span>
        {:else}
          <span class="faint small">Nichts Weiteres notiert.</span>
        {/if}
      </div>
    </section>

    {#if npc.description}
      <section>
        <h3 class="label">Beschreibung</h3>
        <Markdown source={npc.description} />
      </section>
    {/if}
    {#if npc.notes}
      <section>
        <h3 class="label">Notizen</h3>
        <Markdown source={npc.notes} />
      </section>
    {/if}
    {#if !npc.description && !npc.notes}
      <p class="faint small">Noch keine Beschreibung oder Notizen.</p>
    {/if}

    <section>
      <div class="row-between rel-head">
        <h3 class="label">Beziehungen <span class="count">{rels.length}</span></h3>
        {#if !draft && others.length}
          <button class="btn btn-sm" onclick={newRelation}><Plus size={14} /> Beziehung</button>
        {/if}
      </div>

      {#if draft && !draft.id}
        {@render relForm(draft)}
      {/if}

      {#if rels.length}
        <ul class="rels">
          {#each rels as rv (rv.relation.id)}
            {@const other = byId.get(rv.otherId)}
            {#if draft && draft.id === rv.relation.id}
              <li class="editing">{@render relForm(draft)}</li>
            {:else}
              <li style="--rc:{attitudeColor(rv.relation.attitude)}">
                <button class="rel-main" onclick={() => onselect(rv.otherId)} title="Zu {other?.name} wechseln">
                  <span class="dir" aria-label={rv.outgoing ? "ausgehend" : "eingehend"}>
                    {#if rv.outgoing}<ArrowRight size={15} />{:else}<ArrowLeft size={15} />{/if}
                  </span>
                  <span class="grow rel-text">
                    <span class="rel-line">
                      <strong>{other?.name ?? "?"}</strong>{#if rv.relation.label}<span class="muted">: {rv.relation.label}</span>{/if}
                    </span>
                    {#if rv.relation.notes}<span class="small faint rel-notes">{rv.relation.notes}</span>{/if}
                  </span>
                  <AttitudePill value={rv.relation.attitude} small />
                </button>
                <div class="rel-actions">
                  <button class="btn btn-ghost btn-sm btn-icon" aria-label="Beziehung bearbeiten" onclick={() => editRelation(rv.relation)}>
                    <Pencil size={14} />
                  </button>
                  <button class="btn btn-ghost btn-sm btn-icon btn-danger" aria-label="Beziehung löschen" onclick={() => deleteRelation(rv.relation)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            {/if}
          {/each}
        </ul>
      {:else if !draft}
        <p class="faint small">
          {others.length ? "Noch keine Beziehungen zu anderen NPCs." : "Lege weitere NPCs an, um Beziehungen zu erfassen."}
        </p>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost btn-danger left" onclick={deleteNpc}><Trash2 size={16} /> Löschen</button>
    <button class="btn close-btn" onclick={onclose}>Schliessen</button>
    <button class="btn btn-primary" onclick={onedit}><Pencil size={16} /> Bearbeiten</button>
  {/snippet}
</Modal>

{#snippet relForm(d: Draft)}
  <form class="rel-form" onsubmit={saveRelation}>
    <div class="dir-row">
      <div class="segmented" role="group" aria-label="Richtung">
        <button type="button" aria-pressed={d.outgoing} onclick={() => (d.outgoing = true)}>
          {shortName} <ArrowRight size={13} /> …
        </button>
        <button type="button" aria-pressed={!d.outgoing} onclick={() => (d.outgoing = false)}>
          … <ArrowRight size={13} /> {shortName}
        </button>
      </div>
    </div>
    <div class="grid-2 form-cols">
      <div class="field">
        <label for="r-other-{uid}">{d.outgoing ? "Zu" : "Von"}</label>
        <select id="r-other-{uid}" class="select" bind:value={d.otherId} required>
          {#each others as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="r-label-{uid}">Beziehung</label>
        <input
          id="r-label-{uid}"
          class="input"
          bind:value={d.label}
          maxlength="200"
          placeholder={d.outgoing ? "z. B. Schwester von, dient, hasst" : "z. B. besessen von"}
        />
      </div>
    </div>
    <div class="field">
      <span class="label">Haltung</span>
      <AttitudePicker bind:value={d.attitude} compact label="Haltung in dieser Beziehung" />
    </div>
    <div class="field">
      <label for="r-notes-{uid}">Notizen</label>
      <input id="r-notes-{uid}" class="input" bind:value={d.notes} maxlength="5000" placeholder="Optional" />
    </div>
    <div class="row form-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (draft = null)}>Abbrechen</button>
      <button type="submit" class="btn btn-primary btn-sm" disabled={busy || !d.otherId}>
        {d.id ? "Speichern" : "Hinzufügen"}
      </button>
    </div>
  </form>
{/snippet}

<style>
  .detail { display: flex; flex-direction: column; gap: 1.15rem; }
  .head { display: flex; gap: 0.9rem; align-items: flex-start; }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    color: color-mix(in oklab, var(--c) 70%, var(--text));
    background: color-mix(in oklab, var(--c) 18%, var(--surface));
    border: 2px solid var(--c);
  }
  .avatar.dead { filter: grayscale(1); opacity: 0.7; border-style: dashed; }
  .avatar-wrap { position: relative; flex: none; }
  .photo-btn { position: relative; padding: 0; overflow: hidden; cursor: pointer; }
  .photo-btn img { width: 100%; height: 100%; object-fit: cover; }
  .photo-btn.busy { opacity: 0.5; cursor: progress; }
  .photo-hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .photo-btn:hover .photo-hint, .photo-btn:focus-visible .photo-hint { opacity: 1; }
  .remove-photo { position: absolute; right: -8px; bottom: -6px; min-width: 24px; min-height: 24px; padding: 0; background: var(--surface); }
  .role { margin: 0 0 0.35rem; font-size: 1.02rem; color: var(--muted); }
  .head-text { padding-top: 0.15rem; }
  .meta { gap: 0.5rem 0.75rem; }
  .iconed { display: inline-flex; align-items: center; gap: 0.25rem; }
  .tags { margin-top: 0.55rem; }
  section h3.label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-body);
    margin: 0 0 0.45rem;
  }
  .you {
    padding: 0.7rem 0.85rem;
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--c) 8%, var(--surface-2));
    border-left: 3px solid var(--c);
  }
  .you .row { gap: 0.5rem 0.65rem; }
  .rel-head { margin-bottom: 0.45rem; }
  .rel-head h3 { margin: 0 !important; }
  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.3rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.72rem;
    letter-spacing: 0;
  }
  .rels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .rels li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--border);
    border-left: 3px solid var(--rc);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .rels li.editing { display: block; border: 0; background: none; }
  .rel-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.4rem 0.5rem 0.6rem;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .rel-main:hover strong { color: var(--accent-text); text-decoration: underline; }
  .dir { display: inline-flex; color: var(--rc); flex: none; }
  .rel-text { display: flex; flex-direction: column; min-width: 0; }
  .rel-line { overflow-wrap: anywhere; }
  .rel-notes { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rel-actions { display: flex; gap: 2px; padding-right: 0.3rem; flex: none; }
  .rel-form {
    padding: 0.8rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--accent) 5%, var(--surface));
  }
  .dir-row { margin-bottom: 0.7rem; overflow-x: auto; }
  .dir-row .segmented button { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
  .form-cols { column-gap: 0.75rem; row-gap: 0; }
  .form-actions { justify-content: flex-end; gap: 0.4rem; }
  .left { margin-right: auto; }
  @media (max-width: 560px) {
    .form-cols { grid-template-columns: 1fr; }
    .rel-main :global(.pill) { display: none; }
    .close-btn { display: none; }
  }
</style>
