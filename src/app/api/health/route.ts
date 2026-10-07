import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { json } from "@/lib/api";

export async function GET() {
  const t0 = Date.now();
  try {
    const rows = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return json({ status: "ok", db: "ok", migrations: (rows[0] as { n: number }).n, latencyMs: Date.now() - t0, time: new Date().toISOString() });
  } catch (e) {
    return json({ status: "error", db: "error", error: e instanceof Error ? e.message : String(e) }, 503);
  }
}
