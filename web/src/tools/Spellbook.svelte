<script lang="ts">
  import { onDestroy } from "svelte";
  import { BookPlus, ExternalLink, PenLine, Search, Star, Wand, X } from "@lucide/svelte";
  import { ApiError, campaignApi, del, get, patch, post, put } from "../lib/api";
  import {
    classSummary,
    normalizeCharacter,
    spellAttackBonus,
    spellSaveDc,
    type CharacterData,
  } from "../lib/character";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { ABILITY_NAMES, SPELL_LEVEL_NAMES, formatMod } from "../lib/dnd";
  import { navigate, route } from "../lib/router.svelte";
  import { toast, toastError } from "../lib/toast.svelte";
  import type { Campaign, CharacterRecord, Spell, SrdSpell } from "../lib/types";
  import SlotTracker from "./spellbook/SlotTracker.svelte";
  import SpellEditor from "./spellbook/SpellEditor.svelte";
  import SpellRow from "./spellbook/SpellRow.svelte";
  import SrdBrowser from "./spellbook/SrdBrowser.svelte";
  import { isPrepared, schoolName, type RollChar } from "./spellbook/spells";

  let { campaign }: { campaign: Campaign } = $props();

  type CharEntry = { record: CharacterRecord; data: CharacterData };

  let spells = $state<Spell[]>([]);
  let chars = $state<CharEntry[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);

  let query = $state("");
  let levelFilter = $state<number | null>(null);
  let onlyPrepared = $state(false);
  let onlyFavorites = $state(false);

  let srdOpen = $state(false);
  let editing = $state<Spell | "new" | null>(null);

  const spellUrl = $derived(campaignApi(campaign.id, "spells"));
  const charUrl = $derived(campaignApi(campaign.id, "characters"));

  // ── Laden ──────────────────────────────────────────────────────────────
  $effect(() => {
    const id = campaign.id;
    let alive = true;
    loaded = false;
    error = null;
    Promise.all([
      get<Spell[]>(campaignApi(id, "spells")),
      get<CharacterRecord[]>(campaignApi(id, "characters")),
    ])
      .then(([s, c]) => {
        if (!alive) return;
        spells = s;
        chars = c
          .map(record => ({ record, data: normalizeCharacter(record.data) }))
          .sort((a, b) => a.record.name.localeCompare(b.record.name, "de"));
        loaded = true;
      })
      .catch(e => alive && (error = (e as Error).message));
    return () => {
      alive = false;
    };
  });

  // ── Charakterauswahl (in der URL: ?charakter=<id> bzw. ?charakter=ohne) ──
  const selParam = $derived(new URLSearchParams(route.search).get("charakter") ?? "");
  const selected = $derived(
    selParam && selParam !== "ohne" && loaded && !chars.some(c => c.record.id === selParam) ? "" : selParam
  );
  const selectedChar = $derived(chars.find(c => c.record.id === selected) ?? null);

  function select(value: string) {
    const q = value ? `?charakter=${encodeURIComponent(value)}` : "";
    navigate(`/k/${campaign.id}/zauberbuch${q}`, { replace: true });
  }

  const rollChars = $derived(
    new Map<string, RollChar>(chars.map(c => [c.record.id, { id: c.record.id, name: c.record.name, data: c.data }]))
  );

  function rollCharFor(spell: Spell): RollChar | null {
    if (spell.characterId) return rollChars.get(spell.characterId) ?? null;
    return selectedChar ? (rollChars.get(selectedChar.record.id) ?? null) : null;
  }

  const targetLabel = $derived(selectedChar ? selectedChar.record.name : "Ohne Charakter");

  // ── Filter & Gruppierung ───────────────────────────────────────────────
  const scoped = $derived(
    spells.filter(s =>
      selected === "" ? true : selected === "ohne" ? !s.characterId : s.characterId === selected
    )
  );
  const levelsPresent = $derived([...new Set(scoped.map(s => s.level))].sort((a, b) => a - b));
  const activeLevel = $derived(levelFilter != null && levelsPresent.includes(levelFilter) ? levelFilter : null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(
      s =>
        (!q ||
          s.name.toLowerCase().includes(q) ||
          schoolName(s.data.school).toLowerCase().includes(q) ||
          (s.data.school ?? "").toLowerCase().includes(q)) &&
        (activeLevel == null || s.level === activeLevel) &&
        (!onlyPrepared || isPrepared(s)) &&
        (!onlyFavorites || s.favorite)
    );
  });

  const groups = $derived.by(() => {
    const map = new Map<number, Spell[]>();
    for (const s of filtered) {
      if (!map.has(s.level)) map.set(s.level, []);
      map.get(s.level)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([level, list]) => ({ level, list }));
  });

  const filtersActive = $derived(Boolean(query.trim()) || activeLevel != null || onlyPrepared || onlyFavorites);

  function resetFilters() {
    query = "";
    levelFilter = null;
    onlyPrepared = false;
    onlyFavorites = false;
  }

  const sortSpells = (list: Spell[]) =>
    list.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "de"));

  // ── Zauber bearbeiten ──────────────────────────────────────────────────
  async function patchSpell(spell: Spell, changes: Partial<Spell>) {
    const i = spells.findIndex(s => s.id === spell.id);
    if (i < 0) return;
    const before = { ...spells[i]! };
    spells[i] = { ...before, ...changes };
    try {
      const saved = await patch<Spell>(`${spellUrl}/${spell.id}`, changes);
      const j = spells.findIndex(s => s.id === spell.id);
      if (j >= 0) spells[j] = saved;
    } catch (e) {
      const j = spells.findIndex(s => s.id === spell.id);
      if (j >= 0) spells[j] = before;
      toastError(e);
    }
  }

  async function removeSpell(spell: Spell) {
    const ok = await confirmDialog(`„${spell.name}“ aus dem Zauberbuch entfernen?`, { title: "Zauber löschen" });
    if (!ok) return;
    try {
      await del(`${spellUrl}/${spell.id}`);
      spells = spells.filter(s => s.id !== spell.id);
      toast("Zauber gelöscht.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  function onSaved(saved: Spell) {
    const isNew = editing === "new";
    const i = spells.findIndex(s => s.id === saved.id);
    if (i >= 0) spells[i] = saved;
    else spells.push(saved);
    sortSpells(spells);
    editing = null;
    toast(isNew ? `„${saved.name}“ angelegt.` : "Gespeichert.", "success");
  }

  async function addFromSrd(s: SrdSpell) {
    const { key, name, level, ...data } = s;
    try {
      const created = await post<Spell>(spellUrl, {
        srdKey: key,
        name,
        level,
        data,
        characterId: selectedChar?.record.id ?? null,
      });
      spells.push(created);
      sortSpells(spells);
      toast(`„${name}“ hinzugefügt.`, "success");
    } catch (e) {
      toastError(e);
    }
  }

  // ── Zauberplätze (Charakter speichern, entprellt) ──────────────────────
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Set<string>();
  const dirty = new Set<string>();

  function scheduleSave(id: string) {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void saveChar(id);
      }, 600)
    );
  }

  async function saveChar(id: string) {
    if (inflight.has(id)) {
      dirty.add(id);
      return;
    }
    const entry = chars.find(c => c.record.id === id);
    if (!entry) return;
    inflight.add(id);
    try {
      const raw = entry.record.data;
      const rawSc = raw.spellcasting && typeof raw.spellcasting === "object" ? raw.spellcasting : {};
      // Nur die Zauberplätze ändern, alle übrigen Daten unverändert zurückschreiben
      const data = { ...raw, spellcasting: { ...rawSc, ...$state.snapshot(entry.data.spellcasting) } };
      const row = await put<CharacterRecord>(`${charUrl}/${id}`, {
        name: entry.record.name,
        data,
        revision: entry.record.revision,
      });
      entry.record = row;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        dirty.delete(id);
        await reloadChar(id);
        toast("Der Charakter wurde inzwischen anderswo geändert und neu geladen. Bitte Zauberplätze prüfen.", "error", 6000);
      } else {
        toastError(e);
      }
    } finally {
      inflight.delete(id);
      if (dirty.delete(id)) void saveChar(id);
    }
  }

  async function reloadChar(id: string) {
    try {
      const row = await get<CharacterRecord>(`${charUrl}/${id}`);
      const entry = chars.find(c => c.record.id === id);
      if (entry) {
        entry.record = row;
        entry.data = normalizeCharacter(row.data);
      }
    } catch (e) {
      toastError(e);
    }
  }

  onDestroy(() => {
    // Ausstehende Änderungen nicht verlieren
    for (const [id, t] of timers) {
      clearTimeout(t);
      void saveChar(id);
    }
    timers.clear();
  });

  function entryById(id: string) {
    return chars.find(c => c.record.id === id) ?? null;
  }

  function setSlot(id: string, level: number | "pact", used: number) {
    const entry = entryById(id);
    if (!entry) return;
    const sc = entry.data.spellcasting;
    const slot = level === "pact" ? sc.pact : sc.slots[level - 1];
    if (!slot) return;
    slot.used = Math.max(0, Math.min(slot.max, used));
    scheduleSave(id);
  }

  function resetSlots(id: string) {
    const entry = entryById(id);
    if (!entry) return;
    for (const s of entry.data.spellcasting.slots) s.used = 0;
    entry.data.spellcasting.pact.used = 0;
    scheduleSave(id);
    toast("Alle Zauberplätze wieder frei.", "success");
  }

  function cast(spell: Spell, char: RollChar, slot: number | "pact") {
    const entry = entryById(char.id);
    if (!entry) return;
    const sc = entry.data.spellcasting;
    const s = slot === "pact" ? sc.pact : sc.slots[slot - 1];
    if (!s || s.used >= s.max) {
      toast("Kein freier Zauberplatz dieses Grades.", "error");
      return;
    }
    s.used += 1;
    scheduleSave(char.id);
    toast(
      slot === "pact" ? `Paktplatz (Grad ${sc.pact.level}) verbraucht – ${spell.name}` : `Grad-${slot}-Zauberplatz verbraucht`,
      "success"
    );
  }

  const hasSlots = (d: CharacterData) => d.spellcasting.slots.some(s => s.max > 0) || d.spellcasting.pact.max > 0;
