import { and, asc, eq, isNotNull, max, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { PROMPTS, parseTemplate, formatTemplate, type ResolvedPrompt } from "../prompts";

const cache = new Map<string, { value: ResolvedPrompt | null; at: number }>();
const TTL_MS = 30_000;

/** Active prompt version for a key, as chosen in Settings → Prompts. Null = use the code default. */
export async function getActivePrompt(key: string): Promise<ResolvedPrompt | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: ResolvedPrompt | null = null;
  try {
    const [row] = await db
      .select({ version: schema.promptVersions.version, template: schema.promptVersions.template })
      .from(schema.promptVersions)
      .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId))
      .where(and(eq(schema.prompts.key, key), eq(schema.promptVersions.isActive, true)))
      .limit(1);
    // The DB template is authoritative: the seed mirrors code versions, the UI adds new ones.
    if (row) value = { version: row.version, ...parseTemplate(row.template) };
  } catch {
    value = null; // DB unavailable → code default
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function listPromptVersions() {
  return db
    .select({
      id: schema.promptVersions.id, key: schema.prompts.key, description: schema.prompts.description,
      version: schema.promptVersions.version, template: schema.promptVersions.template,
      isActive: schema.promptVersions.isActive, createdAt: schema.promptVersions.createdAt,
    })
    .from(schema.promptVersions)
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId))
    .orderBy(asc(schema.prompts.key), asc(schema.promptVersions.version));
}

async function promptId(key: string): Promise<number> {
  if (!PROMPTS[key]) throw new Error(`Unknown prompt: ${key}`);
  const [p] = await db.select({ id: schema.prompts.id }).from(schema.prompts).where(eq(schema.prompts.key, key));
  if (!p) throw new Error(`Prompt ${key} not seeded`);
  return p.id;
}

/** Make exactly one version of a prompt active. */
export async function activatePromptVersion(key: string, version: number) {
  const id = await promptId(key);
  await db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: schema.promptVersions.id }).from(schema.promptVersions)
      .where(and(eq(schema.promptVersions.promptId, id), eq(schema.promptVersions.version, version)));
    if (!exists) throw new Error(`${key}-v${version} does not exist`);
    await tx.update(schema.promptVersions).set({ isActive: false }).where(eq(schema.promptVersions.promptId, id));
    await tx.update(schema.promptVersions).set({ isActive: true }).where(eq(schema.promptVersions.id, exists.id));
  });
  cache.delete(key);
}

/** Create the next version of a prompt (for A/B benchmarking via llm_runs.prompt_version). */
export async function createPromptVersion(key: string, system: string, user: string, activate = false) {
  if (!system.trim() || !user.trim()) throw new Error("System and user templates are required");
  const id = await promptId(key);
  const [{ v }] = await db.select({ v: max(schema.promptVersions.version) }).from(schema.promptVersions)
    .where(eq(schema.promptVersions.promptId, id));
  const version = (v ?? 0) + 1;
  await db.insert(schema.promptVersions).values({ promptId: id, version, template: formatTemplate(system, user), isActive: false });
  if (activate) await activatePromptVersion(key, version);
  return version;
}

/** Usage per prompt version, to compare versions on cost, latency and failure rate. */
export async function promptVersionStats() {
  const rows = await db
    .select({
      promptVersion: schema.llmRuns.promptVersion,
      calls: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where not ${schema.llmRuns.success})::int`,
      tokens: sql<number>`coalesce(sum(${schema.llmRuns.inputTokens} + ${schema.llmRuns.outputTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${schema.llmRuns.estimatedCost}), 0)::float`,
      avgLatency: sql<number>`coalesce(avg(${schema.llmRuns.latencyMs}), 0)::int`,
    })
    .from(schema.llmRuns)
    .where(and(isNotNull(schema.llmRuns.promptVersion), eq(schema.llmRuns.cached, false)))
    .groupBy(schema.llmRuns.promptVersion);
  return new Map(rows.map((r) => [r.promptVersion!, r]));
}
