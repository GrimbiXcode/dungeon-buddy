import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { preventPasswordManagers } from "./lib/no-autofill";

// iOS Safari ignoriert user-scalable=no: Pinch-Zoom über die Gesten- und Mehrfinger-Touch-Events unterbinden.
// Eigene Gesten (z. B. Netzwerkgraph) laufen über Pointer-Events und sind davon nicht betroffen.
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
document.addEventListener(
  "touchmove",
  e => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

// Keine Passwortmanager bei Feldern wie „Name“ (die App hat keine Passwörter)
preventPasswordManagers();

declare global {
  interface Window {
    __dbBooted?: () => void;
    __dbRecover?: (manual: boolean, afterBoot?: boolean) => void;
  }
}

const app = mount(App, { target: document.getElementById("app")! });
// Start geglückt: Selbstreparatur aus public/boot-guard.js abschalten
window.__dbBooted?.();

// Nachgeladene Teile (z. B. Anhänge) passen nicht mehr zur Version auf dem Server: Zwischenspeicher leeren, neu laden
window.addEventListener("vite:preloadError", e => {
  if (!window.__dbRecover) return;
  e.preventDefault();
  window.__dbRecover(false, true);
});

export default app;