</script>

<div class="page-header">
  <div>
    <h1>Zauberbuch</h1>
    <p class="muted">Zauber vorbereiten, wirken und würfeln.</p>
  </div>
  <div class="row header-actions">
    <button class="btn btn-primary" onclick={() => (srdOpen = true)} disabled={!loaded}>
      <BookPlus size={16} /> Aus SRD hinzufügen
    </button>
    <button class="btn" onclick={() => (editing = "new")} disabled={!loaded}><PenLine size={16} /> Eigener Zauber</button>
  </div>
</div>

{#if error}
  <div class="empty">
    <h3>Zauberbuch konnte nicht geladen werden</h3>
    <p>{error}</p>
  </div>
{:else if !loaded}
  <div class="loading"><div class="spinner"></div></div>
{:else}
  <div class="toolbar">
    <label class="char-select">
      <span class="label">Charakter</span>
      <select class="select" value={selected} onchange={e => select((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">Alle Zauber</option>
        {#each chars as c (c.record.id)}
          <option value={c.record.id}>{c.record.name}</option>
        {/each}
        <option value="ohne">Ohne Charakter</option>
      </select>
    </label>
  </div>

  {#if selectedChar}
    {@const d = selectedChar.data}
    {@const ab = d.spellcasting.ability}
    {@const sheet = `/k/${campaign.id}/charaktere/${selectedChar.record.id}`}
    <section class="card char-card">
      <div class="row-between char-head">
        <div class="grow">
          <h2 class="truncate">{selectedChar.record.name}</h2>
          {#if classSummary(d)}<span class="small muted">{classSummary(d)}</span>{/if}
        </div>
        <a class="btn btn-ghost btn-sm" href={sheet}><ExternalLink size={14} /> Charakterbogen</a>
      </div>
      {#if ab}
        <div class="stats">
          <div class="stat">
            <span class="label">Zauberattribut</span>
            <strong>{ABILITY_NAMES[ab]}</strong>
          </div>
          <div class="stat">
            <span class="label">Zauberangriff</span>
            <strong class="mono">{formatMod(spellAttackBonus(d))}</strong>
          </div>
          <div class="stat">
            <span class="label">Zauber-SG</span>
            <strong class="mono">{spellSaveDc(d)}</strong>
          </div>
        </div>
      {:else}
        <p class="hint small">
          Für {selectedChar.record.name} ist kein Zauberattribut festgelegt. Trage es im
          <a href={sheet}>Charakterbogen</a> ein, damit Angriffsbonus und SG berechnet werden.
        </p>
      {/if}
      {#if hasSlots(d)}
        <SlotTracker
          data={d}
          onset={(level, used) => setSlot(selectedChar.record.id, level, used)}
          onreset={() => resetSlots(selectedChar.record.id)}
        />
      {:else if ab}
        <p class="tiny faint no-slots">Keine Zauberplätze eingetragen – im <a href={sheet}>Charakterbogen</a> festlegen.</p>
      {/if}
    </section>
  {/if}

  {#if scoped.length}
    <div class="filters">
      <label class="search">
        <span class="sr-only">Zauber suchen</span>
        <Search size={16} />
        <input class="input" type="search" placeholder="Zauber suchen …" bind:value={query} />
      </label>
      <div class="chip-row levels" role="group" aria-label="Grad filtern">
        <button class="chip" aria-pressed={activeLevel == null} onclick={() => (levelFilter = null)}>Alle</button>
        {#each levelsPresent as l (l)}
          <button class="chip" aria-pressed={activeLevel === l} onclick={() => (levelFilter = activeLevel === l ? null : l)}>
            {l === 0 ? "Zaubertricks" : l}
          </button>
        {/each}
      </div>
      <div class="row toggles">
        <button class="chip" aria-pressed={onlyPrepared} onclick={() => (onlyPrepared = !onlyPrepared)}>
          <Wand size={14} /> Nur vorbereitete
        </button>
        <button class="chip" aria-pressed={onlyFavorites} onclick={() => (onlyFavorites = !onlyFavorites)}>
          <Star size={14} /> Nur Favoriten
        </button>
        {#if filtersActive}
          <button class="btn btn-ghost btn-sm" onclick={resetFilters}><X size={14} /> Filter zurücksetzen</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if !scoped.length}
    <div class="empty">
      <div class="empty-icon"><Wand size={30} /></div>
      {#if !spells.length}
        <h3>Dein Zauberbuch ist noch leer</h3>
        <p>Übernimm Zauber aus dem SRD ({campaign.ruleset === "2024" ? "5e 2024" : "5e 2014"}) oder lege eigene an.</p>
      {:else if selected === "ohne"}
        <h3>Keine Zauber ohne Charakter</h3>
        <p>Alle Zauber sind einem Charakter zugeordnet.</p>
      {:else}
        <h3>{targetLabel} hat noch keine Zauber</h3>
        <p>Neue Zauber werden automatisch {targetLabel} zugeordnet.</p>
      {/if}
      <div class="row empty-actions">
        <button class="btn btn-primary" onclick={() => (srdOpen = true)}><BookPlus size={16} /> Aus SRD hinzufügen</button>
        <button class="btn" onclick={() => (editing = "new")}><PenLine size={16} /> Eigener Zauber</button>
      </div>
    </div>
  {:else if !filtered.length}
    <div class="empty">
      <h3>Keine Treffer</h3>
      <p>Keine Zauber passen zu den Filtern.</p>
      <button class="btn" onclick={resetFilters}>Filter zurücksetzen</button>
    </div>
  {:else}
    {#each groups as g (g.level)}
      <section class="group">
        <h3 class="group-head">
          {SPELL_LEVEL_NAMES[g.level]}
          <span class="badge">{g.list.length}</span>
          {#if selectedChar && g.level > 0}
            {@const slot = selectedChar.data.spellcasting.slots[g.level - 1]}
            {#if slot && slot.max > 0}
              <span class="tiny muted slot-info">{Math.max(0, slot.max - slot.used)}/{slot.max} Plätze frei</span>
            {/if}
          {/if}
        </h3>
        <div class="list">
          {#each g.list as spell (spell.id)}
            {@const rc = rollCharFor(spell)}
            <SpellRow
              {spell}
              char={rc}
              ownerName={spell.characterId ? (rollChars.get(spell.characterId)?.name ?? null) : null}
              showOwner={selected === ""}
              ruleset={campaign.ruleset}
              onpatch={changes => patchSpell(spell, changes)}
              onedit={() => (editing = spell)}
              ondelete={() => removeSpell(spell)}
              oncast={slot => rc && cast(spell, rc, slot)}
            />
          {/each}
        </div>
      </section>
    {/each}
  {/if}
{/if}

{#if srdOpen}
  <SrdBrowser
    ruleset={campaign.ruleset}
    {spells}
    characterId={selectedChar?.record.id ?? null}
    {targetLabel}
    onadd={addFromSrd}
    onclose={() => (srdOpen = false)}
  />
{/if}

{#if editing}
  <SpellEditor
    campaignId={campaign.id}
    spell={editing === "new" ? null : editing}
    characters={chars.map(c => ({ id: c.record.id, name: c.record.name }))}
    defaultCharacterId={selectedChar?.record.id ?? null}
    onsaved={onSaved}
    onclose={() => (editing = null)}
  />
{/if}

<style>
  .loading { display: grid; place-items: center; padding: 3rem; }
  .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
  .char-select { display: flex; flex-direction: column; gap: 0.3rem; min-width: min(100%, 260px); }
  .char-card { margin-bottom: 1rem; }
  .char-head h2 { margin: 0; font-size: 1.15rem; }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin-top: 0.8rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    min-width: 0;
  }
  .stat .label { font-size: 0.68rem; }
  .stat strong { font-size: 1.25rem; font-family: var(--font-display); overflow: hidden; text-overflow: ellipsis; }
  .hint {
    margin: 0.8rem 0 0;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--warning) 14%, transparent);
  }
  .no-slots { margin: 0.7rem 0 0; }
  .filters { display: flex; flex-direction: column; gap: 0.55rem; margin-bottom: 1rem; }
  .search { position: relative; display: block; max-width: 420px; }
  .search :global(svg) { position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%); color: var(--faint); }
  .search .input { padding-left: 2.1rem; }
  .toggles { gap: 0.35rem; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 32px;
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-weight: 550;
    font-size: 0.85rem;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .chip:hover { border-color: var(--accent); color: var(--text); }
  .chip[aria-pressed="true"] {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
    color: var(--accent-contrast);
  }
  .levels .chip { min-width: 34px; justify-content: center; }
  .group { margin-bottom: 1.2rem; }
  .group-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    margin: 0 0 0.5rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
  }
  .slot-info { margin-left: auto; font-family: var(--font-body); font-weight: 500; }
  .list { display: flex; flex-direction: column; gap: 0.35rem; }
  .empty-icon { color: var(--accent); margin-bottom: 0.4rem; }
  .empty-actions { justify-content: center; margin-top: 0.4rem; }
  @media (max-width: 480px) {
    .header-actions { width: 100%; }
    .header-actions .btn { flex: 1; }
    .stats { gap: 0.35rem; }
    .stat { padding: 0.45rem 0.5rem; }
    .stat strong { font-size: 1.05rem; }
    .search { max-width: none; }
  }
</style>
