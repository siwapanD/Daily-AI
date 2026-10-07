import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "../db";
import type { Article } from "../db/schema";
import { getAI, withFallback, type AIConfig, type ItemInput, type ClassifyResult } from "../llm";
import { dailyScore, recommend } from "../pipeline/score";
import { env } from "../env";
import { logger, errMsg } from "../logger";
import { activeWatchItems, watchBoost } from "./watch";
import { upsertTechnology } from "./technologies";

type Row = { article: Article; source: typeof schema.sources.$inferSelect | null };

function toItem({ article: a, source: s }: Row): ItemInput {
  return {
    title: a.title,
    content: a.content ?? a.excerpt ?? "",
    url: a.url,
    source: s?.name ?? "manual",
    reliability: a.reliabilityScore ?? s?.reliabilityScore ?? 50,
    publishedAt: a.publishedAt,
    authorityLevel: (a.analysis as { authority?: string } | null)?.authority ?? s?.authorityLevel,
    summary: a.summary,
  };
}

async function setTags(articleId: number, categories: string[]) {
  if (!categories.length) return;
  await db.insert(schema.tags).values(categories.map((name) => ({ name }))).onConflictDoNothing();
  const tags = await db.select().from(schema.tags).where(inArray(schema.tags.name, categories));
  await db.delete(schema.articleTags).where(eq(schema.articleTags.articleId, articleId));
  await db.insert(schema.articleTags).values(tags.map((t) => ({ articleId, tagId: t.id }))).onConflictDoNothing();
}

function scoreRow(row: Row, c: ClassifyResult, boost: number) {
  const reliability = row.article.reliabilityScore ?? row.source?.reliabilityScore ?? 50;
  const score = dailyScore({ ...c, reliability }, boost);
  return {
    impactScore: c.impact, noveltyScore: c.novelty, relevanceScore: c.relevance, experimentValue: c.experimentValue,
    reliabilityScore: reliability, watchBoost: boost, dailyScore: score, recommendation: recommend(score, c.experimentValue),
  };
}

async function loadRows(where: ReturnType<typeof eq> | undefined, limit: number): Promise<Row[]> {
  return db.select({ article: schema.articles, source: schema.sources })
    .from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(where)
    .orderBy(desc(schema.articles.publishedAt))
    .limit(limit);
}

/** Step 1 (cheap): classify + score every new article. */
export async function classifyPending(ai: AIConfig, limit = 200) {
  const rows = await loadRows(eq(schema.articles.status, "new"), limit);
  const watch = await activeWatchItems();
  let ok = 0, failed = 0;
  for (const row of rows) {
    try {
      const { value: c, by } = await withFallback("classify", (p) => p.classify(toItem(row), { ...ai.cheap, task: "classify" }), ai);
      const { boost, matched } = watchBoost(watch, row.article);
      await db.update(schema.articles).set({
        ...scoreRow(row, c, boost),
        status: "classified",
        analyzedBy: by === "heuristic" ? "heuristic" : `${by}:${ai.cheap.model}`,
        analysis: { ...(row.article.analysis ?? {}), categories: c.categories, technology: c.technology, watch: matched.map((m) => m.name) },
      }).where(eq(schema.articles.id, row.article.id));
      await setTags(row.article.id, c.categories);
      ok++;
    } catch (e) {
      failed++;
      logger.error("classify failed", { articleId: row.article.id, error: errMsg(e) });
      await db.update(schema.articles).set({ status: "error" }).where(eq(schema.articles.id, row.article.id));
    }
  }
  return { classified: ok, failed };
}

/** Step 2 (strong): deep analysis for important classified articles only. */
export async function analyzeArticle(row: Row, ai: AIConfig) {
  const watch = await activeWatchItems();
  const { value: a, by, error } = await withFallback("analyze", (p) => p.analyze(toItem(row), { ...ai.strong, task: "analyze" }), ai);
  const { boost, matched } = watchBoost(watch, row.article);
  const techId = a.technologyInfo ? await upsertTechnology(a.technologyInfo.name, a.technologyInfo.vendor, a.technologyInfo.category) : null;
  await db.update(schema.articles).set({
    ...scoreRow(row, a, boost),
    summary: a.summary || row.article.excerpt,
    whyItMatters: a.whyItMatters,
    technologyId: techId,
    status: "analyzed",
    analyzedBy: by === "heuristic" ? "heuristic" : `${by}:${ai.strong.model}`,
    analysis: {
      ...(row.article.analysis ?? {}),
      categories: a.categories, technology: a.technology, experimentIdea: a.experimentIdea,
      workflowImprovement: a.workflowImprovement, hype: a.hype, watch: matched.map((m) => m.name),
      ...(error ? { aiError: error } : {}),
    },
  }).where(eq(schema.articles.id, row.article.id));
  await setTags(row.article.id, a.categories);
}

export async function analyzeImportant(ai: AIConfig) {
  const since = new Date(Date.now() - 14 * 86400000);
  // Heuristic mode is free, so analyze everything classified; LLM mode only the top items.
  const threshold = ai.isHeuristic ? 0 : env.llm.analyzeThreshold;
  const limit = ai.isHeuristic ? 500 : env.llm.maxStrongPerRun;
  const rows = await db.select({ article: schema.articles, source: schema.sources })
    .from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(and(eq(schema.articles.status, "classified"), gte(schema.articles.dailyScore, threshold),
      or(gte(schema.articles.fetchedAt, since), isNull(schema.articles.publishedAt))))
    .orderBy(desc(schema.articles.dailyScore))
    .limit(limit);
  let analyzed = 0;
  for (const row of rows) {
    try {
      await analyzeArticle(row, ai);
      analyzed++;
    } catch (e) {
      logger.error("analyze failed", { articleId: row.article.id, error: errMsg(e) });
    }
  }
  return { analyzed };
}

/** Full analysis pass: cheap classify everything new → strong analysis for the important ones. */
export async function runAnalysis() {
  const ai = await getAI();
  const c = await classifyPending(ai);
  const a = await analyzeImportant(ai);
  return { provider: ai.isHeuristic ? "heuristic" : ai.provider.name, ...c, ...a };
}

/** "Analyze Now" on a single card: force strong analysis. */
export async function analyzeOne(articleId: number) {
  const rows = await loadRows(eq(schema.articles.id, articleId), 1);
  if (!rows[0]) throw new Error("Article not found");
  const ai = await getAI();
  await analyzeArticle(rows[0], ai);
}
