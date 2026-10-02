<script lang="ts">
  import { onMount } from "svelte";
  import { Ban, Download, LogOut, Send, Trash2 } from "@lucide/svelte";
  import Logo from "../components/Logo.svelte";
  import Modal from "../components/Modal.svelte";
  import { del, get, post } from "../lib/api";
  import { formatDate } from "../lib/format";
  import { navigate } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { toast, toastError } from "../lib/toast.svelte";
  import { BLOCK_REASON_LABELS, type UnblockRequest } from "../lib/types";

  const MAX = 1000;
  const user = $derived(session.user!);
  let request = $state<UnblockRequest | null>(null);
  let message = $state("");
  let busy = $state(false);
  let showDelete = $state(false);
  let deleteConfirm = $state("");

  onMount(async () => {
    try {
      request = (await get<{ request: UnblockRequest | null }>("/api/unblock")).request;
    } catch (e) {
      toastError(e);
    }
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      request = (await post<{ request: UnblockRequest }>("/api/unblock", { message })).request;
      message = "";
      toast("Antrag gesendet.", "success");
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  async function logout() {
    try {
      await post("/api/auth/logout");
    } finally {
      session.user = null;
      navigate("/", { replace: true });
    }
  }

  async function deleteAccount() {
    busy = true;
    try {
      await del("/api/me", { confirm: deleteConfirm });
      session.user = null;
      navigate("/", { replace: true });
      toast("Dein Konto und alle Daten wurden gelöscht.", "success", 6000);
    } catch (e) {
      toastError(e);
    } finally {
      busy = false;
    }
  }

  const statusText = {
    pending: "Dein Antrag liegt zur Prüfung vor.",
    approved: "Dein Antrag wurde angenommen. Bitte melde dich neu an.",
    rejected: "Dein Antrag wurde abgelehnt.",
  };
</script>

<div class="blocked">
  <Logo />
  <section class="card stack">
    <h1 class="row"><Ban size={22} /> Konto gesperrt</h1>
    <p>
      Dein Konto ist seit {formatDate(user.blockedAt!)} gesperrt.
      {#if user.blockedReason}Grund: <strong>{BLOCK_REASON_LABELS[user.blockedReason]}</strong>.{/if}
    </p>
    <p class="small muted">
      Deine Daten bleiben erhalten. Du kannst sie jederzeit exportieren oder dein Konto samt allen Daten löschen.
    </p>
    <div class="row">
      <a class="btn" href="/api/me/export" download><Download size={16} /> Daten exportieren</a>
      <button class="btn btn-danger" onclick={() => (showDelete = true)}><Trash2 size={16} /> Konto löschen</button>
      <button class="btn btn-ghost" onclick={logout}><LogOut size={16} /> Abmelden</button>
    </div>
  </section>

  <section class="card stack">
    <h2>Entsperrung beantragen</h2>
    {#if request}
      <p class:muted={request.status !== "rejected"}>{statusText[request.status]}</p>
      {#if request.status === "rejected" && request.reviewNote}
        <p class="small">Begründung: {request.reviewNote}</p>
      {/if}
    {/if}
    {#if request?.status !== "pending"}
      <form class="stack" onsubmit={submit}>
        <div class="field">
          <label for="unblock-msg">Warum sollte dein Konto entsperrt werden?</label>
          <textarea id="unblock-msg" class="textarea" rows="4" maxlength={MAX} bind:value={message} required></textarea>
          <span class="tiny muted">{message.length} / {MAX} · höchstens 3 Anträge pro Tag</span>
        </div>
        <div>
          <button class="btn btn-primary" disabled={busy || !message.trim()}><Send size={16} /> Antrag senden</button>
        </div>
      </form>
    {/if}
  </section>
</div>

{#if showDelete}
  <Modal title="Konto endgültig löschen" size="sm" onclose={() => (showDelete = false)}>
    <p>Dein Konto und alle Inhalte werden <strong>sofort und unwiderruflich</strong> gelöscht.</p>
    <div class="field">
      <label for="del-confirm">Zur Bestätigung LÖSCHEN eingeben</label>
      <input id="del-confirm" class="input" bind:value={deleteConfirm} autocomplete="off" />
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (showDelete = false)}>Abbrechen</button>
      <button class="btn btn-danger" disabled={busy || deleteConfirm !== "LÖSCHEN"} onclick={deleteAccount}>
        <Trash2 size={16} /> Alles löschen
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .blocked {
    max-width: 560px;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: grid;
    gap: 1rem;
  }
  h1 { font-size: 1.4rem; gap: 0.5rem; }
  h2 { font-size: 1.05rem; }
</style>
