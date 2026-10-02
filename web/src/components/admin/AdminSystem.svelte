<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "../../lib/api";
  import { formatBytes, formatDate } from "../../lib/format";
  import { toastError } from "../../lib/toast.svelte";

  type System = {
    database: { version: string; sizeBytes: number };
    migrations: { name: string; appliedAt: string }[];
    tables: { name: string; rows: number }[];
    quotas: Record<string, number>;
    storage: { enabled: boolean; attachments: number; totalBytes: number; pendingDeletions: number; bytesPerUser: number };
    node: string;
  };

  let data = $state<System | null>(null);
  onMount(async () => {
    try {
      data = await get("/api/admin/system");
    } catch (e) {
      toastError(e);
    }
  });
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
</script>

{#if !data}
  <div class="center"><div class="spinner"></div></div>
{:else}
  <div class="grid-2">
    <section class="card">
      <h2>Laufzeit</h2>
      <table class="table">
        <tbody>
          <tr><td>Node.js</td><td class="mono">{data.node}</td></tr>
          <tr><td>PostgreSQL</td><td class="mono">{data.database.version.split(" on ")[0]}</td></tr>
          <tr><td>Datenbankgrösse</td><td class="num">{mb(data.database.sizeBytes)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Anhänge</h2>
      {#if data.storage.enabled}
        <table class="table">
          <tbody>
            <tr><td>Anzahl</td><td class="num">{data.storage.attachments}</td></tr>
            <tr><td>Belegt im Speicher</td><td class="num">{formatBytes(data.storage.totalBytes)}</td></tr>
            <tr><td>Speicher pro Konto</td><td class="num">{formatBytes(data.storage.bytesPerUser)}</td></tr>
            <tr><td>Noch zu löschende Objekte</td><td class="num">{data.storage.pendingDeletions}</td></tr>
          </tbody>
        </table>
      {:else}
        <p class="small muted">Kein S3-Bucket konfiguriert – Anhänge sind aus.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Tabellen <span class="tiny muted">(geschätzte Zeilen)</span></h2>
      <table class="table">
        <tbody>
          {#each data.tables as t (t.name)}
            <tr><td class="mono">{t.name}</td><td class="num">{t.rows}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Migrationen</h2>
      <table class="table">
        <tbody>
          {#each data.migrations as m (m.name)}
            <tr><td class="mono">{m.name}</td><td class="nowrap">{formatDate(m.appliedAt)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Obergrenzen</h2>
      <table class="table">
        <tbody>
          {#each Object.entries(data.quotas) as [key, max] (key)}
            <tr><td class="mono">{key}</td><td class="num">{max}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  </div>
{/if}

<style>
  h2 { font-size: 1rem; }
</style>
