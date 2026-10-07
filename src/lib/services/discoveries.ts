import { and, desc, eq, gte, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { ftsMatch } from "./fts";

export interface DiscoveryFilter {
  q?: string;
  category?: string;
  recommendation?: string;
  minScore?: number;
  sourceId?: number;
  days?: number;
  showIgnored?: boolean;
  page?: number;
  pageSize?: number;
}

const select = {
  id: schema.articles.id,
  title: schema.articles.title,
  url: schema.articles.url,
  publishedAt: schema.articles.publishedAt,
  fetchedAt: schema.articles.fetchedAt,
  excerpt: schema.articles.excerpt,
  summary: schema.articles.summary,
  whyItMatters: schema.articles.whyItMatters,
  dailyScore: schema.articles.dailyScore,
  impactScore: schema.articles.impactScore,
  noveltyScore: schema.articles.noveltyScore,
  reliabilityScore: schema.articles.reliabilityScore,
  relevanceScore: schema.articles.relevanceScore,
  experimentValue: schema.articles.experimentValue,
  watchBoost: schema.articles.watchBoost,
  recommendation: schema.articles.recommendation,
  status: schema.articles.status,
  analysis: schema.articles.analysis,
  analyzedBy: schema.articles.analyzedBy,
  userAction: schema.articles.userAction,
  technologyId: schema.articles.technologyId,
  sourceName: schema.sources.name,
  sourceType: schema.sources.type,
};

export type DiscoveryRow = Awaited<ReturnType<typeof listDiscoveries>>["rows"][number];

function notIgnored() {
  return or(isNull(schema.articles.userAction), ne(schema.articles.userAction, "ignore"))!;
}

function since(days: number) {
  const d = new Date(Date.now() - days * 86400000);
  return or(gte(schema.articles.publishedAt, d), and(isNull(schema.articles.publishedAt), gte(schema.articles.fetchedAt, d)))!;
}

function hasTag(tag: string) {
  return sql`exists (select 1 from ${schema.articleTags} atg join ${schema.tags} tg on tg.id = atg.tag_id where atg.article_id = ${schema.articles.id} and tg.name = ${tag})`;
}

export async function listDiscoveries(f: DiscoveryFilter = {}) {
  const conds: SQL[] = [];
  if (!f.showIgnored) conds.push(notIgnored());
  if (f.q) conds.push(or(ftsMatch("articles", f.q), ilike(schema.articles.title, `%${f.q}%`))!);
  if (f.category) conds.push(hasTag(f.category));
  if (f.recommendation) conds.push(eq(schema.articles.recommendation, f.recommendation));
  if (f.minScore) conds.push(gte(schema.articles.dailyScore, f.minScore));
  if (f.sourceId) conds.push(eq(schema.articles.sourceId, f.sourceId));
  if (f.days) conds.push(since(f.days));
  const pageSize = Math.min(f.pageSize ?? 30, 100);
  const page = Math.max(1, f.page ?? 1);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ count }]] = await Promise.all([
    db.select(select).from(schema.articles)
      .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
      .where(where)
      .orderBy(sql`${schema.articles.dailyScore} desc nulls last`, desc(schema.articles.publishedAt))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.articles).where(where),
  ]);
  return { rows, total: count, page, pageSize };
}

async function q(where: SQL, limit: number) {
  return db.select(select).from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(and(where, notIgnored()))
    .orderBy(sql`${schema.articles.dailyScore} desc nulls last`)
    .limit(limit);
}

/** Everything the Today page needs, in parallel. */
export async function todayData() {
  const recent = since(2);
  const week = since(7);
  let top = await q(and(recent, sql`${schema.articles.dailyScore} is not null`)!, 6);
  if (top.length < 3) top = await q(and(week, sql`${schema.articles.dailyScore} is not null`)!, 6);
  const [mustLearn, experiment, watch, workflow, models, coding, releases, experimentsActive, adopted, stats] = await Promise.all([
    q(and(week, eq(schema.articles.recommendation, "MUST_LEARN"), or(isNull(schema.articles.userAction), ne(schema.articles.userAction, "learn")))!, 6),
    q(and(week, eq(schema.articles.recommendation, "EXPERIMENT"))!, 4),
    q(and(week, or(sql`jsonb_array_length(coalesce(${schema.articles.analysis}->'watch', '[]'::jsonb)) > 0`, eq(schema.articles.userAction, "watch"), eq(schema.articles.recommendation, "WATCH")))!, 6),
    q(and(week, sql`${schema.articles.analysis}->>'workflowImprovement' is not null`)!, 4),
    q(and(week, hasTag("MODEL"))!, 5),
    q(and(week, hasTag("CODING"))!, 5),
    q(and(week, eq(schema.sources.type, "github"))!, 6),
    db.select().from(schema.experiments).where(inArray(schema.experiments.status, ["planned", "running"]))
      .orderBy(desc(schema.experiments.updatedAt)).limit(4),
    db.select().from(schema.experiments).where(eq(schema.experiments.decision, "ADOPT"))
      .orderBy(desc(schema.experiments.decidedAt)).limit(3),
    db.select({
      today: sql<number>`count(*) filter (where ${schema.articles.fetchedAt} >= date_trunc('day', now()))::int`,
      pending: sql<number>`count(*) filter (where ${schema.articles.status} = 'new')::int`,
      total: sql<number>`count(*)::int`,
    }).from(schema.articles),
  ]);
  return { top, mustLearn, experiment, watch, workflow, models, coding, releases, experimentsActive, adopted, stats: stats[0] };
}

export async function setUserAction(id: number, action: string | null) {
  await db.update(schema.articles).set({ userAction: action }).where(eq(schema.articles.id, id));
}
