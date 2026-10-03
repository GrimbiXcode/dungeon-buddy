<script lang="ts">
  import { onMount } from "svelte";
  import { Ban, Unlock } from "@lucide/svelte";
  import Icon from "../Icon.svelte";
  import Modal from "../Modal.svelte";
  import { get, post } from "../../lib/api";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { debounce, formatDate } from "../../lib/format";
  import { session } from "../../lib/session.svelte";
  import { toast, toastError } from "../../lib/toast.svelte";
  import { BLOCK_REASON_LABELS, type BlockReason } from "../../lib/types";

  type Entry = {
    id: string;
    displayName: string;
    role: "user" | "admin";
    createdAt: string;
    blockedAt: string | null;
    blockedReason: BlockReason | null;
    campaigns: number;
    characters: number;
  };

  let search = $state("");
  let data = $state<{ entries: Entry[]; total: number; blocked: number } | null>(null);
  let blocking = $state<Entry | null>(null);
  let reason = $state<BlockReason>("spam");
  let busy = $state(false);

  async function load() {
    try {
      data = await get(`/api/admin/users${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`);
    } catch (e) {
      toastError(e);
    }
  }
  const reload = debounce(load, 250);
  onMount(load);

  async function block() {
    if (!blocking) return;
    busy = true;
    try {
      await post(`/api/admin/users/${blocking.id}/block`, { reason });
      toast(`${blocking.displayName} gesperrt.`, "success");
      blocking = null;
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      busy = false;
    }
  }

  async function unblock(entry: Entry) {
    const ok = await confirmDialog(`${entry.displayName} wieder freischalten? Offene Anträge werden dabei angenommen.`, {
      title: "Sperre aufheben",
      confirmLabel: "Freischalten",
      danger: false,
    });
    if (!ok) return;
    try {
      await post(`/api/admin/users/${entry.id}/unblock`);
      toast(`${entry.displayName} freigeschaltet.`, "success");
      await load();
    } catch (e) {
      toastError(e);
    }
  }
</script>

<section class="card stack">
  <div class="row-between">
    <label class="search row grow">
      <Icon name="search" size={16} />
      <input class="input grow" placeholder="Nach Namen suchen" bind:value={search} oninput={reload} />
    </label>
    {#if data}
      <span class="small muted nowrap">{data.total} Konten · {data.blocked} gesperrt</span>
    {/if}
  </div>

  {#if !data}
    <div class="center"><div class="spinner"></div></div>
  {:else if data.entries.length === 0}
    <p class="muted">Keine Treffer.</p>
  {:else}
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="num">Kampagnen</th>
            <th class="num">Charaktere</th>
            <th>Erstellt</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as u (u.id)}
            <tr>
              <td>
                {u.displayName}
                {#if u.role === "admin"}<span class="badge badge-accent"><Icon name="admin" size={12} /> Admin</span>{/if}
              </td>
              <td class="num">{u.campaigns}</td>
              <td class="num">{u.characters}</td>
              <td class="nowrap">{formatDate(u.createdAt)}</td>
              <td>
                {#if u.blockedAt}
                  <span class="badge badge-danger">Gesperrt</span>
                  <span class="tiny muted block">{u.blockedReason ? BLOCK_REASON_LABELS[u.blockedReason] : ""} · {formatDate(u.blockedAt)}</span>
                {:else}
                  <span class="badge">Aktiv</span>
                {/if}
              </td>
              <td class="nowrap">
                {#if u.blockedAt}
                  <button class="btn btn-sm" onclick={() => unblock(u)}><Unlock size={14} /> Freischalten</button>
                {:else if u.role !== "admin" && u.id !== session.user?.id}
                  <button class="btn btn-sm btn-danger" onclick={() => ((blocking = u), (reason = "spam"))}><Ban size={14} /> Sperren</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

{#if blocking}
  <Modal title="Konto sperren" size="sm" onclose={() => (blocking = null)}>
    <p>
      <strong>{blocking.displayName}</strong> wird sofort abgemeldet und sieht nur noch die Sperrseite (Daten exportieren,
      Konto löschen, Entsperrung beantragen). Die Person wird per Telegram informiert.
    </p>
    <div class="field">
      <label for="block-reason">Grund</label>
      <select id="block-reason" class="select" bind:value={reason}>
        {#each Object.entries(BLOCK_REASON_LABELS) as [key, label] (key)}
          <option value={key}>{label}</option>
        {/each}
      </select>
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (blocking = null)}>Abbrechen</button>
      <button class="btn btn-danger" disabled={busy} onclick={block}><Ban size={16} /> Sperren</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .search { gap: 0.4rem; color: var(--muted); max-width: 360px; }
  .block { display: block; }
  td .badge { margin-left: 0.35rem; }
  td:has(> .badge:first-child) .badge { margin-left: 0; }
</style>
