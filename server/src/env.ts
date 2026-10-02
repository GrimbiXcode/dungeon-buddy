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
  /** Leer: "::" (IPv4 + IPv6), damit auch Health-Checks auf "localhost" (::1) greifen. */
  host: process.env.HOST ?? "",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://dnd:dnd@localhost:5432/dungeonbuddy",
  appSecret: process.env.APP_SECRET ?? "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, ""),
  telegramAllowedIds: list(process.env.TELEGRAM_ALLOWED_IDS),
  telegramOpenRegistration: flag(process.env.TELEGRAM_OPEN_REGISTRATION),
  /** Telegram-ID des Betreibers: wird bei jedem Login Admin. */
  ownerTelegramId: (process.env.OWNER_TELEGRAM_ID ?? "").trim(),
  /** Öffentliche Adresse, für Links in Bot-Nachrichten (optional). */
  appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
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
  /** S3-kompatibler Object Storage für Anhänge. Ohne Bucket sind Anhänge aus. */
  s3: {
    endpoint: (process.env.S3_ENDPOINT ?? "").trim(),
    region: (process.env.S3_REGION ?? "").trim() || "us-east-1",
    bucket: (process.env.S3_BUCKET ?? "").trim(),
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    /** Pfad-Adressierung (bucket im Pfad), nötig z. B. für SeaweedFS */
    forcePathStyle: flag(process.env.S3_FORCE_PATH_STYLE),
    /** Fehlenden Bucket beim Start anlegen (lokales SeaweedFS) */
    createBucket: flag(process.env.S3_CREATE_BUCKET),
  },
};

export function assertEnv() {
  if (env.isProduction && env.appSecret.length < 32) {
    throw new Error(
      "APP_SECRET fehlt oder ist zu kurz (mind. 32 Zeichen). Erzeugen z. B. mit: openssl rand -hex 32"
    );
  }
  const s3 = env.s3;
  const s3Given = [s3.endpoint, s3.bucket, s3.accessKeyId, s3.secretAccessKey].filter(Boolean).length;
  if (s3Given > 0 && s3Given < 4) {
    throw new Error("S3-Konfiguration unvollständig: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY setzen.");
  }
  if (!env.appSecret) {
    // Entwicklung: festes, unsicheres Secret, damit der Start ohne .env klappt.
    env.appSecret = "dev-secret-dev-secret-dev-secret-dev-secret";
    console.warn("[env] APP_SECRET nicht gesetzt – unsicheres Entwicklungs-Secret aktiv.");
  }
}
