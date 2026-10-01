/**
 * Konfiguration aus Umgebungsvariablen. Siehe .env.example im Projektwurzel.
 */
function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function flag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://dnd:dnd@localhost:5432/dungeonbuddy",
  appSecret: process.env.APP_SECRET ?? "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, ""),
  telegramAllowedIds: list(process.env.TELEGRAM_ALLOWED_IDS),
  telegramOpenRegistration: flag(process.env.TELEGRAM_OPEN_REGISTRATION),
  /** Name der Instanz, erscheint in Bot-Nachrichten. */
  appName: process.env.APP_NAME ?? "Dungeon Buddy",
  /** Nur ausserhalb der Produktion: Anmeldung ohne Telegram. */
  devLogin: !isProduction && flag(process.env.DEV_LOGIN),
  /** Hinter einem Reverse Proxy die echte Client-IP für das Rate-Limit nutzen. */
  trustProxy: flag(process.env.TRUST_PROXY ?? "1"),
  /** Cookie nur über HTTPS (Standard in Produktion). */
  secureCookies: process.env.SECURE_COOKIES
    ? flag(process.env.SECURE_COOKIES)
    : isProduction,
  staticDir: process.env.STATIC_DIR ?? "",
};

export function assertEnv() {
  if (env.isProduction && env.appSecret.length < 32) {
    throw new Error(
      "APP_SECRET fehlt oder ist zu kurz (mind. 32 Zeichen). Erzeugen z. B. mit: openssl rand -hex 32"
    );
  }
  if (!env.appSecret) {
    // Entwicklung: festes, unsicheres Secret, damit der Start ohne .env klappt.
    env.appSecret = "dev-secret-dev-secret-dev-secret-dev-secret";
    console.warn("[env] APP_SECRET nicht gesetzt – unsicheres Entwicklungs-Secret aktiv.");
  }
}
