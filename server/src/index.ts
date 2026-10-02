import { assertEnv, env } from "./env.js";
import { migrate, sql } from "./db.js";
import { buildApp } from "./app.js";
import { startTelegramBot } from "./auth/bot.js";
import { purgeExpiredLoginCodes } from "./auth/login-codes.js";

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
