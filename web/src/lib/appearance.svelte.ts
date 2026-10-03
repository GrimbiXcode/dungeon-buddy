export type ResolvedMode = "light" | "dark" | "adventurer";

function initialMode(): ResolvedMode {
  const mode = typeof document === "undefined" ? undefined : document.documentElement.dataset.mode;
  return mode === "light" || mode === "adventurer" ? mode : "dark";
}

/** Aktuell angewendetes Farbschema (reaktiv), gesetzt von applyColorMode. */
export const appearance = $state({ mode: initialMode() });
