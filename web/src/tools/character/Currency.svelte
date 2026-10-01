<script lang="ts">
  import { sheet } from "./context";

  const ctx = sheet();
  const c = $derived(ctx.data);
  const coins = [
    { key: "pp", label: "PM", title: "Platinmünzen" },
    { key: "gp", label: "GM", title: "Goldmünzen" },
    { key: "ep", label: "EM", title: "Elektrummünzen" },
    { key: "sp", label: "SM", title: "Silbermünzen" },
    { key: "cp", label: "KM", title: "Kupfermünzen" },
  ] as const;
</script>

<section class="card">
  <h3>Geld</h3>
  <div class="coins">
    {#each coins as coin (coin.key)}
      <label class="coin" title={coin.title}>
        <span class="label">{coin.label}</span>
        <input class="input input-sm mono" type="number" min="0" bind:value={c.currency[coin.key]} aria-label={coin.title} />
      </label>
    {/each}
  </div>
</section>

<style>
  h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  .coins { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.4rem; }
  .coin { display: flex; flex-direction: column; gap: 0.2rem; align-items: center; }
  .coin input { text-align: center; }
</style>
