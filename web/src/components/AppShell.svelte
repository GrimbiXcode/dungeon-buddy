<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { Snippet } from "svelte";
  import Logo from "./Logo.svelte";
  import { session } from "../lib/session.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
  <header class="topbar">
    <a href="/" class="home" aria-label="Zur Übersicht"><Logo /></a>
    <nav class="row nav">
      {#if session.user?.role === "admin"}
        <a href="/verwaltung" class="btn btn-ghost"><Icon name="admin" size={18} /><span class="label-text">Verwaltung</span></a>
      {/if}
      <a href="/profil" class="btn btn-ghost profile">
        <Icon name="profile" size={18} />
        <span class="name">{session.user?.displayName}</span>
      </a>
    </nav>
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  .shell { min-height: 100dvh; display: flex; flex-direction: column; }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem max(1rem, env(safe-area-inset-left));
    background: color-mix(in oklab, var(--bg) 85%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .home:hover { text-decoration: none; }
  main {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  .home { flex: none; }
  /* Kopfzeile bleibt einzeilig: zur Not wird der Name gekürzt bzw. auf kleinsten Handys ausgeblendet */
  .nav { gap: 0.2rem; flex-wrap: nowrap; min-width: 0; }
  .profile { min-width: 0; }
  .nav :global(svg) { flex: none; }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 480px) {
    .label-text { display: none; }
    .name { max-width: 9rem; }
  }
  @media (max-width: 360px) {
    .name { display: none; }
  }
</style>
