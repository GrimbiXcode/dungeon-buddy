<script lang="ts">
  import { onMount } from "svelte";
  import { Check, X } from "@lucide/svelte";
  import Modal from "../Modal.svelte";
  import { get, post } from "../../lib/api";
  import { formatDate } from "../../lib/format";
  import { toast, toastError } from "../../lib/toast.svelte";
  import { BLOCK_REASON_LABELS, type BlockReason, type UnblockStatus } from "../../lib/types";

  type Request = {
    id: string;
    userId: string;
    message: string;
    status: UnblockStatus;
    reviewNote: string;
    reviewedAt: string | null;
    createdAt: string;
    displayName: string;
    blockedReason: BlockReason | null;
  };

  const filters: { key: UnblockStatus | ""; label: string }[] = [
    { key: "pending", label: "Offen" },
    { key: "approved", label: "Angenommen" },
    { key: "rejected", label: "Abgelehnt" },
    { key: "", label: "Alle" },
  ];
  const statusLabel: Record<UnblockStatus, string> = { pending: "Offen", approved: "Angenommen", rejected: "Abgelehnt" };

  let filter = $state<UnblockStatus | "">("pending");
  let requests = $state<Request[] | null>(null);
  let rejecting = $state<Request | null>(null);
  let note = $state("");
  let busy = $state(false);

  async function load() {
    try {
      requests = await get(`/api/admin/unblock-requests${filter ? `?status=${filter}` : ""}`);
    } catch (e) {
      toastError(e);
    }
  }
  onMount(load);

  async function review(r: Request, decision: "approved" | "rejected", reviewNote = "") {
    busy = true;
    try {
      await post(`/api/admin/unblock-requests/${r.id}/review`, { decision, note: reviewNote });
      toast(decision === "approved" ? `${r.displayName} freigeschaltet.` : "Antrag abgelehnt.", "success");
      rejecting = null;
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack">
  <div class="segmented" role="group" aria-label="Status">
    {#each filters as f (f.key)}
      <button aria-pressed={filter === f.key} onclick={() => ((filter = f.key), load())}>{f.label}</button>
    {/each}
  </div>

  {#if !requests}
    <div class="center"><div class="spinner"></div></div>
  {:else if requests.length === 0}
    <p class="muted">Keine Anträge.</p>
  {:else}
    <div class="stack">
      {#each requests as r (r.id)}
        <article class="request">
          <div class="row-between">
            <strong>{r.displayName}</strong>
            <span class="badge" class:badge-accent={r.status === "pending"}>{statusLabel[r.status]}</span>
          </div>
          <p class="tiny muted">
            {formatDate(r.createdAt)}{#if r.blockedReason} · gesperrt wegen {BLOCK_REASON_LABELS[r.blockedReason]}{/if}
          </p>
          <p class="message">{r.message}</p>
          {#if r.status === "pending"}
            <div class="row">
              <button class="btn btn-sm btn-primary" disabled={busy} onclick={() => review(r, "approved")}><Check size={14} /> Annehmen & entsperren</button>
              <button class="btn btn-sm" disabled={busy} onclick={() => ((rejecting = r), (note = ""))}><X size={14} /> Ablehnen</button>
            </div>
          {:else if r.reviewNote}
            <p class="small muted">Entscheid ({formatDate(r.reviewedAt)}): {r.reviewNote}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

{#if rejecting}
  <Modal title="Antrag ablehnen" size="sm" onclose={() => (rejecting = null)}>
    <p>Die Begründung wird {rejecting.displayName} per Telegram geschickt und auf der Sperrseite angezeigt.</p>
    <div class="field">
      <label for="reject-note">Begründung</label>
      <textarea id="reject-note" class="textarea" rows="3" maxlength="1000" bind:value={note}></textarea>
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (rejecting = null)}>Abbrechen</button>
      <button class="btn btn-danger" disabled={busy || !note.trim()} onclick={() => review(rejecting!, "rejected", note)}>Ablehnen</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .request { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem 0.9rem; }
  .request p { margin: 0.25rem 0; }
  .message { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
