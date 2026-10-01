<script lang="ts">
  import { X } from "@lucide/svelte";
  import Modal from "../../components/Modal.svelte";
  import { campaignApi, patch, post } from "../../lib/api";
  import { toastError } from "../../lib/toast.svelte";
  import type { Npc, NpcStatus } from "../../lib/types";
  import AttitudePicker from "./AttitudePicker.svelte";
  import { STATUSES } from "./attitude";

  let {
    campaignId,
    npc = null,
    factions = [],
    locations = [],
    tagSuggestions = [],
    onclose,
    onsaved,
  }: {
    campaignId: string;
    npc?: Npc | null;
    factions?: string[];
    locations?: string[];
    tagSuggestions?: string[];
    onclose: () => void;
    onsaved: (npc: Npc) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const initial = npc;
  let name = $state(initial?.name ?? "");
  let role = $state(initial?.role ?? "");
  let faction = $state(initial?.faction ?? "");
  let location = $state(initial?.location ?? "");
  let status = $state<NpcStatus>(initial?.status ?? "alive");
  let attitude = $state(initial?.attitude ?? 0);
  let relation = $state(initial?.relation ?? "");
  let description = $state(initial?.description ?? "");
  let notes = $state(initial?.notes ?? "");
  let tags = $state<string[]>([...(initial?.tags ?? [])]);
  let tagInput = $state("");
  let busy = $state(false);

  const uid = Math.random().toString(36).slice(2, 8);
  const openTagSuggestions = $derived(tagSuggestions.filter(t => !tags.includes(t)));

  function addTag(raw: string) {
    const parts = raw
      .split(",")
      .map(t => t.trim().slice(0, 50))
      .filter(Boolean);
    for (const t of parts) {
      if (tags.length >= 30) break;
      if (!tags.some(x => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
  }

  function onTagKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      if (tagInput.trim()) {
        e.preventDefault();
        addTag(tagInput);
        tagInput = "";
      } else if (e.key === ",") e.preventDefault();
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      tags.pop();
    }
  }

  function onTagInput() {
    // Komma beim Einfügen/mobilen Tastaturen
    if (tagInput.includes(",")) {
      const idx = tagInput.lastIndexOf(",");
      addTag(tagInput.slice(0, idx));
      tagInput = tagInput.slice(idx + 1);
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (tagInput.trim()) {
      addTag(tagInput);
      tagInput = "";
    }
    busy = true;
    try {
      const body = {
        name: name.trim(),
        role: role.trim(),
        faction: faction.trim(),
        location: location.trim(),
        status,
        attitude,
        relation: relation.trim(),
        description,
        notes,
        tags: [...tags],
      };
      const base = campaignApi(campaignId, "npcs");
      const saved = initial ? await patch<Npc>(`${base}/${initial.id}`, body) : await post<Npc>(base, body);
      onsaved(saved);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={initial ? `${initial.name} bearbeiten` : "NPC hinzufügen"} size="lg" {onclose}>
  <form id="npc-form-{uid}" onsubmit={save}>
    <div class="grid-2 cols">
      <div class="field">
        <label for="n-name-{uid}">Name *</label>
        <input id="n-name-{uid}" class="input" bind:value={name} required maxlength="200" placeholder="z. B. Ireena Kolyana" />
      </div>
      <div class="field">
        <label for="n-role-{uid}">Rolle</label>
        <input id="n-role-{uid}" class="input" bind:value={role} maxlength="200" placeholder="z. B. Bürgermeisterstochter" />
      </div>
      <div class="field">
        <label for="n-faction-{uid}">Fraktion</label>
        <input id="n-faction-{uid}" class="input" bind:value={faction} maxlength="200" list="n-factions-{uid}" placeholder="z. B. Die Harfner" />
        <datalist id="n-factions-{uid}">
          {#each factions as f (f)}<option value={f}></option>{/each}
        </datalist>
      </div>
      <div class="field">
        <label for="n-location-{uid}">Ort</label>
        <input id="n-location-{uid}" class="input" bind:value={location} maxlength="200" list="n-locations-{uid}" placeholder="z. B. Barovia" />
        <datalist id="n-locations-{uid}">
          {#each locations as l (l)}<option value={l}></option>{/each}
        </datalist>
      </div>
    </div>

    <div class="field">
      <label for="n-status-{uid}">Status</label>
      <select id="n-status-{uid}" class="select status" bind:value={status}>
        {#each STATUSES as s (s.value)}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </div>

    <fieldset class="group">
      <legend class="label">Beziehung zu dir / zur Gruppe</legend>
      <div class="field">
        <span class="label sub">Haltung</span>
        <AttitudePicker bind:value={attitude} label="Haltung gegenüber dir / der Gruppe" />
      </div>
      <div class="field last">
        <label for="n-relation-{uid}" class="sub">In Worten</label>
        <input
          id="n-relation-{uid}"
          class="input"
          bind:value={relation}
          maxlength="500"
          placeholder="z. B. Schuldet uns einen Gefallen, misstraut dem Paladin"
        />
      </div>
    </fieldset>

    <div class="field">
      <label for="n-tags-{uid}">Schlagwörter</label>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="tag-input" onclick={e => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {#each tags as t, i (t)}
          <span class="tag">
            {t}
            <button type="button" aria-label="Schlagwort {t} entfernen" onclick={() => tags.splice(i, 1)}><X size={12} /></button>
          </span>
        {/each}
        <input
          id="n-tags-{uid}"
          bind:value={tagInput}
          onkeydown={onTagKey}
          oninput={onTagInput}
          onblur={() => {
            if (tagInput.trim()) {
              addTag(tagInput);
              tagInput = "";
            }
          }}
          list="n-tagsugg-{uid}"
          maxlength="60"
          placeholder={tags.length ? "" : "Mit Enter oder Komma trennen"}
        />
        <datalist id="n-tagsugg-{uid}">
          {#each openTagSuggestions as t (t)}<option value={t}></option>{/each}
        </datalist>
      </div>
    </div>

    <div class="field">
      <label for="n-desc-{uid}">Beschreibung</label>
      <textarea
        id="n-desc-{uid}"
        class="textarea"
        bind:value={description}
        maxlength="20000"
        placeholder="Aussehen, Auftreten, Hintergrund … (Markdown möglich)"
      ></textarea>
    </div>
    <div class="field">
      <label for="n-notes-{uid}">Notizen</label>
      <textarea
        id="n-notes-{uid}"
        class="textarea"
        bind:value={notes}
        maxlength="50000"
        placeholder="Was wir erfahren haben, Versprechen, Geheimnisse … (Markdown möglich)"
      ></textarea>
    </div>
  </form>

  {#snippet footer()}
    <button type="button" class="btn btn-ghost" onclick={onclose}>Abbrechen</button>
    <button type="submit" form="npc-form-{uid}" class="btn btn-primary" disabled={busy || !name.trim()}>
      {initial ? "Speichern" : "Hinzufügen"}
    </button>
  {/snippet}
</Modal>

<style>
  .cols { column-gap: 0.85rem; row-gap: 0; }
  .status { max-width: 260px; }
  .group {
    margin: 0 0 0.85rem;
    padding: 0.75rem 0.85rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--surface-2) 50%, transparent);
    min-width: 0;
  }
  .group legend { padding: 0 0.35rem; }
  .sub { text-transform: none; letter-spacing: 0; font-size: 0.8rem; }
  .last { margin-bottom: 0; }
  .tag-input {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    min-height: 38px;
    padding: 0.3rem 0.45rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg);
    cursor: text;
  }
  .tag-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .tag-input input {
    flex: 1;
    min-width: 8rem;
    border: 0;
    outline: none;
    background: transparent;
    padding: 0.15rem 0.2rem;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.05rem 0.2rem 0.05rem 0.55rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.82rem;
    font-weight: 550;
  }
  .tag button {
    display: inline-grid;
    place-items: center;
    width: 1.2rem;
    height: 1.2rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .tag button:hover { background: color-mix(in oklab, var(--accent) 25%, transparent); }
  @media (max-width: 560px) {
    .cols { grid-template-columns: 1fr; }
    .status { max-width: none; }
  }
</style>
