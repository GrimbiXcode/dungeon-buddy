/**
 * Minimaler History-Router. Interne Links (<a href="/...">) werden global in
 * App.svelte abgefangen, programmatisch navigiert man mit `navigate()`.
 */
export const route = $state({ path: location.pathname, search: location.search });

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = new URL(to, location.origin);
  if (url.pathname === route.path && url.search === route.search) return;
  if (opts.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  route.path = url.pathname;
  route.search = url.search;
  window.scrollTo(0, 0);
}

window.addEventListener("popstate", () => {
  route.path = location.pathname;
  route.search = location.search;
});

/** Vergleicht einen Pfad mit einem Muster wie "/k/:id/tagebuch". */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) params[p[i]!.slice(1)] = decodeURIComponent(s[i]!);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

/** Fängt Klicks auf interne Links ab und navigiert ohne Neuladen. */
export function interceptLinks(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = (event.target as Element | null)?.closest?.("a");
  if (!a || a.target || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return;
  if (href.endsWith(".html")) return;
  event.preventDefault();
  navigate(href);
}
