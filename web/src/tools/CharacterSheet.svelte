<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ArrowLeft, Check, CloudOff, GitFork, Moon, Pencil, Play, RefreshCw, Skull, Sunrise } from "@lucide/svelte";
  import { ApiError, get, put } from "../lib/api";
  import {
    classSummary,
    longRest,
    normalizeCharacter,
    shortRest,
    totalLevel,
    type CharacterData,
  } from "../lib/character";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { rulesTerms } from "../lib/dnd";
  import { debounce } from "../lib/format";
  import { d20Request, isPhysical, openRoll } from "../lib/roller.svelte";
  import { route } from "../lib/router.svelte";
  import { toast } from "../lib/toast.svelte";
  import type { Campaign, CharacterRecord, Ruleset } from "../lib/types";
  import { rulesetLabel } from "../lib/themes";
  import { setSheet } from "./character/context";
  import Abilities from "./character/Abilities.svelte";
  import Skills from "./character/Skills.svelte";
  import Vitals from "./character/Vitals.svelte";
  import Attacks from "./character/Attacks.svelte";
  import Combat from "./character/Combat.svelte";
  import Spellcasting from "./character/Spellcasting.svelte";
  import Details from "./character/Details.svelte";
  import TextBlocks from "./character/TextBlocks.svelte";
  import Currency from "./character/Currency.svelte";
  import RollLog from "./character/RollLog.svelte";
  import Features from "./character/Features.svelte";
  import CombatAssistant from "./character/CombatAssistant.svelte";
  import AttackWizard from "./character/AttackWizard.svelte";
  import { useFeature, type Feature } from "../lib/features";
  import type { Attack } from "../lib/character";

  /** Ohne Kampagne: Bogen aus „Meine Charaktere“ geöffnet. */
  let { characterId, campaign = null }: { characterId: string; campaign?: Campaign | null } = $props();

  type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
  type Tab = "werte" | "kampf" | "faehigkeiten" | "zauber" | "inventar" | "merkmale" | "notizen";

  let record = $state<CharacterRecord | null>(null);
  let data = $state<CharacterData>(normalizeCharacter({}));
  let name = $state("");
  let ruleset = $state<Ruleset>("2024");
  let loadError = $state<string | null>(null);
  let saveState = $state<SaveState>("saved");
  let editing = $state(new URLSearchParams(route.search).has("bearbeiten"));
  let tab = $state<Tab>(readTab());
  let attackWizard = $state<Attack | null>(null);

  const url = $derived(`/api/characters/${characterId}`);
  const terms = $derived(rulesTerms(ruleset));
  const backHref = $derived(campaign ? `/k/${campaign.id}/charaktere` : "/charaktere");

  function readTab(): Tab {
    try {
      return (sessionStorage.getItem("db-sheet-tab") as Tab) || "werte";
    } catch {
      return "werte";
    }
  }

  $effect(() => {
    try {
      sessionStorage.setItem("db-sheet-tab", tab);
    } catch {
      /* ignorieren */
    }
  });

  setSheet({
    get ruleset() {
      return ruleset;
    },
    get editing() {
      return editing;
    },
    get data() {
      return data;
    },
    get campaignId() {
      return campaign?.id ?? null;
    },
    get characterId() {
      return characterId;
    },
    rollD20(title, modifier, kind, opts = {}) {
      openRoll(
        d20Request({
          title,
          subtitle: opts.subtitle,
          modifier,
          kind,
          ruleset,
          exhaustion: data.exhaustion,
          rollMode: data.rollMode,
          target: opts.target,
          followUp: opts.damage ? { ...opts.damage, canCrit: true } : undefined,
        })
      );
    },
    rollDamage(title, dice, opts = {}) {
      openRoll({
        type: "damage",
        title,
        subtitle: opts.subtitle,
        dice,
        damageType: opts.damageType,
        heal: opts.heal,
        canCrit: !opts.heal,
        physical: isPhysical(data.rollMode),
      });
    },
    useFeature(f: Feature) {
      for (const note of useFeature(data, f)) toast(note);
      const dice = f.damage.trim();
      // Fähigkeiten, die an Treffer/Angriffe gebunden sind, wirken erst im Angriff
      const attackBound = f.triggers.includes("hit") || f.triggers.includes("attack");
      if (dice && !attackBound && (f.effectType === "damage" || f.effectType === "healing")) {
        this.rollDamage(f.name, dice, {
          heal: f.effectType === "healing",
          damageType: f.damageType || undefined,
          subtitle: f.save ? `Rettungswurf: ${f.save}` : undefined,
        });
      } else {
        toast(`${f.name} eingesetzt${f.benefit ? `: ${f.benefit}` : "."}`, "success");
      }
    },
    openAttack(a: Attack) {
      attackWizard = a;
    },
  });

  onMount(() => {
    void load();
    const flushOnHide = () => {
      if (document.visibilityState === "hidden" && saveState === "dirty") save.flush();
    };
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      if (saveState === "dirty") save.flush();
    };
  });

  let lastSaved = "";

  async function load() {
    try {
      const r = await get<CharacterRecord>(url);
      record = r;
      data = normalizeCharacter(r.data);
      name = r.name;
      ruleset = r.ruleset;
      lastSaved = snapshot();
      saveState = "saved";
    } catch (e) {
      loadError = (e as Error).message;
    }
  }

  function snapshot() {
    return JSON.stringify({ name, ruleset, data: $state.snapshot(data) });
  }

  const save = debounce(async () => {
    if (!record) return;
    const current = snapshot();
    if (current === lastSaved) {
      saveState = "saved";
      return;
    }
    saveState = "saving";
    try {
      const body = JSON.parse(current) as { name: string; ruleset: Ruleset; data: CharacterData };
      const updated = await put<CharacterRecord>(url, {
        name: body.name.trim() || "Unbenannt",
        ruleset: body.ruleset,
        data: body.data,
        revision: record.revision,
      });
      record.revision = updated.revision;
      lastSaved = current;
      saveState = snapshot() === current ? "saved" : "dirty";
      if (saveState === "dirty") save();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) saveState = "conflict";
      else {
        saveState = "error";
        setTimeout(() => saveState === "error" && save(), 5000);
      }
    }
  }, 700);

  // Jede Änderung am Bogen speichert automatisch
  $effect(() => {
    if (!record) return;
    const current = snapshot();
    untrack(() => {
      if (current !== lastSaved && saveState !== "conflict" && saveState !== "saving") {
        saveState = "dirty";
        save();
      }
    });
  });

  async function resolveConflict(keepMine: boolean) {
    if (keepMine) {
      const latest = await get<CharacterRecord>(url);
      record!.revision = latest.revision;
      saveState = "dirty";
      save.flush();
    } else {
      await load();
      toast("Bogen neu geladen.");
    }
  }

  async function rest(kind: "short" | "long") {
    const ok = await confirmDialog(
      kind === "short"
        ? "Kurze Rast: Paktplätze und Ressourcen „kurze Rast“ werden zurückgesetzt. Trefferwürfel kannst du im Tab Kampf ausgeben."
        : `Lange Rast: TP voll, alle Zauberplätze und Ressourcen zurück, ${ruleset === "2024" ? "alle" : "die Hälfte der"} Trefferwürfel zurück, Erschöpfung −1.`,
      { title: kind === "short" ? "Kurze Rast" : "Lange Rast", confirmLabel: "Rasten", danger: false }
    );
    if (!ok) return;
    if (kind === "short") shortRest(data);
    else longRest(data, ruleset);
    toast(kind === "short" ? "Kurze Rast beendet." : "Lange Rast beendet.", "success");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "werte", label: "Werte" },
    { key: "kampf", label: "Kampf" },
    { key: "faehigkeiten", label: "Fähigkeiten" },
    { key: "zauber", label: "Zauber" },
    { key: "inventar", label: "Inventar" },
    { key: "merkmale", label: "Merkmale" },
    { key: "notizen", label: "Notizen" },
  ];
