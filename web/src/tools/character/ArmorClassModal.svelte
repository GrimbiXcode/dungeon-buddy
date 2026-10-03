<script lang="ts">
  import { Trash2 } from "@lucide/svelte";
  import Modal from "../../components/Modal.svelte";
  import { armorClass, setEquipped } from "../../lib/armor";
  import { formatMod } from "../../lib/dnd";
  import { addEffect } from "../../lib/features";
  import { toast } from "../../lib/toast.svelte";
  import { sheet } from "./context";

  let { onclose }: { onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);
  const ac = $derived(armorClass(c));
  const shields = $derived(c.armor.filter(a => a.type === "shield"));
  const acEffects = $derived(c.combat.effects.filter(e => e.ac && e.ac.mode !== "none"));

  let amount = $state<number | null>(2);
  let name = $state("");
  let rounds = $state<number | null>(null);

  function addTemp(e: SubmitEvent) {
    e.preventDefault();
    const value = Math.trunc(Number(amount));
    if (!value) return;
    addEffect(c, {
      name: name.trim() || "Temporärer RK-Bonus",
      featureId: null,
      remaining: rounds && rounds > 0 ? rounds : null,
      concentration: false,
      note: "Von Mitspielern oder Gegenständen",
      ac: { mode: "bonus", value },
    });
    toast(`RK ${formatMod(value)} hinzugefügt.`, "success");
    name = "";
    rounds = null;
  }

  function toggleShield(id: string) {
    const s = c.armor.find(a => a.id === id);
    if (!s) return;
    setEquipped(c, s, !s.equipped);
    if (c.combat.active) {
      c.combat.used.action = true;
      toast(`${s.name} ${s.equipped ? "aufgenommen" : "abgelegt"} – Aktion verbraucht.`);
    }
  }
</script>

<Modal title="Rüstungsklasse {ac.total}" size="sm" {onclose}>
  <table class="parts">
    <tbody>
      {#each ac.parts as p, i (i)}
        <tr><td>{p.label}</td><td class="mono num">{i === 0 ? p.value : formatMod(p.value)}</td></tr>
      {/each}
      <tr class="total"><td>Gesamt</td><td class="mono num">{ac.total}</td></tr>
    </tbody>
  </table>
  {#each ac.notes as note (note)}<p class="tiny warn">{note}</p>{/each}

  {#if shields.length}
    <h4 class="label">Schild</h4>
    {#each shields as s (s.id)}
      <label class="checkbox small"><input type="checkbox" checked={s.equipped} onchange={() => toggleShield(s.id)} /> {s.name} tragen (+{s.baseAc + s.bonus})</label>
    {/each}
  {/if}

  {#if acEffects.length}
    <h4 class="label">Aktive RK-Effekte</h4>
    <div class="effects">
      {#each acEffects as e (e.id)}
        <div class="effect small">
          <span class="grow">{e.name} <span class="muted mono">{e.ac?.mode === "bonus" ? formatMod(e.ac.value) : e.ac?.mode === "min" ? `min. ${e.ac.value}` : `${e.ac?.value} + GES`}</span></span>
          <span class="tiny muted">{e.remaining == null ? "unbestimmt" : `${e.remaining} R`}</span>
          <button class="btn btn-sm btn-icon btn-ghost" aria-label="{e.name} beenden" onclick={() => (c.combat.effects = c.combat.effects.filter(x => x.id !== e.id))}><Trash2 size={13} /></button>
        </div>
      {/each}
    </div>
  {/if}

  <h4 class="label">Temporärer Bonus</h4>
  <p class="tiny muted">Z. B. Schild des Glaubens oder Schutz eines Mitspielers. Eigene Zauber und Fähigkeiten wirken über ihren RK-Modifikator automatisch.</p>
  <form class="temp" onsubmit={addTemp}>
    <input class="input input-sm mono amt" type="number" bind:value={amount} aria-label="Bonus" />
    <input class="input input-sm grow" bind:value={name} placeholder="Quelle, z. B. Schild des Glaubens" aria-label="Quelle" />
    <input class="input input-sm mono amt" type="number" min="1" bind:value={rounds} placeholder="Runden" aria-label="Dauer in Runden (leer = unbestimmt)" />
    <button class="btn btn-sm btn-primary" type="submit">Hinzufügen</button>
  </form>
</Modal>

<style>
  .parts { width: 100%; border-collapse: collapse; margin-bottom: 0.5rem; }
  .parts td { padding: 0.25rem 0; border-bottom: 1px solid var(--border); }
  .num { text-align: right; }
  .total td { font-weight: 800; border-bottom: 0; }
  .warn { color: var(--warning); margin: 0 0 0.3rem; }
  h4 { margin: 0.9rem 0 0.35rem; }
  .effects { display: flex; flex-direction: column; gap: 0.25rem; }
  .effect { display: flex; align-items: center; gap: 0.4rem; }
  .temp { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .amt { width: 5rem; }
</style>
