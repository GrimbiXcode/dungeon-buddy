<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ArrowLeft, Check, CloudOff, GitFork, RefreshCw, Star } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import { current } from "../lib/campaign.svelte";
  import { ApiError, get, post, put } from "../lib/api";
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
  import { d20Request, isPhysical, openRoll, roller } from "../lib/roller.svelte";
  import { route } from "../lib/router.svelte";
  import { session } from "../lib/session.svelte";
  import { toast, toastError } from "../lib/toast.svelte";
  import {
    armorFromLibrary,
    armorToLibrary,
    attackFromLibrary,
    attackToLibrary,
    featureFromLibrary,
    featureToLibrary,
    unresolvedLinks,
    type LibraryItem,
  } from "../lib/library";
  import LibraryPicker from "../components/LibraryPicker.svelte";
  import Armor from "./character/Armor.svelte";
  import type { ArmorItem } from "../lib/armor";
  import type { Campaign, CharacterRecord, Ruleset } from "../lib/types";
  import { rulesetLabel } from "../lib/themes";
  import { setSheet, type SheetContext } from "./character/context";
  import Abilities from "./character/Abilities.svelte";
  import Skills from "./character/Skills.svelte";
  import Vitals from "./character/Vitals.svelte";
  import Attacks from "./character/Attacks.svelte";
  import Combat from "./character/Combat.svelte";
  import Spellcasting from "./character/Spellcasting.svelte";
  import Details from "./character/Details.svelte";
  import TextBlocks from "./character/TextBlocks.svelte";
  import Currency from "./character/Currency.svelte";
  import Inventory from "./character/Inventory.svelte";
  import RollLog from "./character/RollLog.svelte";
  import Features from "./character/Features.svelte";
  import CombatAssistant from "./character/CombatAssistant.svelte";
  import AttackWizard from "./character/AttackWizard.svelte";
  import ScrollFade from "../components/ScrollFade.svelte";
  import AbilityPicker from "./character/AbilityPicker.svelte";
  import Modal from "../components/Modal.svelte";
  import { diceString, formatDice } from "../lib/dice";
  import Portrait from "./character/Portrait.svelte";
  import {
    abilityChoices,
    appliesToAttack,
    isAttackBound,
    needsTargetChoice,
    confirmLinkSuccess,
    describeDamageAdds,
    featureDamageExpr,
    featureDamageType,
    featureRollKind,
    linkedFeatures,
    isAvailable,
    trackUsage,
    rollFeatures,
    sumMods,
    useFeature,
    type AbilityPicks,
    type Feature,
    type RollContext,
  } from "../lib/features";
  import type { Attack } from "../lib/character";
  import { stealthDisadvantage, wornArmor } from "../lib/armor";
  import type { RollOption } from "../lib/roller.svelte";

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
  let attackWizard = $state<{ attack: Attack; offhand: boolean; feature?: string } | null>(null);
  /** Fähigkeit mit Ziel Verbündete/Beliebig: erst fragen, ob sie auf dich wirkt */
  let targetChoice = $state<{ feature: Feature; picks?: AbilityPicks } | null>(null);
  /** Fähigkeit, die im Angriff eingesetzt wird: erst die Waffe wählen */
  let attackFor = $state<Feature | null>(null);
  /** Fähigkeit, für deren Wurf vor dem Einsetzen ein Attribut gewählt wird */
  let featureChoice = $state<{ feature: Feature; picks: AbilityPicks } | null>(null);
  let libraryKind = $state<"feature" | "attack" | "armor" | null>(null);

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

  const sheetCtx: SheetContext = {
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
          conditions: data.conditions,
          ability: opts.ability ?? null,
          rollMode: data.rollMode,
          target: opts.target,
          critRange: data.critRange,
          onResult: opts.onResult,
          followUp: opts.damage ? { ...opts.damage, canCrit: true } : undefined,
          options: rollOptions({ kind, ability: opts.ability ?? null, skill: opts.skill ?? null }),
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
        effect: opts.effect,
        canCrit: !opts.heal && !opts.effect,
        physical: isPhysical(data.rollMode),
      });
    },
    useFeature(f: Feature, picks?: AbilityPicks, opts: { onSelf?: boolean } = {}) {
      // Fähigkeiten, die an Treffer/Angriffe gebunden sind, setzt man im Angriff ein: Waffe wählen
      if (isAttackBound(f) && f.appliesTo.scope !== "none") {
        attackFor = f;
        return;
      }
      const kind = featureRollKind(f);
      // Mehrere Attribute zur Wahl: erst fragen, dann einsetzen und würfeln
      if (kind && !picks && featureDamageExpr(data, f) && abilityChoices(f).length) {
        featureChoice = { feature: f, picks: {} };
        return;
      }
      if (opts.onSelf == null && needsTargetChoice(f)) {
        targetChoice = { feature: f, picks };
        return;
      }
      for (const note of useFeature(data, f, { onSelf: opts.onSelf })) toast(note);
      const expr = kind ? featureDamageExpr(data, f, picks) : null;
      if (kind && expr) {
        const adds = f.damageAdds.length ? `Inklusive ${describeDamageAdds(data, f.damageAdds, picks)}` : "";
        this.rollDamage(f.name, diceString(expr), {
          heal: kind === "healing",
          effect: kind === "other" ? f.effectText.trim() : undefined,
          damageType: kind === "damage" ? featureDamageType(f) || undefined : undefined,
          subtitle: [f.damageOtherTarget ? "Weiteres Ziel" : "", adds, f.save ? `Rettungswurf: ${f.save}` : ""].filter(Boolean).join(" · ") || undefined,
        });
      } else {
        toast(opts.onSelf === false ? `${f.name} auf andere eingesetzt.` : `${f.name} eingesetzt${f.benefit ? `: ${f.benefit}` : "."}`, "success");
      }
    },
    openAttack(a: Attack, opts = {}) {
      attackWizard = { attack: a, offhand: Boolean(opts.offhand), feature: opts.feature };
    },
    addToLibrary(kind: "feature" | "attack" | "armor", item: Feature | Attack | ArmorItem) {
      const payload =
        kind === "feature" ? featureToLibrary(data, item as Feature) : kind === "attack" ? attackToLibrary(data, item as Attack) : armorToLibrary(item as ArmorItem);
      post("/api/library", { kind, name: item.name || "Ohne Namen", ruleset, data: payload })
        .then(() => toast(`„${item.name}“ in die Bibliothek aufgenommen.`, "success"))
        .catch(toastError);
    },
    openLibrary(kind) {
      libraryKind = kind;
    },
  };
  setSheet(sheetCtx);

  const inCampaign = $derived(Boolean(campaign && record?.campaigns?.some(x => x.campaignId === campaign.id && x.active)));
  const isActiveCharacter = $derived(Boolean(campaign && campaign.activeCharacterId === characterId));

  async function makeActive() {
    if (!campaign) return;
    try {
      const res = await put<{ activeCharacterId: string | null }>(`/api/campaigns/${campaign.id}/active-character`, { characterId });
      if (current.campaign?.id === campaign.id) current.campaign.activeCharacterId = res.activeCharacterId;
      toast("Aktiver Charakter dieser Kampagne.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  function pickFromLibrary(item: LibraryItem) {
    const kind = libraryKind;
    libraryKind = null;
    if (kind === "feature") {
      const missing = unresolvedLinks(data, item.data);
      data.features.push(featureFromLibrary(data, item.data, item.name));
      if (missing.length) toast(`Verknüpfung zu ${missing.join(", ")} fehlt im Bogen – bei Bedarf im Editor setzen.`);
      tab = "faehigkeiten";
    } else if (kind === "attack") {
      data.attacks.push(attackFromLibrary(data, item.data, item.name));
    } else if (kind === "armor") {
      data.armor.push(armorFromLibrary(item.data, item.name));
    }
    toast(`„${item.name}“ übernommen.`, "success");
  }

  /** Fähigkeiten, die einen W20-Wurf verändern, als Optionen im Würfeldialog */
  function rollOptions(roll: RollContext): RollOption[] {
    const options: RollOption[] = rollFeatures(data, roll).map(rf => {
      const f = rf.feature;
      // Rückgängig machen gibt nur zurück, was wirklich verbraucht wurde
      let undoUse: (() => void) | null = null;
      let undoSuccess: (() => void) | null = null;
      const sum = sumMods([{ label: f.name, mods: rf.mods }]);
      const onSuccess = linkedFeatures(data, f).filter(x => x.link.when === "success");
      return {
        id: f.id,
        label: f.name,
        detail: [f.benefit, ...onSuccess.map(x => `Verbraucht ${x.link.cost}× ${x.feature.name}, wenn es gelingt`)].filter(Boolean).join(" · ") || undefined,
        flat: sum.flat,
        dice: sum.dice.flatMap(d => d.groups),
        sign: sum.dice[0]?.sign ?? 1,
        mode: sum.advantage && !sum.disadvantage ? "advantage" : sum.disadvantage && !sum.advantage ? "disadvantage" : null,
        auto: rf.automatic,
        disabled: !rf.available,
        available: () => rf.automatic || isAvailable(data, f),
        onToggle: on => {
          if (on) {
            const t = trackUsage(data, () => useFeature(data, f, { markEconomy: f.activation === "reaction" }));
            for (const note of t.result) toast(note);
            undoUse = t.undo;
          } else {
            undoSuccess?.();
            undoUse?.();
            undoSuccess = undoUse = null;
          }
        },
        onSuccess: onSuccess.length
          ? {
              label: onSuccess.map(x => `${x.feature.name} verbrauchen`).join(", "),
              run: () => {
                undoSuccess = trackUsage(data, () => onSuccess.forEach(x => confirmLinkSuccess(data, f, x.feature.id))).undo;
              },
            }
          : undefined,
      };
    });
    if (roll.kind === "skill" && roll.skill === "stealth" && stealthDisadvantage(data)) {
      options.unshift({ id: "armor-stealth", label: wornArmor(data)?.name || "Rüstung", detail: "Nachteil auf Heimlichkeit", flat: 0, dice: [], sign: 1, mode: "disadvantage", auto: true });
    }
    return options;
  }

  onMount(() => {
    void load();
    // Würfe in „Letzte Würfe“ diesem Charakter zuordnen
    roller.owner = characterId;
    // Tab wird verborgen/geschlossen: sofort speichern (auch wenn gerade ein Speichern läuft)
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      if (roller.owner === characterId) roller.owner = null;
      document.removeEventListener("visibilitychange", flushOnHide);
      destroyed = true;
      flushNow();
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

  /** Bogen geschlossen: keine Wiederholungen mehr, nur noch ein letzter Versuch */
  let destroyed = false;
  /** Während eines laufenden Speicherns verlangt: danach sofort weiterspeichern */
  let flushAfterSave = false;

  async function doSave() {
    if (!record) return;
    const current = snapshot();
    if (current === lastSaved) {
      saveState = "saved";
      return;
    }
    saveState = "saving";
    // Beim Verlassen soll die Anfrage das Schliessen des Tabs überleben
    const final = destroyed || document.visibilityState === "hidden" || flushAfterSave;
    flushAfterSave = false;
    try {
      const body = JSON.parse(current) as { name: string; ruleset: Ruleset; data: CharacterData };
      const updated = await put<CharacterRecord>(
        url,
        { name: body.name.trim() || "Unbenannt", ruleset: body.ruleset, data: body.data, revision: record.revision },
        { keepalive: final }
      );
      record.revision = updated.revision;
      lastSaved = current;
      saveState = snapshot() === current ? "saved" : "dirty";
      if (saveState === "dirty") {
        if (flushAfterSave || destroyed) void doSave();
        else save();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) saveState = "conflict";
      else saveState = "error";
      if (destroyed) toast("Änderungen am Bogen konnten nicht gespeichert werden.", "error");
      else if (saveState === "error") setTimeout(() => !destroyed && saveState === "error" && save(), 5000);
    }
  }

  const save = debounce(() => void doSave(), 700);

  /** Sofort speichern, statt auf die Verzögerung zu warten */
  function flushNow() {
    if (!record || saveState === "conflict") return;
    if (saveState === "saving") {
      flushAfterSave = true;
      return;
    }
    save.cancel();
    if (snapshot() !== lastSaved) void doSave();
  }

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
      flushNow();
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
    {#if session.info?.attachments}
      <Portrait
        {characterId}
        name={name || "Unbenannt"}
        portraitId={record.portraitId}
        {editing}
        onchange={id => record && (record.portraitId = id)}
      />
    {/if}
    <div class="grow title">
      <h1 class="truncate">{name || "Unbenannt"}</h1>
      <p class="muted small truncate">
        {[data.species, classSummary(data) || `Stufe ${totalLevel(data)}`, data.background].filter(Boolean).join(" · ")}
        · {isPhysical(data.rollMode) ? "Echte Würfel" : "Digitale Würfel"}
      </p>
      <div class="chip-row meta">
        <span class="badge">{rulesetLabel(ruleset)}</span>
        {#if record.status === "dead"}<span class="badge badge-danger"><Icon name="death" size={12} /> Verstorben</span>{/if}
        {#if record.status === "retired"}<span class="badge">Im Ruhestand</span>{/if}
        {#if record.forkedFromName}<span class="badge"><GitFork size={12} /> Kopie von {record.forkedFromName}</span>{/if}
        {#if isActiveCharacter}
          <span class="badge badge-accent"><Star size={12} /> Aktiver Charakter</span>
        {:else if inCampaign}
          <button class="badge make-active" onclick={makeActive} title="„Charakterbogen“ öffnet dann direkt diesen Bogen"><Star size={12} /> Als aktiven Charakter festlegen</button>
        {/if}
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
        <button aria-pressed={!editing} onclick={() => (editing = false)}><Icon name="play" size={14} /> Spielen</button>
        <button aria-pressed={editing} onclick={() => (editing = true)}><Icon name="edit" size={14} /> Bearbeiten</button>
      </div>
      <button class="btn btn-sm" onclick={() => rest("short")}><Icon name="shortRest" size={15} /> Kurze Rast</button>
      <button class="btn btn-sm" onclick={() => rest("long")}><Icon name="longRest" size={15} /> Lange Rast</button>
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

  <div class="tab-bar">
    <ScrollFade>
      <div class="tabs" role="tablist">
        {#each tabs as t (t.key)}
          <button role="tab" aria-selected={tab === t.key} class:active={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>
        {/each}
      </div>
    </ScrollFade>
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
      <Armor />
      <Combat />
    {:else if tab === "faehigkeiten"}
      <Features />
    {:else if tab === "zauber"}
      <Spellcasting />
    {:else if tab === "inventar"}
      <Currency />
      <Inventory />
      <TextBlocks
        fields={[
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

{#if libraryKind}
  <LibraryPicker kind={libraryKind} {ruleset} onpick={pickFromLibrary} onclose={() => (libraryKind = null)} />
{/if}

{#if featureChoice}
  {@const choice = featureChoice}
  {@const preview = featureDamageExpr(data, choice.feature, choice.picks)}
  <Modal title="{choice.feature.name || 'Fähigkeit'}: Attribut wählen" size="sm" onclose={() => (featureChoice = null)}>
    <p class="small muted">Welches Attribut verwendest du?</p>
    <AbilityPicker feature={choice.feature} bind:picks={choice.picks} />
    {#if preview}<p class="small">Wurf: <strong class="mono">{formatDice(preview)}</strong></p>{/if}
    {#snippet footer()}
      <button class="btn" onclick={() => (featureChoice = null)}>Abbrechen</button>
      <button
        class="btn btn-primary"
        onclick={() => {
          // Erst Werte sichern: `choice` hängt an featureChoice und wird mit null ungültig
          const { feature, picks } = choice;
          featureChoice = null;
          sheetCtx.useFeature(feature, { ...picks });
        }}>Einsetzen und würfeln</button
      >
    {/snippet}
  </Modal>
{/if}

{#if targetChoice}
  {@const choice = targetChoice}
  <Modal title="{choice.feature.name || 'Fähigkeit'}: Ziel" size="sm" onclose={() => (targetChoice = null)}>
    <p class="small">Auf wen wirkst du „{choice.feature.name}“?</p>
    <p class="tiny muted">Nur auf dich wirkt es auf deinen Bogen (RK, Würfe). Auf andere wird nur Dauer und Konzentration verfolgt.</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (targetChoice = null)}>Abbrechen</button>
      <button
        class="btn"
        onclick={() => {
          const { feature, picks } = choice;
          targetChoice = null;
          sheetCtx.useFeature(feature, picks, { onSelf: false });
        }}>Auf andere</button
      >
      <button
        class="btn btn-primary"
        onclick={() => {
          const { feature, picks } = choice;
          targetChoice = null;
          sheetCtx.useFeature(feature, picks, { onSelf: true });
        }}>Auf mich</button
      >
    {/snippet}
  </Modal>
{/if}

{#if attackFor}
  {@const f = attackFor}
  {@const weapons = data.attacks.filter(a => appliesToAttack(f, a))}
  <Modal title="{f.name || 'Fähigkeit'}: Angriff wählen" size="sm" onclose={() => (attackFor = null)}>
    <p class="small muted">„{f.name}“ setzt du im Angriff ein. Mit welcher Waffe greifst du an?</p>
    {#if weapons.length}
      <div class="stack weapon-pick">
        {#each weapons as a (a.id)}
          <button
            class="btn"
            onclick={() => {
              // Erst Werte sichern: `f` hängt an attackFor und wird mit null ungültig
              const featureId = f.id;
              attackFor = null;
              sheetCtx.openAttack(a, { feature: featureId });
            }}
          >
            <Icon name="attack" size={15} /> {a.name || "Angriff"}
          </button>
        {/each}
      </div>
    {:else}
      <p class="small">Keine Waffe passt zu „Gilt für“ dieser Fähigkeit.</p>
    {/if}
    {#snippet footer()}<button class="btn" onclick={() => (attackFor = null)}>Abbrechen</button>{/snippet}
  </Modal>
{/if}

{#if attackWizard}
  {#key attackWizard}
    <AttackWizard attack={attackWizard.attack} offhand={attackWizard.offhand} preselect={attackWizard.feature} onclose={() => (attackWizard = null)} />
  {/key}
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
  .make-active { cursor: pointer; font: inherit; font-size: 0.7rem; background: transparent; }
  .make-active:hover { border-color: var(--accent); color: var(--accent-text); }
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
  .tab-bar { margin-bottom: 1rem; }
  .tabs {
    display: flex;
    gap: 0.2rem;
    /* Scrollt im ScrollFade; die Linie läuft unter allen Reitern durch */
    width: max-content;
    min-width: 100%;
    border-bottom: 1px solid var(--border);
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