</script>

{#if loadError}
  <div class="empty">
    <h3>Charakter nicht gefunden</h3>
    <p>{loadError}</p>
    <a class="btn" href={backHref}>Zurück zur Liste</a>
  </div>
{:else if !record}
  <div class="spinner"></div>
{:else}
  <div class="sheet-header">
    <a class="btn btn-ghost btn-icon back" href={backHref} aria-label="Zurück zur Liste"><ArrowLeft size={18} /></a>
    <div class="grow title">
      <h1 class="truncate">{name || "Unbenannt"}</h1>
      <p class="muted small truncate">
        {[data.species, classSummary(data) || `Stufe ${totalLevel(data)}`, data.background].filter(Boolean).join(" · ")}
        · {isPhysical(data.rollMode) ? "Echte Würfel" : "Digitale Würfel"}
      </p>
      <div class="chip-row meta">
        <span class="badge">{rulesetLabel(ruleset)}</span>
        {#if record.status === "dead"}<span class="badge badge-danger"><Skull size={12} /> Verstorben</span>{/if}
        {#if record.status === "retired"}<span class="badge">Im Ruhestand</span>{/if}
        {#if record.forkedFromName}<span class="badge"><GitFork size={12} /> Kopie von {record.forkedFromName}</span>{/if}
        {#each (record.campaigns ?? []).filter(c => c.active) as c (c.campaignId)}
          <a class="badge campaign-link" href="/k/{c.campaignId}/charaktere/{record.id}">{c.name}</a>
        {/each}
      </div>
      {#if campaign && campaign.ruleset !== ruleset}
        <p class="tiny warn-text">Dieser Charakter nutzt {rulesetLabel(ruleset)}, die Kampagne {rulesetLabel(campaign.ruleset)}.</p>
      {/if}
    </div>
    <span class="save-state small" class:warn={saveState === "error" || saveState === "conflict"} aria-live="polite">
      {#if saveState === "saved"}<Check size={14} /> Gespeichert
      {:else if saveState === "error"}<CloudOff size={14} /> Offline – erneuter Versuch …
      {:else if saveState === "conflict"}Konflikt
      {:else}<RefreshCw size={14} class="spin" /> Speichert …{/if}
    </span>
    <div class="row actions">
      <div class="segmented" role="group" aria-label="Modus">
        <button aria-pressed={!editing} onclick={() => (editing = false)}><Play size={14} /> Spielen</button>
        <button aria-pressed={editing} onclick={() => (editing = true)}><Pencil size={14} /> Bearbeiten</button>
      </div>
      <button class="btn btn-sm" onclick={() => rest("short")}><Sunrise size={15} /> Kurze Rast</button>
      <button class="btn btn-sm" onclick={() => rest("long")}><Moon size={15} /> Lange Rast</button>
    </div>
  </div>

  {#if saveState === "conflict"}
    <div class="conflict card">
      <p><strong>Dieser Bogen wurde inzwischen auf einem anderen Gerät geändert.</strong> Welche Version soll gelten?</p>
      <div class="row">
        <button class="btn" onclick={() => resolveConflict(false)}>Andere Version laden</button>
        <button class="btn btn-primary" onclick={() => resolveConflict(true)}>Meine Version behalten</button>
      </div>
    </div>
  {/if}

  {#if editing}
    <p class="edit-hint small">
      Bearbeiten-Modus: Werte ändern. Im Spielen-Modus tippst du auf Attribute, Rettungswürfe, Fertigkeiten und Angriffe, um zu würfeln.
    </p>
  {/if}

  <Vitals />

  <div class="tabs" role="tablist">
    {#each tabs as t (t.key)}
      <button role="tab" aria-selected={tab === t.key} class:active={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>
    {/each}
  </div>

  <div class="tab-content">
    {#if tab === "werte"}
      {#if editing}<Details bind:name bind:ruleset />{/if}
      <div class="werte">
        <Abilities />
        <Skills />
      </div>
    {:else if tab === "kampf"}
      <CombatAssistant />
      <Attacks />
      <Combat />
    {:else if tab === "faehigkeiten"}
      <Features />
    {:else if tab === "zauber"}
      <Spellcasting />
    {:else if tab === "inventar"}
      <Currency />
      <TextBlocks
        fields={[
          { key: "equipment", label: "Ausrüstung", placeholder: "- Langschwert\n- Kettenhemd\n- Rucksack mit …" },
          { key: "proficiencies", label: "Übung mit Rüstungen, Waffen & Werkzeugen" },
          { key: "languages", label: "Sprachen" },
        ]}
      />
    {:else if tab === "merkmale"}
      <TextBlocks
        fields={[
          { key: "featureNotes", label: "Weitere Merkmale (Freitext)", placeholder: "Was nicht als Fähigkeit erfasst werden muss …" },
          { key: "personality", label: "Persönlichkeit, Ideale, Bindungen, Makel" },
          { key: "appearance", label: "Aussehen" },
          { key: "backstory", label: "Hintergrundgeschichte" },
        ]}
      />
    {:else if tab === "notizen"}
      <TextBlocks fields={[{ key: "notes", label: "Notizen", alwaysEdit: true, placeholder: "Alles, was sonst nirgends hinpasst …" }]} />
    {/if}
    <RollLog />
  </div>
{/if}

{#if attackWizard}
  <AttackWizard attack={attackWizard} onclose={() => (attackWizard = null)} />
{/if}

<style>
  .sheet-header {
    display: flex;
    align-items: center;
    gap: 0.6rem 0.9rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .back { margin-left: -0.4rem; }
  .title { min-width: 12rem; }
  .title h1 { margin: 0; }
  .title p { margin: 0.15rem 0 0; }
  .meta { margin-top: 0.35rem; gap: 0.3rem; }
  .meta .badge { font-size: 0.7rem; }
  .campaign-link { color: var(--accent-text); }
  .warn-text { color: var(--warning); margin-top: 0.3rem !important; }
  .actions { gap: 0.4rem; }
  .segmented button { display: inline-flex; align-items: center; gap: 0.3rem; }
  .save-state { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--muted); }
  .save-state.warn { color: var(--danger); }
  .save-state :global(.spin) { animation: spin 1s linear infinite; }
  .conflict { border-color: var(--warning); margin-bottom: 1rem; }
  .edit-hint {
    padding: 0.5rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .tabs {
    display: flex;
    gap: 0.2rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
    scrollbar-width: none;
  }
  .tabs button {
    padding: 0.55rem 0.9rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button.active { color: var(--accent-text); border-bottom-color: var(--accent); }
  .tab-content { display: flex; flex-direction: column; gap: 1rem; }
  .werte { display: grid; gap: 1rem; grid-template-columns: 1fr; }
  @media (min-width: 1100px) {
    .werte { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
  }
  @media (max-width: 640px) {
    .actions { width: 100%; }
    .save-state { order: 3; }
  }
</style>
