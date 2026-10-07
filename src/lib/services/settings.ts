import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { encrypt, decrypt } from "../security/crypto";

export const SECRET_KEYS = [
  "LLM_API_KEY", "GITHUB_TOKEN",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_TO", "NOTIFY_WEBHOOK_URL",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

/** Env wins; otherwise the encrypted value stored in system_settings. Never send to the client. */
export async function getSecret(name: SecretKey): Promise<string> {
  if (process.env[name]) return process.env[name]!;
  const [row] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, `secret:${name}`));
  if (!row) return "";
  try {
    return decrypt(String(row.value));
  } catch {
    return "";
  }
}

export async function setSecret(name: SecretKey, value: string) {
  const key = `secret:${name}`;
  if (!value) {
    await db.delete(schema.systemSettings).where(eq(schema.systemSettings.key, key));
    return;
  }
  const enc = encrypt(value);
  await db
    .insert(schema.systemSettings)
    .values({ key, value: enc, isSecret: true })
    .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value: enc, updatedAt: new Date() } });
}

/** Which secrets are configured (and where) — safe to show in the UI. */
export async function secretStatus(): Promise<Record<SecretKey, "env" | "db" | "missing">> {
  const rows = await db.select({ key: schema.systemSettings.key }).from(schema.systemSettings);
  const inDb = new Set(rows.map((r) => r.key));
  return Object.fromEntries(
    SECRET_KEYS.map((k) => [k, process.env[k] ? "env" : inDb.has(`secret:${k}`) ? "db" : "missing"]),
  ) as Record<SecretKey, "env" | "db" | "missing">;
}
