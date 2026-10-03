/* Setzt das Farbschema vor dem ersten Rendern, damit nichts aufblitzt. */
(function () {
  var mode;
  try {
    mode = localStorage.getItem("db-color-mode") || "system";
    if (mode === "system") mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    if (mode !== "light" && mode !== "adventurer") mode = "dark";
  } catch (e) {
    mode = "dark";
  }
  document.documentElement.dataset.mode = mode;

  // Favicon, App-Icon und Manifest passend zum Schema (gleiches Muster wie modeIconLinks in src/lib/logo.ts)
  var links = {
    icon: "/icons/favicon-" + mode + ".svg",
    "apple-touch-icon": "/icons/apple-touch-icon-" + mode + ".png",
    manifest: "/manifest-" + mode + ".webmanifest",
  };
  for (var rel in links) {
    var link = document.querySelector('link[rel="' + rel + '"]');
    if (link) link.href = links[rel];
  }
  var colors = { light: "#f6f2ea", dark: "#1a1625", adventurer: "#1e1f22" };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = colors[mode];
})();
