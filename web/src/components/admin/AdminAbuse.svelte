<script lang="ts">
  import { onMount } from "svelte";
  import { TriangleAlert } from "@lucide/svelte";
  import { get } from "../../lib/api";
  import { formatDate } from "../../lib/format";
  import { toastError } from "../../lib/toast.svelte";

  type Overview = {
    metrics: { key: string; label: string; value: number; threshold: number; exceeded: boolean }[];
    rateLimitedByBucket: { bucket: string; n: number }[];
    quotaByName: { quota: string; n: number }[];
    newUsersPerDay: { day: string; n: number }[];
    topUsers: { id: string; displayName: string; blockedAt: string | null; n: number }[];
    blockedUsers: number;
  };

  const bucketLabels: Record<string, string> = {
    request: "Alle Anfragen (600/min)",
    write: "Änderungen (120/min)",
    create: "Neue Einträge (300/h)",
    unblockRequest: "Entsperr-Anträge (3/Tag)",
  };

  let data = $state<Overview | null>(null);
  onMount(async () => {
    try {
      data = await get("/api/admin/abuse");
    } catch (e) {
      toastError(e);
    }
  });
  const exceeded = $derived(data?.metrics.filter(m => m.exceeded).length ?? 0);
</script>

{#if !data}
  <div class="center"><div class="spinner"></div></div>
{:else}
  <div class="stack">
    <div class="metrics">
      {#each data.metrics as m (m.key)}
        <div class="card metric" class:alert={m.exceeded}>
          <span class="small muted">{m.label}</span>
          <strong>{m.value}</strong>
          <span class="tiny muted">Alarm ab {m.threshold}</span>
        </div>
      {/each}
      <div class="card metric">
        <span class="small muted">Gesperrte Konten</span>
        <strong>{data.blockedUsers}</strong>
      </div>
    </div>
    {#if exceeded}
      <p class="row warn"><TriangleAlert size={16} /> {exceeded} Schwelle(n) überschritten. Admins werden höchstens alle 6 Stunden per Telegram benachrichtigt.</p>
    {/if}

    <div class="grid-2">
      <section class="card">
        <h2>Rate-Limit-Treffer (24 h)</h2>
        {#if data.rateLimitedByBucket.length}
          <table class="table">
            <tbody>
              {#each data.rateLimitedByBucket as r (r.bucket)}
                <tr><td>{bucketLabels[r.bucket] ?? r.bucket}</td><td class="num">{r.n}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}<p class="muted small">Keine.</p>{/if}
      </section>

      <section class="card">
        <h2>Obergrenzen erreicht (24 h)</h2>
        {#if data.quotaByName.length}
          <table class="table">
            <tbody>
              {#each data.quotaByName as q (q.quota)}
                <tr><td class="mono">{q.quota}</td><td class="num">{q.n}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}<p class="muted small">Keine.</p>{/if}
      </section>

      <section class="card">
        <h2>Neue Konten (14 Tage)</h2>
        {#if data.newUsersPerDay.length}
          <table class="table">
            <tbody>
              {#each data.newUsersPerDay as d (d.day)}
                <tr><td>{formatDate(d.day)}</td><td class="num">{d.n}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}<p class="muted small">Keine.</p>{/if}
      </section>

      <section class="card">
        <h2>Auffälligste Konten (7 Tage)</h2>
        {#if data.topUsers.length}
          <table class="table">
            <tbody>
              {#each data.topUsers as u (u.id)}
                <tr>
                  <td>{u.displayName} {#if u.blockedAt}<span class="badge badge-danger">Gesperrt</span>{/if}</td>
                  <td class="num">{u.n}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}<p class="muted small">Keine.</p>{/if}
      </section>
    </div>
    <p class="tiny muted">
      Grundlage sind nur Ereignisse, bei denen ein Limit gegriffen hat – ohne IP-Adressen, gelöscht nach 90 Tagen.
    </p>
  </div>
{/if}

<style>
  .metrics { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .metric { display: grid; gap: 0.15rem; }
  .metric strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
  .metric.alert { border-color: var(--danger); }
  .metric.alert strong { color: var(--danger); }
  .warn { gap: 0.4rem; color: var(--danger); }
  h2 { font-size: 1rem; }
</style>
