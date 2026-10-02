<script lang="ts">
  import AppShell from "../components/AppShell.svelte";
  import AdminUsers from "../components/admin/AdminUsers.svelte";
  import AdminRequests from "../components/admin/AdminRequests.svelte";
  import AdminAbuse from "../components/admin/AdminAbuse.svelte";
  import AdminSystem from "../components/admin/AdminSystem.svelte";
  import NotFoundInline from "../components/NotFoundInline.svelte";

  let { section }: { section: string } = $props();

  const tabs = [
    { key: "nutzer", label: "Nutzer", href: "/verwaltung" },
    { key: "antraege", label: "Entsperr-Anträge", href: "/verwaltung/antraege" },
    { key: "missbrauch", label: "Missbrauch", href: "/verwaltung/missbrauch" },
    { key: "system", label: "System", href: "/verwaltung/system" },
  ];
</script>

<AppShell>
  <div class="page-header">
    <div>
      <h1>Verwaltung</h1>
      <p class="muted">Nutzer, Sperren und Missbrauchsschutz dieser Instanz.</p>
    </div>
  </div>

  <nav class="segmented tabs" aria-label="Bereiche">
    {#each tabs as t (t.key)}
      <a href={t.href} aria-current={section === t.key ? "page" : undefined}>{t.label}</a>
    {/each}
  </nav>

  {#if section === "nutzer"}
    <AdminUsers />
  {:else if section === "antraege"}
    <AdminRequests />
  {:else if section === "missbrauch"}
    <AdminAbuse />
  {:else if section === "system"}
    <AdminSystem />
  {:else}
    <NotFoundInline />
  {/if}
</AppShell>

<style>
  .tabs { margin-bottom: 1rem; flex-wrap: wrap; }
  .tabs a {
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    color: var(--muted);
    font-weight: 550;
    font-size: 0.88rem;
    text-decoration: none;
  }
  .tabs a[aria-current="page"] { background: var(--accent-strong); color: var(--accent-contrast); }
</style>
