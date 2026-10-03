/**
 * Die App hat keine Passwörter (Anmeldung über Telegram). Damit Passwortmanager
 * und Browser-Autofill nicht bei Feldern wie „Name“ anspringen, bekommt jedes
 * Eingabefeld die Ignorier-Attribute der gängigen Manager.
 */
const IGNORE_ATTRS: [string, string][] = [
  ["data-1p-ignore", "true"], // 1Password
  ["data-lpignore", "true"], // LastPass
  ["data-bwignore", "true"], // Bitwarden
  ["data-form-type", "other"], // Dashlane
  ["data-protonpass-ignore", "true"], // Proton Pass
];

/** Felder, die kein Manager ausfüllt */
const SKIP_TYPES = new Set(["checkbox", "radio", "range", "file", "button", "submit", "reset", "hidden", "color", "image"]);

export function shieldField(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return;
  const autocomplete = el.getAttribute("autocomplete");
  // Bewusst gesetztes Autofill behalten, z. B. "one-time-code" für den Anmeldecode
  if (autocomplete && autocomplete !== "off") return;
  if (!autocomplete) el.setAttribute("autocomplete", "off");
  for (const [name, value] of IGNORE_ATTRS) if (!el.hasAttribute(name)) el.setAttribute(name, value);
}

export function shieldTree(root: Element) {
  shieldField(root);
  for (const el of root.querySelectorAll("input, textarea")) shieldField(el);
}

/** Alle jetzigen und künftigen Felder der Seite schützen. */
export function preventPasswordManagers(root: HTMLElement = document.body) {
  shieldTree(root);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) shieldTree(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
