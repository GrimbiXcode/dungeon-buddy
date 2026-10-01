import { assertEnv, env } from "./env.js";
import { migrate, sql } from "./db.js";
import { buildApp } from "./app.js";
import { startTelegramBot } from "./auth/bot.js";
import { purgeExpiredLoginCodes } from "./auth/login-codes.js";

async function main() {
  assertEnv();
  await migrate();
  const app = await buildApp();
  await app.listen({ port: env.port, host: env.host });
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
