import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { logger, errMsg } from "../logger";
import { sha256 } from "../security/crypto";
import { truncate } from "../pipeline/normalize";
import { LocalHashEmbedding, OpenAICompatibleEmbedding, type EmbeddingProvider } from "../llm/embeddings";
import { estimateCost, tokensUsedToday, BudgetExceededError } from "../llm";
import { getSecret } from "./settings";

type EntityType = "article" | "knowledge";

export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  const cfg = env.embeddings;
  if (cfg.provider === "openai-compatible" && cfg.model && cfg.baseUrl) {
    const key = cfg.apiKey || (await getSecret("LLM_API_KEY"));
    return new OpenAICompatibleEmbedding(cfg.baseUrl, key, cfg.model);
  }
  return new LocalHashEmbedding();
}

/** Embed with budget check + llm_runs logging for paid providers. */
async function embedTexts(provider: EmbeddingProvider, texts: string[]) {
  if (provider.name === "local") return provider.embed(texts);
  const used = await tokensUsedToday();
  if (used.tokens >= env.llm.dailyTokenLimit) throw new BudgetExceededError(used.tokens, env.llm.dailyTokenLimit);
  const t0 = Date.now();
  try {
    const r = await provider.embed(texts);
    await db.insert(schema.llmRuns).values({
      provider: provider.name, model: provider.model, task: "embed", inputTokens: r.tokens, outputTokens: 0,
      estimatedCost: estimateCost(provider.model, r.tokens, 0), latencyMs: Date.now() - t0, success: true,
    });
    return r;
  } catch (e) {
    await db.insert(schema.llmRuns).values({
      provider: provider.name, model: provider.model, task: "embed", latencyMs: Date.now() - t0, success: false, error: errMsg(e).slice(0, 1000),
    });
    throw e;
  }
}

const articleText = (a: { title: string; summary: string | null; excerpt: string | null; whyItMatters: string | null }) =>
  truncate([a.title, a.summary ?? a.excerpt ?? "", a.whyItMatters ?? ""].filter(Boolean).join("\n"), 2000);
const knowledgeText = (k: { title: string; summary: string | null; contentMd: string }) =>
  truncate([k.title, k.summary ?? "", k.contentMd].filter(Boolean).join("\n"), 2000);

/** Create/refresh embeddings for articles and knowledge items whose text or model changed. */
export async function embedPending(limit = 300) {
  const provider = await getEmbeddingProvider();
  const existing = await db.select({ entityType: schema.embeddings.entityType, entityId: schema.embeddings.entityId, model: schema.embeddings.model, contentHash: schema.embeddings.contentHash }).from(schema.embeddings);
  const have = new Map(existing.map((e) => [`${e.entityType}:${e.entityId}`, e]));

  const articles = await db.select({ id: schema.articles.id, title: schema.articles.title, summary: schema.articles.summary, excerpt: schema.articles.excerpt, whyItMatters: schema.articles.whyItMatters })
    .from(schema.articles)
    .where(and(inArray(schema.articles.status, ["classified", "analyzed"]), or(isNull(schema.articles.userAction), ne(schema.articles.userAction, "ignore"))));
  const knowledge = await db.select({ id: schema.knowledgeItems.id, title: schema.knowledgeItems.title, summary: schema.knowledgeItems.summary, contentMd: schema.knowledgeItems.contentMd })
    .from(schema.knowledgeItems);

  const todo: { type: EntityType; id: number; text: string; hash: string }[] = [];
  for (const a of articles) todo.push({ type: "article", id: a.id, text: articleText(a), hash: "" });
  for (const k of knowledge) todo.push({ type: "knowledge", id: k.id, text: knowledgeText(k), hash: "" });
  const stale = todo
    .map((t) => ({ ...t, hash: sha256(t.text) }))
    .filter((t) => {
      const e = have.get(`${t.type}:${t.id}`);
      return !e || e.model !== provider.model || e.contentHash !== t.hash;
    });
  const pending = stale.slice(0, limit);

  let embedded = 0;
  for (let i = 0; i < pending.length; i += 32) {
    const batch = pending.slice(i, i + 32);
    const r = await embedTexts(provider, batch.map((b) => b.text));
    for (const [j, b] of batch.entries()) {
      const values = { entityType: b.type, entityId: b.id, model: r.model, dims: r.vectors[j].length, vector: r.vectors[j], contentHash: b.hash, updatedAt: new Date() };
      await db.insert(schema.embeddings).values(values)
        .onConflictDoUpdate({ target: [schema.embeddings.entityType, schema.embeddings.entityId], set: values });
    }
    embedded += batch.length;
  }
  // Drop vectors whose entity no longer exists.
  await db.execute(sql`delete from embeddings e where (e.entity_type = 'article' and not exists (select 1 from articles a where a.id = e.entity_id))
    or (e.entity_type = 'knowledge' and not exists (select 1 from knowledge_items k where k.id = e.entity_id))`);
  return { provider: provider.name, model: provider.model, embedded, remaining: stale.length - embedded };
}

/** Minimum similarity worth showing. Lexical hashing scores run much lower than model embeddings. */
function minScore(model: string, purpose: "search" | "related") {
  const local = model.startsWith("local-hash");
  return purpose === "search" ? (local ? 0.05 : 0.2) : (local ? 0.1 : 0.35);
}

export interface SemanticHit {
  type: EntityType;
  id: number;
  title: string;
  score: number;
  meta: string | null;
}

/** Rank stored vectors by cosine similarity to `vector` (vectors are normalized, so dot = cosine). */
async function nearest(vector: number[], model: string, limit: number, exclude?: { type: EntityType; id: number }): Promise<SemanticHit[]> {
  const q = `{${vector.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}}`;
  const rows = await db.execute(sql`
    select e.entity_type as type, e.entity_id as id,
           coalesce(a.title, k.title) as title,
           coalesce(a.recommendation, k.status) as meta,
           (select sum(x * y) from unnest(e.vector, ${q}::real[]) as t(x, y)) as score
    from embeddings e
    left join articles a on e.entity_type = 'article' and a.id = e.entity_id
    left join knowledge_items k on e.entity_type = 'knowledge' and k.id = e.entity_id
    where e.model = ${model}
      ${exclude ? sql`and not (e.entity_type = ${exclude.type} and e.entity_id = ${exclude.id})` : sql``}
      and (a.id is not null or k.id is not null)
    order by score desc nulls last
    limit ${limit}`);
  return (rows as unknown as { type: EntityType; id: number; title: string; meta: string | null; score: number | string }[])
    .map((r) => ({ ...r, id: Number(r.id), score: Number(r.score) }));
}

export async function semanticSearch(query: string, limit = 20): Promise<SemanticHit[]> {
  if (query.trim().length < 2) return [];
  const provider = await getEmbeddingProvider();
  try {
    const { vectors } = await embedTexts(provider, [query.slice(0, 1000)]);
    return (await nearest(vectors[0], provider.model, limit)).filter((h) => h.score >= minScore(provider.model, "search"));
  } catch (e) {
    logger.warn("semantic search failed", { error: errMsg(e) });
    throw e;
  }
}

/** Items most similar to a stored entity (no API call: reuses its vector). */
export async function relatedTo(type: EntityType, id: number, limit = 5): Promise<SemanticHit[]> {
  const [row] = await db.select().from(schema.embeddings).where(and(eq(schema.embeddings.entityType, type), eq(schema.embeddings.entityId, id)));
  if (!row) return [];
  return (await nearest(row.vector, row.model, limit, { type, id })).filter((h) => h.score >= minScore(row.model, "related"));
}
