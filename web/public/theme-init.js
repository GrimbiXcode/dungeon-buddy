/* Setzt das Farbschema vor dem ersten Rendern, damit nichts aufblitzt. */
(function () {
  try {
    var mode = localStorage.getItem("db-color-mode") || "system";
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.mode = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.mode = "dark";
  }
})();
