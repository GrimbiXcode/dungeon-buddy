<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "./lib/api";
  import { session } from "./lib/session.svelte";
  import { interceptLinks, match, navigate, route } from "./lib/router.svelte";
  import { applyColorMode, storedColorMode } from "./lib/themes";
  import type { AuthInfo, User } from "./lib/types";
  import Toasts from "./components/Toasts.svelte";
  import ConfirmDialog from "./components/ConfirmDialog.svelte";
  import DiceModal from "./components/DiceModal.svelte";
  import PwaPrompt from "./components/PwaPrompt.svelte";
  import UnitCalculator from "./components/UnitCalculator.svelte";
  import Landing from "./pages/Landing.svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Profile from "./pages/Profile.svelte";
  import Privacy from "./pages/Privacy.svelte";
  import CampaignLayout from "./pages/CampaignLayout.svelte";
  import NotFound from "./pages/NotFound.svelte";
  import MyCharacters from "./pages/MyCharacters.svelte";
  import CharacterPage from "./pages/CharacterPage.svelte";
  import Blocked from "./pages/Blocked.svelte";
  import Admin from "./pages/Admin.svelte";

  onMount(() => {
    applyColorMode(storedColorMode());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyColorMode(session.user?.settings.colorMode ?? storedColorMode());
    media.addEventListener("change", onChange);
    void loadSession();
    return () => media.removeEventListener("change", onChange);
  });

  async function loadSession() {
    const [info, user] = await Promise.all([
      get<AuthInfo>("/api/auth/info").catch(() => null),
      get<User>("/api/me").catch(() => null),
    ]);
    session.info = info;
    session.user = user;
    session.loaded = true;
  }

  // Farbschema aus dem Profil übernehmen
  $effect(() => {
    if (session.user?.settings.colorMode) applyColorMode(session.user.settings.colorMode);
  });

  const characterParams = $derived(
    match("/charaktere/:id", route.path) ?? match("/charaktere/:id/zauber", route.path)
  );
  const campaignParams = $derived(match("/k/:campaignId", route.path) ?? matchPrefix(route.path));

  function matchPrefix(path: string) {
    const m = /^\/k\/([^/]+)\//.exec(path);
    return m ? { campaignId: decodeURIComponent(m[1]!) } : null;
  }

  // Abgemeldet auf einer geschützten Seite → zur Landingpage
  $effect(() => {
    if (session.loaded && !session.user && route.path !== "/" && route.path !== "/datenschutz") {
      navigate("/", { replace: true });
    }
  });
</script>

<svelte:document onclick={interceptLinks} />

{#if !session.loaded}
  <div class="boot"><div class="spinner"></div></div>
{:else if route.path === "/datenschutz"}
  <Privacy />
{:else if !session.user}
  <Landing />
{:else if session.user.blockedAt}
  <Blocked />
{:else if route.path === "/verwaltung" || route.path.startsWith("/verwaltung/")}
  {#if session.user.role === "admin"}
    <Admin section={route.path.split("/")[2] ?? "nutzer"} />
  {:else}
    <NotFound />
  {/if}
{:else if route.path === "/"}
  <Dashboard />
{:else if route.path === "/profil"}
  <Profile />
{:else if route.path === "/charaktere"}
  <MyCharacters />
{:else if characterParams}
  {#key route.path}
    <CharacterPage characterId={characterParams.id} section={route.path.endsWith("/zauber") ? "zauber" : "bogen"} />
  {/key}
{:else if campaignParams}
  {#key campaignParams.campaignId}
    <CampaignLayout campaignId={campaignParams.campaignId} />
  {/key}
{:else}
  <NotFound />
{/if}

{#if session.user && !session.user.blockedAt && session.user.settings.unitCalculator !== false}
  <UnitCalculator />
{/if}
<DiceModal />
<ConfirmDialog />
<Toasts />
<PwaPrompt />

<style>
  .boot {
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }
</style>
