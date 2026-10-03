<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import Icon from "../../components/Icon.svelte";
  import { isLight, newAttack, type Attack } from "../../lib/character";
  import { confirmDialog } from "../../lib/confirm.svelte";
  import { sheet } from "./context";
  import AttackCard from "./AttackCard.svelte";
  import AttackEditor from "./AttackEditor.svelte";

  const ctx = sheet();
  const c = $derived(ctx.data);
  let editing = $state<Attack | null>(null);

  const lightCount = $derived(c.attacks.filter(isLight).length);

  function save(a: Attack) {
    const i = c.attacks.findIndex(x => x.id === a.id);
    if (i >= 0) c.attacks[i] = a;
    else c.attacks.push(a);
    editing = null;
  }

  async function remove(a: Attack) {
    if (!(await confirmDialog(`„${a.name || "Angriff"}“ aus dem Bogen entfernen?`, { title: "Angriff löschen" }))) return;
    c.attacks = c.attacks.filter(x => x.id !== a.id);
    for (const f of c.features) f.appliesTo.attackIds = f.appliesTo.attackIds.filter(id => id !== a.id);
  }
</script>

<section class="card">
  <div class="row-between head">
    <h3><Icon name="attack" size={17} /> Angriffe</h3>
    <div class="row">
      <button class="btn btn-sm" onclick={() => ctx.openLibrary("attack")}><Icon name="library" size={14} /> Aus Bibliothek</button>
      <button class="btn btn-sm btn-primary" onclick={() => (editing = newAttack({ name: "" }))}><Plus size={14} /> Angriff</button>
    </div>
  </div>

  {#if c.attacks.length === 0}
    <p class="muted small">Noch keine Angriffe. Lege Waffen an, um mit dem Angriffs-Assistenten zu würfeln.</p>
  {:else}
    <div class="list">
      {#each c.attacks as a (a.id)}
        <AttackCard attack={a} onedit={() => (editing = a)} ondelete={() => remove(a)} onlibrary={() => ctx.addToLibrary("attack", a)} />
      {/each}
    </div>
  {/if}

  {#if lightCount >= 2 || c.twoWeaponFighting}
    <label class="checkbox small twf">
      <input type="checkbox" bind:checked={c.twoWeaponFighting} /> Kampfstil Zwei-Waffen-Kampf (Attributsmodifikator auch beim Zusatzangriff)
    </label>
  {/if}
</section>

{#if editing}
  <AttackEditor attack={editing} onsave={save} onclose={() => (editing = null)} />
{/if}

<style>
  .head { margin-bottom: 0.6rem; gap: 0.5rem; flex-wrap: wrap; }
  h3 { margin: 0; display: inline-flex; align-items: center; gap: 0.4rem; }
  .list { display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
  .twf { margin-top: 0.7rem; }
</style>
