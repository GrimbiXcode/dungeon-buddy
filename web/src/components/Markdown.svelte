<script lang="ts">
  import { renderMarkdown } from "../lib/markdown";

  let { source, class: className = "" }: { source: string; class?: string } = $props();
  const html = $derived(renderMarkdown(source));
</script>

<div class="prose {className}">{@html html}</div>
