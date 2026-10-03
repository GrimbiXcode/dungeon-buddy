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

  // Favicon folgt dem Schema, das App-Icon der eigenen Wahl (gleiche Muster wie in src/lib/logo.ts)
  var icon;
  try {
    icon = localStorage.getItem("db-app-icon");
  } catch (e) {}
  if (icon !== "light" && icon !== "adventurer") icon = "dark";
  var links = {
    icon: "/icons/favicon-" + mode + ".svg",
    "apple-touch-icon": "/icons/apple-touch-icon-" + icon + ".png",
    manifest: "/manifest-" + icon + ".webmanifest",
  };
  for (var rel in links) {
    var link = document.querySelector('link[rel="' + rel + '"]');
    if (link) link.href = links[rel];
  }
  var colors = { light: "#f6f2ea", dark: "#1a1625", adventurer: "#1e1f22" };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = colors[mode];
})();
