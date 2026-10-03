<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, Check, Copy, RefreshCw, Share2, Trash2, UserMinus, UserPlus, Users, X } from "@lucide/svelte";
  import Icon from "../components/Icon.svelte";
  import AppShell from "../components/AppShell.svelte";
  import LibraryList from "../components/LibraryList.svelte";
  import Modal from "../components/Modal.svelte";
  import { del, get, patch, post, put } from "../lib/api";
  import { confirmDialog } from "../lib/confirm.svelte";
  import { formatDate } from "../lib/format";
  import type { LibraryItem } from "../lib/library";
  import { navigate, route } from "../lib/router.svelte";
  import { toast, toastError } from "../lib/toast.svelte";

  /** Eigene Bibliothek, Freunde und die geteilten Bibliotheken von Freunden. */
  let { section = "eigene", friendId = null }: { section?: "eigene" | "freunde"; friendId?: string | null } = $props();

  type Person = { userId: string; displayName: string };
  type FriendsInfo = {
    code: string;
    libraryShared: boolean;
    friends: (Person & { libraryShared: boolean; since: string })[];
    incoming: (Person & { createdAt: string })[];
    outgoing: (Person & { createdAt: string })[];
  };

  let items = $state<LibraryItem[] | null>(null);
  let info = $state<FriendsInfo | null>(null);
  let friendLibrary = $state<{ friend: Person; items: LibraryItem[] } | null>(null);
  let friendError = $state<string | null>(null);
  let copied = $state<string[]>([]);
  let codeInput = $state(new URLSearchParams(route.search).get("code") ?? "");
  let renaming = $state<LibraryItem | null>(null);
  let newName = $state("");

  const formattedCode = $derived(info ? `${info.code.slice(0, 5)}-${info.code.slice(5)}` : "");
  const inviteLink = $derived(info ? `${location.origin}/bibliothek/freunde?code=${info.code}` : "");

  onMount(() => {
    void loadInfo();
    if (friendId) void loadFriendLibrary(friendId);
    else void loadItems();
  });

  async function loadItems() {
    try {
      items = await get<LibraryItem[]>("/api/library");
    } catch (e) {
      toastError(e);
      items = [];
    }
  }

  async function loadInfo() {
    try {
      info = await get<FriendsInfo>("/api/friends");
    } catch (e) {
      toastError(e);
    }
  }

  async function loadFriendLibrary(id: string) {
    try {
      friendLibrary = await get<{ friend: Person; items: LibraryItem[] }>(`/api/friends/${id}/library`);
    } catch (e) {
      friendError = (e as Error).message;
    }
  }

  async function setShared(shared: boolean) {
    try {
      await put("/api/library/sharing", { shared });
      if (info) info.libraryShared = shared;
      toast(shared ? "Deine Bibliothek ist jetzt für deine Freunde sichtbar." : "Deine Bibliothek ist nicht mehr geteilt.", "success");
    } catch (e) {
      toastError(e);
    }
  }

  async function remove(item: LibraryItem) {
    if (!(await confirmDialog(`„${item.name}“ aus der Bibliothek entfernen? Charaktere, die den Eintrag schon übernommen haben, behalten ihre Kopie.`, { title: "Eintrag löschen" }))) return;
    try {
      await del(`/api/library/${item.id}`);
      items = (items ?? []).filter(i => i.id !== item.id);
    } catch (e) {
      toastError(e);
    }
  }

  function startRename(item: LibraryItem) {
    renaming = item;
    newName = item.name;
  }

  async function rename(e: SubmitEvent) {
    e.preventDefault();
    if (!renaming || !newName.trim()) return;
    try {
      const updated = await patch<LibraryItem>(`/api/library/${renaming.id}`, { name: newName.trim() });
      items = (items ?? []).map(i => (i.id === updated.id ? updated : i));
      renaming = null;
    } catch (err) {
      toastError(err);
    }
  }

  async function copyText(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} kopiert.`, "success");
    } catch {
      toast(text);
    }
  }

  async function renewCode() {
    if (!(await confirmDialog("Neuen Freundescode erzeugen? Der bisherige Code und Einladungslink gelten danach nicht mehr. Bestehende Freunde bleiben.", { title: "Code erneuern", confirmLabel: "Erneuern", danger: false }))) return;
    try {
      const { code } = await post<{ code: string }>("/api/friends/code");
      if (info) info.code = code;
    } catch (e) {
      toastError(e);
    }
  }

  async function sendRequest(e: SubmitEvent) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    try {
      const res = await post<{ status: "pending" | "accepted"; displayName: string }>("/api/friends", { code: codeInput });
      toast(res.status === "accepted" ? `Du bist jetzt mit ${res.displayName} befreundet.` : `Anfrage an ${res.displayName} gesendet.`, "success");
      codeInput = "";
      if (route.search) navigate("/bibliothek/freunde", { replace: true });
      await loadInfo();
    } catch (err) {
      toastError(err);
    }
  }

  async function accept(p: Person) {
    try {
      await post(`/api/friends/${p.userId}/accept`);
      toast(`Du bist jetzt mit ${p.displayName} befreundet.`, "success");
      await loadInfo();
    } catch (e) {
      toastError(e);
    }
  }

  async function removeFriend(p: Person, kind: "decline" | "cancel" | "remove") {
    if (kind === "remove" && !(await confirmDialog(`Freundschaft mit ${p.displayName} beenden? Ihr seht dann gegenseitig keine geteilten Bibliotheken mehr.`, { title: "Freund entfernen", confirmLabel: "Entfernen" }))) return;
    try {
      await del(`/api/friends/${p.userId}`);
      await loadInfo();
    } catch (e) {
      toastError(e);
    }
  }

  async function copyFromFriend(item: LibraryItem) {
    if (!friendLibrary) return;
    try {
      await post(`/api/friends/${friendLibrary.friend.userId}/library/${item.id}/copy`);
      copied = [...copied, item.id];
      toast(`„${item.name}“ in deine Bibliothek aufgenommen.`, "success");
    } catch (e) {
      toastError(e);
    }
  }
</script>

<AppShell>
  {#if friendId}
    <a class="btn btn-ghost btn-sm back" href="/bibliothek/freunde"><ArrowLeft size={15} /> Freunde</a>
    {#if friendError}
      <div class="empty"><h3>Bibliothek nicht verfügbar</h3><p>{friendError}</p></div>
    {:else if !friendLibrary}
      <div class="spinner"></div>
    {:else}
      <div class="page-header">
        <div>
          <h1>Bibliothek von {friendLibrary.friend.displayName}</h1>
          <p class="muted">Was du übernehmen möchtest, nimmst du als eigene Kopie in deine Bibliothek auf.</p>
        </div>
      </div>
      <LibraryList items={friendLibrary.items}>
        {#snippet actions(item)}
          {#if copied.includes(item.id)}
            <span class="small done"><Check size={14} /> Aufgenommen</span>
          {:else}
            <button class="btn btn-sm btn-primary" onclick={() => copyFromFriend(item)}><Icon name="library" size={14} /> In eigene Bibliothek aufnehmen</button>
          {/if}
        {/snippet}
        {#snippet empty()}
          <p class="muted">Die Bibliothek ist noch leer.</p>
        {/snippet}
      </LibraryList>
    {/if}
  {:else}
    <div class="page-header">
      <div>
        <h1>Bibliothek</h1>
        <p class="muted">Fähigkeiten, Angriffe, Rüstungen und Zauber zum Wiederverwenden bei deinen Charakteren – und zum Teilen mit Freunden.</p>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <a role="tab" href="/bibliothek" aria-selected={section === "eigene"} class:active={section === "eigene"}><Icon name="library" size={15} /> Meine Bibliothek</a>
      <a role="tab" href="/bibliothek/freunde" aria-selected={section === "freunde"} class:active={section === "freunde"}>
        <Users size={15} /> Freunde
        {#if info?.incoming.length}<span class="badge badge-accent">{info.incoming.length}</span>{/if}
      </a>
    </div>

    {#if section === "eigene"}
      {#if info}
        <label class="card share">
          <input type="checkbox" checked={info.libraryShared} onchange={e => setShared((e.currentTarget as HTMLInputElement).checked)} />
          <span class="grow">
            <strong><Share2 size={15} /> Mit Freunden teilen</strong>
            <span class="small muted block">Alle deine Freunde können deine Bibliothek ansehen, durchsuchen und Einträge als eigene Kopie übernehmen.</span>
          </span>
        </label>
      {/if}
      {#if items === null}
        <div class="spinner"></div>
      {:else}
        <LibraryList {items}>
          {#snippet actions(item)}
            <button class="btn btn-sm btn-icon btn-ghost" aria-label="{item.name} umbenennen" onclick={() => startRename(item)}><Icon name="edit" size={14} /></button>
            <button class="btn btn-sm btn-icon btn-ghost" aria-label="{item.name} löschen" onclick={() => remove(item)}><Trash2 size={14} /></button>
          {/snippet}
          {#snippet empty()}
            <div class="empty">
              <h3>Noch leer</h3>
              <p>
                Im Charakterbogen nimmst du Fähigkeiten, Angriffe und Rüstungen über „In Bibliothek“ auf, im Zauberbuch eigene Zauber.
                Bei einem anderen Charakter übernimmst du sie dann mit „Aus Bibliothek“.
              </p>
            </div>
          {/snippet}
        </LibraryList>
      {/if}
    {:else if !info}
      <div class="spinner"></div>
    {:else}
      <div class="friends-grid">
        <section class="card">
          <h3>Dein Freundescode</h3>
          <p class="code mono">{formattedCode}</p>
          <div class="row">
            <button class="btn btn-sm" onclick={() => copyText(formattedCode, "Code")}><Copy size={14} /> Code kopieren</button>
            <button class="btn btn-sm" onclick={() => copyText(inviteLink, "Einladungslink")}><Share2 size={14} /> Einladungslink</button>
            <button class="btn btn-sm btn-ghost" onclick={renewCode}><RefreshCw size={14} /> Erneuern</button>
          </div>
          <p class="tiny muted">Gib den Code nur Leuten, die du kennst. Gefunden wirst du ausschliesslich über diesen Code.</p>
        </section>

        <section class="card">
          <h3>Freund hinzufügen</h3>
          <form class="row add" onsubmit={sendRequest}>
            <input class="input mono grow" bind:value={codeInput} placeholder="XXXXX-XXXXX" maxlength="20" aria-label="Freundescode" autocomplete="off" />
            <button class="btn btn-primary" type="submit"><UserPlus size={16} /> Anfragen</button>
          </form>
          <p class="tiny muted">Die Freundschaft gilt, sobald die andere Person deine Anfrage annimmt.</p>
        </section>
      </div>

      {#if info.incoming.length}
        <h2 class="section">Anfragen an dich</h2>
        <div class="stack">
          {#each info.incoming as p (p.userId)}
            <div class="card person">
              <span class="grow"><strong>{p.displayName}</strong> <span class="tiny muted">seit {formatDate(p.createdAt)}</span></span>
              <button class="btn btn-sm btn-primary" onclick={() => accept(p)}><Check size={14} /> Annehmen</button>
              <button class="btn btn-sm btn-ghost" onclick={() => removeFriend(p, "decline")}><X size={14} /> Ablehnen</button>
            </div>
          {/each}
        </div>
      {/if}

      <h2 class="section">Freunde</h2>
      {#if info.friends.length === 0}
        <p class="muted small">Noch keine Freunde. Teile deinen Code oder gib den Code eines Freundes ein.</p>
      {:else}
        <div class="stack">
          {#each info.friends as p (p.userId)}
            <div class="card person">
              <span class="grow">
                <strong>{p.displayName}</strong>
                <span class="tiny muted block">Befreundet seit {formatDate(p.since)}{p.libraryShared ? "" : " · teilt die Bibliothek nicht"}</span>
              </span>
              {#if p.libraryShared}
                <a class="btn btn-sm" href="/bibliothek/freunde/{p.userId}"><Icon name="library" size={14} /> Bibliothek ansehen</a>
              {/if}
              <button class="btn btn-sm btn-icon btn-ghost" aria-label="{p.displayName} entfernen" onclick={() => removeFriend(p, "remove")}><UserMinus size={14} /></button>
            </div>
          {/each}
        </div>
      {/if}

      {#if info.outgoing.length}
        <h2 class="section">Gesendete Anfragen</h2>
        <div class="stack">
          {#each info.outgoing as p (p.userId)}
            <div class="card person">
              <span class="grow"><strong>{p.displayName}</strong> <span class="tiny muted">wartet auf Bestätigung</span></span>
              <button class="btn btn-sm btn-ghost" onclick={() => removeFriend(p, "cancel")}><X size={14} /> Zurückziehen</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</AppShell>

{#if renaming}
  <Modal title="Umbenennen" size="sm" onclose={() => (renaming = null)}>
    <form id="rename-form" onsubmit={rename}>
      <input class="input" bind:value={newName} maxlength="200" aria-label="Name" />
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (renaming = null)}>Abbrechen</button>
      <button class="btn btn-primary" type="submit" form="rename-form">Speichern</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .back { margin: -0.5rem 0 0.8rem -0.5rem; }
  .tabs { display: flex; gap: 0.2rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
  .tabs a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.55rem 0.9rem;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }
  .tabs a.active { color: var(--accent-text); border-bottom-color: var(--accent); }
  .share { display: flex; align-items: flex-start; gap: 0.7rem; cursor: pointer; margin-bottom: 1rem; padding: 0.8rem 0.9rem; }
  .share input { margin-top: 0.25rem; width: 1.1rem; height: 1.1rem; accent-color: var(--accent-strong); }
  .share strong { display: inline-flex; align-items: center; gap: 0.35rem; }
  .block { display: block; }
  .friends-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .friends-grid h3 { margin: 0 0 0.5rem; }
  .code { font-size: 1.5rem; font-weight: 800; letter-spacing: 0.08em; margin: 0 0 0.6rem; }
  .add { gap: 0.4rem; flex-wrap: nowrap; }
  .section { font-size: 1.05rem; margin: 1.8rem 0 0.7rem; }
  .person { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.7rem 0.9rem; }
  .done { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--success); }
</style>
