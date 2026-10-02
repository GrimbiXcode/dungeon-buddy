import { assertEnv, env } from "./env.js";
import { migrate, sql } from "./db.js";
import { buildApp } from "./app.js";
import { startTelegramBot } from "./auth/bot.js";
import { purgeExpiredLoginCodes } from "./auth/login-codes.js";
import { purgeOldAbuseEvents } from "./lib/abuse.js";
import { runAbuseCheck } from "./lib/abuse-alert.js";
import { getStorage } from "./lib/storage.js";
import { processStorageDeletions, removeOrphanedObjects } from "./lib/storage-cleanup.js";

type App = Awaited<ReturnType<typeof buildApp>>;

/** Ohne HOST auf "::" (Dual-Stack); Hosts ohne IPv6 fallen auf 0.0.0.0 zurück. */
async function listen(app: App) {
  if (env.host) {
    await app.listen({ port: env.port, host: env.host });
    return;
  }
  try {
    await app.listen({ port: env.port, host: "::" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EAFNOSUPPORT" && code !== "EADDRNOTAVAIL") throw err;
    await app.listen({ port: env.port, host: "0.0.0.0" });
  }
}

async function main() {
  assertEnv();
  await migrate();
  const app = await buildApp();
  await listen(app);
  console.log(`[server] ${env.appName} läuft auf Port ${env.port}`);

  startTelegramBot();
  setInterval(() => void purgeExpiredLoginCodes().catch(() => {}), 10 * 60 * 1000).unref();

  // Missbrauchs-Ereignisse nach 90 Tagen löschen; Alarm an Admins prüfen
  void purgeOldAbuseEvents().catch(() => {});
  setInterval(() => void purgeOldAbuseEvents().catch(() => {}), 6 * 60 * 60 * 1000).unref();
  if (env.isProduction) {
    setInterval(
      () => void runAbuseCheck().catch(e => console.warn("[abuse] Prüfung fehlgeschlagen:", (e as Error).message)),
      15 * 60 * 1000
    ).unref();
  }

  // Anhänge: vorgemerkte Objekte löschen, verwaiste Objekte aufräumen
  const storage = getStorage();
  if (storage) {
    // Nicht fatal: Die App läuft weiter, nur Anhänge schlagen dann fehl.
    await storage.ensureReady?.(env.s3.createBucket).catch(e => console.error("[storage]", (e as Error).message));
    const warn = (what: string) => (e: unknown) => console.warn(`[storage] ${what} fehlgeschlagen:`, (e as Error).message);
    void processStorageDeletions().catch(warn("Löschen"));
    setInterval(() => void processStorageDeletions().catch(warn("Löschen")), 5 * 60 * 1000).unref();
    setInterval(() => void removeOrphanedObjects().catch(warn("Aufräumen")), 24 * 60 * 60 * 1000).unref();
  } else {
    console.log("[storage] Kein S3-Bucket konfiguriert – Anhänge sind aus.");
  }
  if (env.telegramOpenRegistration && env.telegramAllowedIds.length === 0 && !env.ownerTelegramId) {
    console.warn("[auth] Offene Registrierung ohne OWNER_TELEGRAM_ID – es gibt keinen Admin.");
  }

  const shutdown = async () => {
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(err => {
  console.error("[server] Start fehlgeschlagen:", err);
  process.exit(1);
});
