/* Setzt das Farbschema vor dem ersten Rendern, damit nichts aufblitzt. */
(function () {
  try {
    var mode = localStorage.getItem("db-color-mode") || "system";
    if (mode === "system") mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.mode = mode === "light" || mode === "adventurer" ? mode : "dark";
  } catch (e) {
    document.documentElement.dataset.mode = "dark";
  }
})();
