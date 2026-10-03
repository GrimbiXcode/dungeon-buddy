import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

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

const app = mount(App, { target: document.getElementById("app")! });

export default app;
