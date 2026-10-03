/*
 * Selbstreparatur beim Start. Lädt die App nicht (z. B. weil der
 * Offline-Zwischenspeicher nach einem Update nicht zur Version auf dem Server
 * passt), werden Service Worker und Caches einmal gelöscht und die Seite neu
 * geladen. Klappt auch das nicht, erscheint ein Hinweis statt einer leeren Seite.
 * src/main.ts meldet den erfolgreichen Start über window.__dbBooted().
 */
(function () {
  var FLAG = "db-boot-recovered";
  var booted = false;
  var recovering = false;

  function flagged() {
    try {
      return sessionStorage.getItem(FLAG) === "1";
    } catch (e) {
      return false;
    }
  }

  function showFallback() {
    var root = document.getElementById("app");
    if (!root || root.childElementCount) return;
    root.innerHTML =
      '<div style="max-width:28rem;margin:20vh auto;padding:1.5rem;font-family:system-ui,sans-serif;text-align:center;color:inherit">' +
      "<h1 style=\"font-size:1.3rem\">Dungeon Buddy konnte nicht geladen werden.</h1>" +
      "<p>Bitte lade die Seite neu. Hilft das nicht, lösche die Website-Daten dieser Seite im Browser.</p>" +
      '<button type="button" style="font:inherit;padding:0.5rem 1rem;border-radius:8px;cursor:pointer">Neu laden</button>' +
      "</div>";
    root.querySelector("button").onclick = function () {
      recover(true);
    };
  }

  /**
   * Service Worker abmelden, Caches leeren, neu laden. Automatisch nur einmal
   * pro Sitzung (danach Hinweis), damit keine Neulade-Schleife entsteht.
   * afterBoot: auch nach dem Start (nachgeladener Teil fehlt).
   */
  function recover(manual, afterBoot) {
    if ((booted && !afterBoot) || recovering) return;
    if (!manual && flagged()) {
      if (!booted) showFallback();
      return;
    }
    recovering = true;
    try {
      sessionStorage.setItem(FLAG, "1");
    } catch (e) {}
    var steps = [];
    if ("serviceWorker" in navigator) {
      steps.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    if (window.caches) {
      steps.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        })
      );
    }
    Promise.all(steps)
      .catch(function () {})
      .then(function () {
        location.reload();
      });
  }

  window.__dbRecover = recover;
  window.__dbBooted = function () {
    booted = true;
    clearTimeout(timer);
    // Nach erfolgreichem Start darf eine spätere Störung wieder selbst repariert werden
    setTimeout(function () {
      try {
        sessionStorage.removeItem(FLAG);
      } catch (e) {}
    }, 10000);
  };

  // Skript oder Stylesheet der App nicht ladbar, oder Fehler vor dem Start
  window.addEventListener(
    "error",
    function (e) {
      if (booted) return;
      var t = e.target;
      var isAsset = t && (t.tagName === "SCRIPT" || t.tagName === "LINK");
      if (isAsset || e.error) recover(false);
    },
    true
  );
  window.addEventListener("unhandledrejection", function () {
    if (!booted) recover(false);
  });

  // Keine Rückmeldung in angemessener Zeit: mit Zwischenspeicher reparieren, sonst Hinweis
  var timer = setTimeout(function () {
    if (booted) return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) recover(false);
    else showFallback();
  }, 15000);
})();
