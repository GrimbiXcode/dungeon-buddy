<script lang="ts">
  import type { Snippet } from "svelte";
  import { CircleUser } from "@lucide/svelte";
  import Logo from "./Logo.svelte";
  import { session } from "../lib/session.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
  <header class="topbar">
    <a href="/" class="home" aria-label="Zur Übersicht"><Logo /></a>
    <a href="/profil" class="btn btn-ghost profile">
      <CircleUser size={18} />
      <span class="name">{session.user?.displayName}</span>
    </a>
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
  @media (max-width: 480px) {
    .name { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; }
  }
</style>
