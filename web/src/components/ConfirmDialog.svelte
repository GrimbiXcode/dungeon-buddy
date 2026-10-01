<script lang="ts">
  import Modal from "./Modal.svelte";
  import { confirmState } from "../lib/confirm.svelte";

  function finish(ok: boolean) {
    confirmState.request?.resolve(ok);
    confirmState.request = null;
  }
</script>

{#if confirmState.request}
  {@const req = confirmState.request}
  <Modal title={req.title} size="sm" onclose={() => finish(false)}>
    <p>{req.message}</p>
    {#snippet footer()}
      <button class="btn" onclick={() => finish(false)}>Abbrechen</button>
      <button class="btn {req.danger ? 'btn-danger' : 'btn-primary'}" onclick={() => finish(true)}>
        {req.confirmLabel}
      </button>
    {/snippet}
  </Modal>
{/if}
