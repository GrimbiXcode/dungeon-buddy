import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { env } from "./env.js";

export const sql = postgres(env.databaseUrl, {
  max: 10,
  // Keine Hinweise wie "relation already exists" im Log
  onnotice: () => {},
  transform: postgres.camel,
  // Kalenderdaten (date) als "YYYY-MM-DD" belassen statt in Date-Objekte mit
  // Zeitzone umzuwandeln – sonst verschiebt sich ein Datum je nach Zeitzone.
  types: {
    date: {
      to: 1082,
      from: [1082],
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
  },
});

export type Sql = typeof sql;

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations"
);

/**
 * Wendet alle noch nicht eingespielten SQL-Migrationen in alphabetischer
 * Reihenfolge an. Jede Datei läuft in einer eigenen Transaktion. Ein
 * Advisory-Lock verhindert, dass zwei gleichzeitig startende Instanzen sich
 * in die Quere kommen.
 */
export async function migrate() {
  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith(".sql"))
    .sort();

  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(4711)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const done = new Set(
      (await tx<{ name: string }[]>`SELECT name FROM schema_migrations`).map(r => r.name)
    );
    for (const file of files) {
      if (done.has(file)) continue;
      const content = await readFile(path.join(migrationsDir, file), "utf8");
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      console.log(`[db] Migration angewendet: ${file}`);
    }
  });
}
