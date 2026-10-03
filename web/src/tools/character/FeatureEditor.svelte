<script lang="ts">
  import { tick } from "svelte";
  import { unitSystem } from "../../lib/session.svelte";
  import Modal from "../../components/Modal.svelte";
  import TagInput from "../../components/TagInput.svelte";
  import { Plus, Trash2, X } from "@lucide/svelte";
  import { formatDice, parseBonus, parseDice } from "../../lib/dice";
  import { ABILITIES, ABILITY_NAMES, ABILITY_SHORT, SKILLS, rulesTerms, type Ability } from "../../lib/dnd";
  import {
    AC_MODES,
    ACTIVATIONS,
    DURATIONS,
    EFFECT_TYPES,
    LINK_WHEN,
    ROLL_TARGETS,
    SCOPES,
    TARGETS,
    TRIGGERS,
    USE_RESETS,
    baseCategories,
    DAMAGE_ADDS,
    deriveEffectType,
    describeDamageAdds,
    featureDamageExpr,
    newDamageAdd,
    isDamageTwice,
    label,
    newRollMod,
    normalizeFeature,
    type DamageAdd,
    type Feature,
    type RollMod,
    type Trigger,
  } from "../../lib/features";
  import { sheet } from "./context";

  let {
    feature,
    onsave,
    onclose,
  }: { feature: Feature; onsave: (f: Feature) => void; onclose: () => void } = $props();

  const ctx = sheet();
  const c = $derived(ctx.data);

  // Arbeitskopie, damit „Abbrechen“ nichts verändert
  // svelte-ignore state_referenced_locally
  let f = $state(normalizeFeature(JSON.parse(JSON.stringify(feature))));
  // svelte-ignore state_referenced_locally
  let tags = $state([...feature.tags]);
  let error = $state<string | null>(null);

  // ── Bausteine ──────────────────────────────────────────────────────────
  // Grundansicht: Name, Kategorie, Einsatz, Beschreibung. Alles andere fügt man
  // als Baustein hinzu; vorhandene Werte zeigen ihren Baustein von selbst.

  type Single =
    | "twice"
    | "ac"
    | "scope"
    | "damage"
    | "healing"
    | "other"
    | "save"
    | "target"
    | "duration"
    | "benefit"
    | "uses"
    | "resource"
    | "triggers"
    | "condition"
    | "effect"
    | "tags";
  type Multi = "bonus" | "adv" | "link";
  type BlockKey = Single | Multi;

  const GROUPS = ["Würfe und Werte", "Wirkung", "Einsatz", "Ordnung"] as const;
  const BLOCKS: { key: BlockKey; group: (typeof GROUPS)[number]; title: string; hint: string; multi?: boolean }[] = [
    { key: "bonus", group: "Würfe und Werte", title: "Bonus auf einen Wurf", hint: "Zahl oder Würfel: +2, 1d4, -1d4", multi: true },
    { key: "adv", group: "Würfe und Werte", title: "Vorteil oder Nachteil", hint: "Auf Angriff, Attribut, Rettung …", multi: true },
    { key: "twice", group: "Würfe und Werte", title: "Schadenswürfel zweimal würfeln", hint: "Ein Ergebnis wählen, z. B. Wilder Angreifer" },
    { key: "ac", group: "Würfe und Werte", title: "Rüstungsklasse ändern", hint: "Bonus, Grund-RK oder Mindestwert" },
    { key: "scope", group: "Würfe und Werte", title: "Nur bei bestimmten Angriffen", hint: "Nahkampf, Fernkampf, eine Waffe …" },
    { key: "damage", group: "Wirkung", title: "Schaden würfeln", hint: "Würfel und Schadensart, z. B. 2d6 Feuer" },
    { key: "healing", group: "Wirkung", title: "Heilung würfeln", hint: "z. B. 1d10+5" },
    { key: "other", group: "Wirkung", title: "Sonstige Wirkung", hint: "Würfel und Wirkung als Text, z. B. 1d10 vom Schaden abziehen" },
    { key: "save", group: "Wirkung", title: "Rettungswurf der Ziele", hint: "z. B. GES, halber Schaden bei Erfolg" },
    { key: "target", group: "Wirkung", title: "Ziel und Reichweite", hint: "Wen trifft es, wie weit?" },
    { key: "duration", group: "Wirkung", title: "Dauer", hint: "Runden, Minuten, bis zur Rast …" },
    { key: "benefit", group: "Wirkung", title: "Kurz-Nutzen für die Karte", hint: "Eine Zeile, z. B. +2 RK" },
    { key: "uses", group: "Einsatz", title: "Begrenzte Nutzungen", hint: "z. B. 2× pro lange Rast" },
    { key: "resource", group: "Einsatz", title: "Verbraucht eine Ressource", hint: "Ki-Punkte, Göttliche Macht …" },
    { key: "link", group: "Einsatz", title: "Nutzt eine andere Fähigkeit", hint: "Verbraucht deren Nutzungen", multi: true },
    { key: "triggers", group: "Einsatz", title: "Auslöser im Kampf", hint: "Für Vorschläge im Kampf-Assistenten" },
    { key: "condition", group: "Einsatz", title: "Bedingung", hint: "z. B. nur mit Finesse-Waffe" },
    { key: "effect", group: "Ordnung", title: "Art festlegen", hint: "Sonst automatisch" },
    { key: "tags", group: "Ordnung", title: "Schlagworte", hint: "Eigene Begriffe zum Filtern" },
  ];
  const title = (key: BlockKey) => BLOCKS.find(b => b.key === key)!.title;

  // Würfe getrennt nach Bonus, Vorteil/Nachteil und „zweimal würfeln“
  // svelte-ignore state_referenced_locally
  let bonusMods = $state<RollMod[]>(f.rollMods.filter(m => m.bonus.trim()).map(m => ({ ...m, mode: "none" })));
  // svelte-ignore state_referenced_locally
  let advMods = $state<RollMod[]>(f.rollMods.filter(m => m.mode !== "none" && m.target !== "damage").map(m => ({ ...m, bonus: "" })));

  // svelte-ignore state_referenced_locally
  const startOther = Boolean(f.effectText.trim());
  // svelte-ignore state_referenced_locally
  const startHealing = f.effectType === "healing" && !startOther;
  // svelte-ignore state_referenced_locally
  let on = $state<Record<Single, boolean>>({
    twice: f.rollMods.some(isDamageTwice),
    ac: f.acMod.mode !== "none",
    scope: f.appliesTo.scope !== "none",
    damage: Boolean(f.damage.trim() || f.damageType.trim() || f.damageTypeFromAttack || f.damageAdds.length) && !startHealing && !startOther,
    healing: Boolean(f.damage.trim() || f.damageAdds.length) && startHealing,
    other: startOther,
    save: Boolean(f.save.trim()),
    target: f.target !== "self" || Boolean(f.targetText.trim()),
    duration: f.duration.kind !== "instant",
    benefit: Boolean(f.benefit.trim()),
    uses: f.uses.max != null,
    resource: f.resourceId != null,
    triggers: f.triggers.length > 0,
    condition: Boolean(f.condition.trim()),
    effect: f.effectType !== deriveEffectType(f, startHealing),
    tags: f.tags.length > 0,
  });

  const categories = $derived([
    ...new Set([...baseCategories(rulesTerms(ctx.ruleset).species), ...c.features.flatMap(x => x.categories)].filter(Boolean)),
  ]);
  const allTags = $derived([...new Set(c.features.flatMap(x => x.tags))]);

  /** Andere Fähigkeiten, die diese mitverwenden kann */
  const linkable = $derived(c.features.filter(x => x.id !== f.id).sort((a, b) => a.name.localeCompare(b.name, "de")));

  /** Gespeicherte Würfe in der Reihenfolge Bonus, Vorteil/Nachteil, zweimal würfeln */
  function composedMods(): RollMod[] {
    return [
      ...bonusMods.filter(m => m.bonus.trim()),
      ...advMods,
      ...(on.twice ? [newRollMod({ target: "damage", mode: "advantage" })] : []),
    ];
  }
  const derivedType = $derived(
    deriveEffectType(
      { damage: f.damage, damageAdds: f.damageAdds, effectText: on.other ? f.effectText || "…" : "", acMod: f.acMod, rollMods: composedMods() },
      on.healing
    )
  );

  /** Würfel mit Zuschlägen, wie sie für diesen Charakter gerade gewürfelt würden */
  const damagePreview = $derived(featureDamageExpr(c, f));
  const classNames = $derived([...new Set(c.classes.map(k => k.name.trim()).filter(Boolean))]);

  /** Würfe auf Angriff/Schaden brauchen einen Angriffsbezug */
  function ensureScope(scope: Feature["appliesTo"]["scope"] = "all") {
    if (f.appliesTo.scope === "none") f.appliesTo.scope = scope;
    on.scope = true;
  }

  function rollTargetChanged(m: RollMod) {
    m.ability = null;
    m.skill = null;
    if (m.target === "attack" || m.target === "damage") ensureScope();
  }

  function toggleTrigger(t: Trigger) {
    f.triggers = f.triggers.includes(t) ? f.triggers.filter(x => x !== t) : [...f.triggers, t];
  }

  /** Attribut eines Zuschlags an-/abwählen; mindestens eines bleibt */
  function toggleAddAbility(add: DamageAdd, ab: Ability) {
    if (add.abilities.includes(ab)) {
      if (add.abilities.length > 1) add.abilities = add.abilities.filter(x => x !== ab);
    } else {
      add.abilities = ABILITIES.filter(x => x === ab || add.abilities.includes(x));
    }
  }

  function toggleAttack(id: string) {
    const ids = f.appliesTo.attackIds;
    f.appliesTo.attackIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  // ── Hinzufügen / Entfernen ─────────────────────────────────────────────
  let picking = $state(false);

  function count(key: BlockKey) {
    if (key === "bonus") return bonusMods.length;
    if (key === "adv") return advMods.length;
    if (key === "link") return f.links.length;
    return on[key] ? 1 : 0;
  }

  /** Warum ein Baustein gerade nicht geht (sonst null) */
  function blocked(key: BlockKey): string | null {
    const rolls = (["damage", "healing", "other"] as const).filter(k => k !== key && on[k]);
    if ((key === "damage" || key === "healing" || key === "other") && rolls.length) return "Nur ein Wurf: Schaden, Heilung oder sonstige Wirkung";
    if (key === "resource" && !c.resources.length) return "Noch keine Ressourcen im Bogen";
    if (key === "link" && !linkable.length) return "Noch keine andere Fähigkeit";
    if (key === "link" && f.links.length >= linkable.length) return "Alle verknüpft";
    return null;
  }

  async function add(key: BlockKey) {
    picking = false;
    let anchor = key as string;
    switch (key) {
      case "bonus":
        bonusMods = [...bonusMods, newRollMod({ target: "attack" })];
        anchor = `bonus-${bonusMods.length - 1}`;
        break;
      case "adv":
        advMods = [...advMods, newRollMod({ target: "check", mode: "advantage" })];
        anchor = `adv-${advMods.length - 1}`;
        break;
      case "link": {
        const first = linkable.find(x => !f.links.some(l => l.featureId === x.id));
        if (first) f.links = [...f.links, { featureId: first.id, cost: 1, when: "use" }];
        anchor = `link-${f.links.length - 1}`;
        break;
      }
      case "twice":
        on.twice = true;
        ensureScope("weapon");
        break;
      case "ac":
        on.ac = true;
        if (f.acMod.mode === "none") f.acMod = { mode: "bonus", value: 1 };
        break;
      case "scope":
        ensureScope();
        break;
      case "duration":
        on.duration = true;
        if (f.duration.kind === "instant") f.duration = { kind: "rounds", amount: 1, text: "" };
        break;
      case "uses":
        on.uses = true;
        if (f.uses.max == null) f.uses.max = 1;
        break;
      case "resource":
        on.resource = true;
        f.resourceId ??= c.resources[0]?.id ?? null;
        break;
      case "effect":
        on.effect = true;
        f.effectType = derivedType;
        break;
      default:
        on[key as Single] = true;
    }
    await tick();
    const el = document.getElementById(`feature-block-${anchor}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
  }

  /** Baustein entfernen und seine Werte zurücksetzen */
  function remove(key: Single) {
    on[key] = false;
    switch (key) {
      case "ac":
        f.acMod = { mode: "none", value: 0 };
        break;
      case "scope":
        f.appliesTo = { scope: "none", attackIds: [] };
        break;
      case "damage":
      case "healing":
      case "other":
        f.effectText = "";
        f.damage = "";
        f.damageType = "";
        f.damageTypeFromAttack = false;
        f.damageOtherTarget = false;
        f.damageAdds = [];
        break;
      case "save":
        f.save = "";
        break;
      case "target":
        f.target = "self";
        f.targetText = "";
        break;
      case "duration":
        f.duration = { kind: "instant", amount: 1, text: "" };
        break;
      case "benefit":
        f.benefit = "";
        break;
      case "uses":
        f.uses.max = null;
        break;
      case "resource":
        f.resourceId = null;
        break;
      case "triggers":
        f.triggers = [];
        break;
      case "condition":
        f.condition = "";
        break;
      case "tags":
        tags = [];
        break;
    }
  }

  function onSheetKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      picking = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      error = "Bitte einen Namen eingeben.";
      return;
    }
    if (f.damage.trim() && !parseDice(f.damage)) {
      error = `Ungültiger Würfelausdruck „${f.damage}“ (Beispiel: 2d6+3).`;
      return;
    }
    if (on.other && !f.effectText.trim()) {
      error = "Bitte bei „Sonstige Wirkung“ eintragen, was der Wurf bewirkt.";
      return;
    }
    if (!on.other) f.effectText = "";
    if (f.damageAdds.some(a => a.kind === "classLevel" && !a.className.trim())) {
      error = "Bitte bei „Klassenstufe“ die Klasse angeben (z. B. Kämpfer).";
      return;
    }
    const badMod = bonusMods.find(m => m.bonus.trim() && !parseBonus(m.bonus));
    if (badMod) {
      error = `Ungültiger Bonus „${badMod.bonus}“ (Beispiele: 2, -1, 1d4, -1d4).`;
      return;
    }
    f.rollMods = composedMods();
    f.tags = on.tags ? tags : [];
    if (!on.uses) f.uses.max = null;
    else if (f.uses.max == null) f.uses.max = 1;
    if (!on.effect) f.effectType = derivedType;
    onsave($state.snapshot(f) as Feature);
  }
</script>

{#snippet blockHead(key: BlockKey, onremove: () => void, removeLabel = `${title(key)} entfernen`)}
  <div class="block-head">
    <strong>{title(key)}</strong>
    <button type="button" class="btn btn-sm btn-icon btn-ghost" aria-label={removeLabel} onclick={onremove}><Trash2 size={15} /></button>
  </div>
{/snippet}

{#snippet damageAddsEditor()}
  {#each f.damageAdds as a, i (i)}
    <div class="add-row">
      <span class="plus" aria-hidden="true">+</span>
      <select class="select kind" bind:value={a.kind} aria-label="Zuschlag">
        {#each DAMAGE_ADDS as d (d.key)}<option value={d.key}>{d.label}</option>{/each}
      </select>
      {#if a.kind === "classLevel"}
        <input class="input" list="feature-classes" bind:value={a.className} placeholder="Klasse, z. B. Kämpfer" aria-label="Klasse" />
      {/if}
      <button type="button" class="btn btn-sm btn-icon btn-ghost" aria-label="Zuschlag entfernen" onclick={() => (f.damageAdds = f.damageAdds.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
    </div>
    {#if a.kind === "ability"}
      <div class="chip-row abilities" role="group" aria-label="Attribute">
        {#each ABILITIES as ab (ab)}
          <button type="button" class="chip" aria-pressed={a.abilities.includes(ab)} onclick={() => toggleAddAbility(a, ab)}>{ABILITY_SHORT[ab]}</button>
        {/each}
      </div>
      {#if a.abilities.length > 1}<p class="tiny muted">Mehrere Attribute: Im Kampf wählst du, welches zählt.</p>{/if}
    {/if}
  {/each}
  <datalist id="feature-classes">{#each classNames as n (n)}<option value={n}></option>{/each}</datalist>
  <button
    type="button"
    class="btn btn-sm btn-ghost add-inline"
    onclick={() => (f.damageAdds = [...f.damageAdds, newDamageAdd(classNames.length ? { kind: "classLevel", className: classNames[0] } : {})])}
  >
    <Plus size={14} /> Modifikator oder Stufe hinzurechnen
  </button>
  {#if f.damageAdds.length && damagePreview}
    <p class="tiny muted">Für diesen Charakter: <span class="mono">{formatDice(damagePreview)}</span> ({describeDamageAdds(c, f.damageAdds)})</p>
  {/if}
{/snippet}

{#snippet abilityOrSkill(m: RollMod)}
  {#if m.target === "check" || m.target === "save"}
    <select class="select wide" bind:value={m.ability} aria-label="Attribut">
      <option value={null}>alle Attribute</option>
      {#each ABILITIES as a (a)}<option value={a}>{ABILITY_NAMES[a]}</option>{/each}
    </select>
  {:else if m.target === "skill"}
    <select class="select wide" bind:value={m.skill} aria-label="Fertigkeit">
      <option value={null}>alle Fertigkeiten</option>
      {#each SKILLS as sk (sk.key)}<option value={sk.key}>{sk.name}</option>{/each}
    </select>
  {/if}
{/snippet}

<Modal title={feature.name ? `${feature.name} bearbeiten` : "Neue Fähigkeit"} size="lg" {onclose}>
  <form id="feature-form" onsubmit={submit}>
    <label class="field"><span class="label">Name</span><input class="input" bind:value={f.name} required maxlength="120" /></label>
    <div class="field">
      <label class="label" for="feature-categories">Kategorie <span class="optional">(mehrere möglich, auch eigene)</span></label>
      <TagInput id="feature-categories" label="Kategorie" bind:values={f.categories} options={categories} placeholder="Wählen oder eintippen" />
    </div>
    <div class="field">
      <span class="label">Einsatz</span>
      <div class="chip-row" role="group" aria-label="Einsatz">
        {#each ACTIVATIONS as a (a.key)}
          <button type="button" class="chip" aria-pressed={f.activation === a.key} title={a.hint} onclick={() => (f.activation = a.key)}>{a.label}</button>
        {/each}
      </div>
    </div>
    <label class="field">
      <span class="label">Beschreibung <span class="optional">(optional, Markdown)</span></span>
      <textarea class="textarea" rows="3" bind:value={f.description} placeholder="Regeltext oder eigene Notiz"></textarea>
    </label>

    <!-- Würfe und Werte -->
    {#each bonusMods as m, i (i)}
      <div class="block" id="feature-block-bonus-{i}">
        {@render blockHead("bonus", () => (bonusMods = bonusMods.filter((_, j) => j !== i)))}
        <div class="grid-2">
          <select class="select" bind:value={m.target} onchange={() => rollTargetChanged(m)} aria-label="Wurf">
            {#each ROLL_TARGETS as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
          </select>
          <input class="input mono" bind:value={m.bonus} placeholder="+2 oder 1d4" aria-label="Bonus" />
          {@render abilityOrSkill(m)}
        </div>
      </div>
    {/each}
    {#each advMods as m, i (i)}
      <div class="block" id="feature-block-adv-{i}">
        {@render blockHead("adv", () => (advMods = advMods.filter((_, j) => j !== i)))}
        <div class="grid-2">
          <select class="select" bind:value={m.target} onchange={() => rollTargetChanged(m)} aria-label="Wurf">
            {#each ROLL_TARGETS.filter(t => t.key !== "damage") as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
          </select>
          <select class="select" bind:value={m.mode} aria-label="Vorteil oder Nachteil">
            <option value="advantage">Vorteil</option>
            <option value="disadvantage">Nachteil</option>
          </select>
          {@render abilityOrSkill(m)}
        </div>
      </div>
    {/each}
    {#if on.twice}
      <div class="block" id="feature-block-twice">
        {@render blockHead("twice", () => remove("twice"))}
        <p class="tiny muted">
          Beim Schadenswurf werden die Waffenwürfel ein zweites Mal gewürfelt und du wählst, welcher Wurf zählt. Meist bei einem
          Treffer und einmal pro Zug, dafür „Auslöser im Kampf“ und „Begrenzte Nutzungen“ dazunehmen.
        </p>
      </div>
    {/if}
    {#if on.ac}
      <div class="block" id="feature-block-ac">
        {@render blockHead("ac", () => remove("ac"))}
        <div class="grid-2">
          <select class="select" bind:value={f.acMod.mode} aria-label="Art">
            {#each AC_MODES.filter(a => a.key !== "none") as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
          </select>
          <input class="input mono" type="number" bind:value={f.acMod.value} aria-label="Wert" />
        </div>
        <p class="tiny muted">Wirkt, solange die Fähigkeit aktiv ist (passiv immer, sonst nach dem Einsetzen für die Dauer).</p>
      </div>
    {/if}
    {#if on.scope}
      <div class="block" id="feature-block-scope">
        {@render blockHead("scope", () => remove("scope"))}
        <select class="select" bind:value={f.appliesTo.scope} aria-label="Gilt für">
          {#each SCOPES.filter(s => s.key !== "none") as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
        {#if f.appliesTo.scope === "specific"}
          <div class="chip-row">
            {#each c.attacks as a (a.id)}
              <button type="button" class="chip" aria-pressed={f.appliesTo.attackIds.includes(a.id)} onclick={() => toggleAttack(a.id)}>{a.name || "Angriff"}</button>
            {:else}
              <span class="small muted">Noch keine Waffen/Angriffe im Bogen.</span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Wirkung -->
    {#if on.damage}
      <div class="block" id="feature-block-damage">
        {@render blockHead("damage", () => remove("damage"))}
        <div class="grid-2">
          <input class="input mono" bind:value={f.damage} placeholder="2d6+3" aria-label="Schadenswürfel" />
          <input
            class="input"
            value={f.damageTypeFromAttack ? "wie der Angriff" : f.damageType}
            oninput={e => (f.damageType = e.currentTarget.value)}
            disabled={f.damageTypeFromAttack}
            placeholder="Feuer"
            aria-label="Schadensart"
          />
        </div>
        {@render damageAddsEditor()}
        <label class="checkbox small"><input type="checkbox" bind:checked={f.damageTypeFromAttack} /> Schadensart des auslösenden Angriffs (Waffe oder Zauber)</label>
        <label class="checkbox small"><input type="checkbox" bind:checked={f.damageOtherTarget} /> Trifft ein weiteres Ziel (eigener Schadenswurf)</label>
        <p class="tiny muted">
          {#if f.damageOtherTarget}
            Im Angriffs-Assistenten würfelst du den Schaden nach dem Waffenschaden separat für das weitere Ziel, ohne Boni des Angriffs.
          {:else}
            Bei Angriffen kommt der Schaden zum Waffenschaden dazu, wenn „Bei Treffer“ als Auslöser gesetzt ist oder die Fähigkeit vor dem Angriff gewählt wird.
          {/if}
        </p>
      </div>
    {/if}
    {#if on.healing}
      <div class="block" id="feature-block-healing">
        {@render blockHead("healing", () => remove("healing"))}
        <input class="input mono" bind:value={f.damage} placeholder="1d10" aria-label="Heilungswürfel" />
        {@render damageAddsEditor()}
      </div>
    {/if}
    {#if on.other}
      <div class="block" id="feature-block-other">
        {@render blockHead("other", () => remove("other"))}
        <div class="grid-2">
          <input class="input mono" bind:value={f.damage} placeholder="1d10" aria-label="Würfel" />
          <input class="input" bind:value={f.effectText} maxlength="200" placeholder="vom erlittenen Schaden abziehen" aria-label="Wirkung" />
        </div>
        {@render damageAddsEditor()}
        <p class="tiny muted">Nach dem Wurf siehst du das Ergebnis mit diesem Text, z. B. „12 · vom erlittenen Schaden abziehen“.</p>
      </div>
    {/if}
    {#if on.save}
      <div class="block" id="feature-block-save">
        {@render blockHead("save", () => remove("save"))}
        <input class="input" bind:value={f.save} placeholder="GES, halber Schaden" aria-label="Rettungswurf" />
      </div>
    {/if}
    {#if on.target}
      <div class="block" id="feature-block-target">
        {@render blockHead("target", () => remove("target"))}
        <div class="grid-2">
          <select class="select" bind:value={f.target} aria-label="Ziel">
            {#each TARGETS as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
          </select>
          <input
            class="input"
            bind:value={f.targetText}
            aria-label="Ziel genauer"
            placeholder={unitSystem() === "metric" ? "z. B. eine Kreatur in 9 m" : "z. B. eine Kreatur in 30 ft"}
          />
        </div>
      </div>
    {/if}
    {#if on.duration}
      <div class="block" id="feature-block-duration">
        {@render blockHead("duration", () => remove("duration"))}
        <div class="grid-2">
          <select class="select" bind:value={f.duration.kind} aria-label="Dauer">
            {#each DURATIONS.filter(d => d.key !== "instant") as d (d.key)}<option value={d.key}>{d.label}</option>{/each}
          </select>
          {#if ["rounds", "minutes", "hours", "concentration"].includes(f.duration.kind)}
            <input class="input mono" type="number" min="1" bind:value={f.duration.amount} aria-label="Anzahl" />
          {:else if f.duration.kind === "special"}
            <input class="input" bind:value={f.duration.text} aria-label="Dauer (Text)" />
          {/if}
        </div>
      </div>
    {/if}
    {#if on.benefit}
      <div class="block" id="feature-block-benefit">
        {@render blockHead("benefit", () => remove("benefit"))}
        <input class="input" bind:value={f.benefit} placeholder="z. B. +2 RK, Vorteil auf den nächsten Angriff" aria-label="Kurz-Nutzen" />
      </div>
    {/if}

    <!-- Einsatz -->
    {#if on.uses}
      <div class="block" id="feature-block-uses">
        {@render blockHead("uses", () => remove("uses"))}
        <div class="row uses">
          <input class="input mono num" type="number" min="0" max="99" bind:value={f.uses.max} aria-label="Anzahl" />
          <span class="small muted">×</span>
          <select class="select" bind:value={f.uses.reset} aria-label="Zurücksetzen">
            {#each USE_RESETS as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
          </select>
        </div>
      </div>
    {/if}
    {#if on.resource}
      <div class="block" id="feature-block-resource">
        {@render blockHead("resource", () => remove("resource"))}
        <div class="row uses">
          <select class="select grow" bind:value={f.resourceId} aria-label="Ressource">
            {#each c.resources as r (r.id)}<option value={r.id}>{r.name} ({r.max})</option>{/each}
          </select>
          <input class="input mono num" type="number" min="0" bind:value={f.resourceCost} aria-label="Kosten" title="Kosten" />
        </div>
      </div>
    {/if}
    {#each f.links as link, i (i)}
      <div class="block" id="feature-block-link-{i}">
        {@render blockHead("link", () => (f.links = f.links.filter((_, j) => j !== i)))}
        <div class="row uses">
          <select class="select grow" bind:value={link.featureId} aria-label="Fähigkeit">
            {#each linkable as x (x.id)}<option value={x.id}>{x.name || "Ohne Namen"}</option>{/each}
          </select>
          <input class="input mono num" type="number" min="0" bind:value={link.cost} aria-label="Nutzungen" title="Nutzungen" />
        </div>
        <select class="select" bind:value={link.when} aria-label="Wann">
          {#each LINK_WHEN as w (w.key)}<option value={w.key}>{w.label}</option>{/each}
        </select>
      </div>
    {/each}
    {#if on.triggers}
      <div class="block" id="feature-block-triggers">
        {@render blockHead("triggers", () => remove("triggers"))}
        <div class="chip-row">
          {#each TRIGGERS as t (t.key)}
            <button type="button" class="chip" aria-pressed={f.triggers.includes(t.key)} onclick={() => toggleTrigger(t.key)}>{t.label}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if on.condition}
      <div class="block" id="feature-block-condition">
        {@render blockHead("condition", () => remove("condition"))}
        <input class="input" bind:value={f.condition} placeholder="z. B. nur mit Finesse-Waffe, einmal pro Zug" aria-label="Bedingung" />
      </div>
    {/if}

    <!-- Ordnung -->
    {#if on.effect}
      <div class="block" id="feature-block-effect">
        {@render blockHead("effect", () => remove("effect"))}
        <select class="select" bind:value={f.effectType} aria-label="Art">
          {#each EFFECT_TYPES as e (e.key)}<option value={e.key}>{e.label}</option>{/each}
        </select>
        <p class="tiny muted">Ohne diesen Baustein: automatisch „{label.effect(derivedType)}“.</p>
      </div>
    {/if}
    {#if on.tags}
      <div class="block" id="feature-block-tags">
        {@render blockHead("tags", () => remove("tags"))}
        <TagInput label="Schlagworte" bind:values={tags} options={allTags} placeholder="z. B. Nahkampf, Kontrolle" />
      </div>
    {/if}

    <button type="button" class="add-more" onclick={() => (picking = true)}><Plus size={18} /> Weitere hinzufügen</button>
    {#if error}<p class="error small">{error}</p>{/if}
  </form>

  {#if picking}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sheet-overlay" onkeydown={onSheetKey} onclick={e => e.target === e.currentTarget && (picking = false)} role="presentation">
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Baustein hinzufügen">
        <div class="sheet-head">
          <h3>Was soll die Fähigkeit noch können?</h3>
          <!-- svelte-ignore a11y_autofocus -->
          <button type="button" class="btn btn-ghost btn-icon" aria-label="Schliessen" autofocus onclick={() => (picking = false)}><X size={18} /></button>
        </div>
        <div class="sheet-body">
          {#each GROUPS as group (group)}
            <div class="sheet-group">{group}</div>
            {#each BLOCKS.filter(b => b.group === group) as b (b.key)}
              {@const n = count(b.key)}
              {@const why = blocked(b.key)}
              {@const taken = !b.multi && n > 0}
              <button type="button" class="pick" disabled={taken || Boolean(why)} onclick={() => add(b.key)}>
                <span class="pick-text">
                  <span class="pick-title">{b.title}</span>
                  <span class="pick-hint">{why ?? (b.key === "effect" ? `Sonst automatisch: ${label.effect(derivedType)}` : b.hint)}</span>
                </span>
                <span class="pick-badge">{taken ? "hinzugefügt" : b.multi ? (n ? `${n}× · mehrfach` : "mehrfach") : ""}</span>
                {#if !taken && !why}<Plus size={18} class="pick-plus" />{/if}
              </button>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <button class="btn" type="button" onclick={onclose}>Abbrechen</button>
    <button class="btn btn-primary" type="submit" form="feature-form">Speichern</button>
  {/snippet}
</Modal>

<style>
  form { display: flex; flex-direction: column; gap: 0.9rem; }
  .field { margin: 0; }
  .optional { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--faint); }
  .chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    min-height: 34px;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 0.85rem;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }

  .block {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.55rem 0.6rem 0.75rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    scroll-margin: 1rem;
  }
  .block-head { display: flex; align-items: center; gap: 0.4rem; }
  .block-head strong { flex: 1; font-size: 0.95rem; }
  .block .grid-2 { gap: 0.5rem; }
  .block .wide { grid-column: 1 / -1; }
  .block p { margin: 0; }
  .uses { gap: 0.5rem; flex-wrap: nowrap; }
  .add-row { display: flex; align-items: center; gap: 0.4rem; }
  .add-row > :global(.select), .add-row > :global(.input) { flex: 1 1 0; min-width: 0; padding-left: 0.55rem; }
  .add-row > :global(.kind) { flex-grow: 1.25; }
  .plus { color: var(--muted); font-weight: 700; width: 0.8rem; text-align: center; }
  .add-inline { align-self: flex-start; }
  .abilities { padding-left: 1.2rem; }
  .abilities .chip { min-height: 30px; padding: 0.2rem 0.6rem; }
  .uses .select { width: auto; flex: 1; }
  .num { width: 4.5rem; flex: none; }

  .add-more {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    border: 1px dashed color-mix(in oklab, var(--accent) 45%, var(--border));
    border-radius: var(--radius);
    background: transparent;
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .add-more:hover { background: var(--accent-soft); }
  .error { color: var(--danger); margin: 0; }

  /* Auswahl: auf dem Handy von unten, sonst mittig */
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgb(5 3 10 / 0.55);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sheet {
    width: 100%;
    max-width: 520px;
    max-height: 80dvh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: var(--shadow);
    padding-bottom: env(safe-area-inset-bottom);
  }
  @media (min-width: 640px) {
    .sheet-overlay { align-items: center; padding: 1rem; }
    .sheet { border-radius: var(--radius); }
  }
  .sheet-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 0.6rem 0.4rem 1rem; }
  .sheet-head h3 { flex: 1; margin: 0; font-size: 1rem; }
  .sheet-body { overflow-y: auto; padding-bottom: 0.6rem; }
  .sheet-group {
    padding: 0.7rem 1rem 0.25rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .pick {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-bottom: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pick:hover:not(:disabled) { background: var(--surface-2); }
  .pick:disabled { cursor: default; opacity: 0.5; }
  .pick-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pick-title { font-weight: 600; }
  .pick-hint { font-size: 0.82rem; color: var(--muted); }
  .pick-badge { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
  .pick :global(.pick-plus) { color: var(--accent-text); flex: none; }
</style>
