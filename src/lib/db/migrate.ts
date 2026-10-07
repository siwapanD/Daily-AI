import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "../env";
import { logger } from "../logger";

const LOCK_ID = 727274; // arbitrary advisory lock id for DAILY AI migrations

/** Apply pending migrations on a dedicated single connection. Safe to call concurrently (advisory lock). */
export async function runMigrations(folder = path.join(process.cwd(), "drizzle")) {
  const sql = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${LOCK_ID})`;
    await migrate(drizzle(sql), { migrationsFolder: folder });
    await sql`select pg_advisory_unlock(${LOCK_ID})`;
    logger.info("migrations applied", { folder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
