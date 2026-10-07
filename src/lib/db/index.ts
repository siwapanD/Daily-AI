import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../env";

type DB = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { __dailyaiSql?: postgres.Sql; __dailyaiDb?: DB };

export function getSql(): postgres.Sql {
  if (!g.__dailyaiSql) {
    g.__dailyaiSql = postgres(env.databaseUrl, { max: 10, idle_timeout: 30, onnotice: () => {} });
  }
  return g.__dailyaiSql;
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    if (!g.__dailyaiDb) g.__dailyaiDb = drizzle(getSql(), { schema });
    const v = Reflect.get(g.__dailyaiDb, prop);
    return typeof v === "function" ? v.bind(g.__dailyaiDb) : v;
  },
});

export async function closeDb() {
  if (g.__dailyaiSql) await g.__dailyaiSql.end({ timeout: 5 });
  g.__dailyaiSql = undefined;
  g.__dailyaiDb = undefined;
}

export { schema };
