<script lang="ts">
  import type { LucideProps } from "@lucide/svelte";
  import { appearance } from "../lib/appearance.svelte";
  import { ICONS, type IconName } from "../lib/icons";
  import { GAME_ICONS } from "../lib/icons/gameIcons";

  let { name, size = 24, ...rest }: LucideProps & { name: IconName } = $props();

  const icon = $derived(ICONS[name]);
</script>

{#if appearance.mode === "adventurer"}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    {...rest}
    class={["game-icon", rest.class]}
  >
    {#each GAME_ICONS[icon.game] as d, i (i)}<path {d} />{/each}
  </svg>
{:else}
  <icon.lucide {size} {...rest} />
{/if}
