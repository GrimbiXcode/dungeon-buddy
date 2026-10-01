/*
  Lädt das offizielle Telegram Login Widget und meldet das Ergebnis per
  postMessage an die Landingpage zurück. Klassisches ES5 ohne Bündelung.
*/
(function () {
  var MESSAGE_SOURCE = "dungeon-buddy-telegram-login";

  function post(message) {
    message.source = MESSAGE_SOURCE;
    window.parent.postMessage(message, window.location.origin);
  }

  var params = new URLSearchParams(window.location.search);
  document.documentElement.style.colorScheme = params.get("theme") === "dark" ? "dark" : "light";

  var bot = params.get("bot") || "";
  // Telegram-Benutzernamen: Buchstaben, Ziffern, Unterstrich
  if (!/^[A-Za-z0-9_]{1,64}$/.test(bot)) return;

  window.onTelegramAuth = function (user) {
    post({ kind: "auth", user: user });
  };

  var script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-widget.js?22";
  script.async = true;
  script.setAttribute("data-telegram-login", bot);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-userpic", "false");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  document.body.appendChild(script);

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function () {
      var box = document.body.getBoundingClientRect();
      post({ kind: "size", width: box.width, height: box.height });
    }).observe(document.body);
  }
})();
