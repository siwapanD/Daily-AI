import { desc, ilike, or } from "drizzle-orm";
import { db, schema } from "../db";

/** Simple cross-entity search (ILIKE). Upgrade path: tsvector / embeddings. */
export async function searchAll(query: string) {
  const q = query.trim();
  if (q.length < 2) return { articles: [], knowledge: [], experiments: [], technologies: [] };
  const like = `%${q}%`;
  const [articles, knowledge, experiments, technologies] = await Promise.all([
    db.select({ id: schema.articles.id, title: schema.articles.title, score: schema.articles.dailyScore, date: schema.articles.publishedAt, recommendation: schema.articles.recommendation })
      .from(schema.articles).where(or(ilike(schema.articles.title, like), ilike(schema.articles.excerpt, like)))
      .orderBy(desc(schema.articles.publishedAt)).limit(30),
    db.select({ id: schema.knowledgeItems.id, title: schema.knowledgeItems.title, area: schema.knowledgeItems.area, status: schema.knowledgeItems.status })
      .from(schema.knowledgeItems).where(or(ilike(schema.knowledgeItems.title, like), ilike(schema.knowledgeItems.contentMd, like))).limit(30),
    db.select({ id: schema.experiments.id, code: schema.experiments.code, title: schema.experiments.title, decision: schema.experiments.decision, status: schema.experiments.status })
      .from(schema.experiments).where(or(ilike(schema.experiments.title, like), ilike(schema.experiments.code, like), ilike(schema.experiments.technology, like), ilike(schema.experiments.hypothesis, like))).limit(30),
    db.select({ id: schema.technologies.id, name: schema.technologies.name, slug: schema.technologies.slug, category: schema.technologies.category })
      .from(schema.technologies).where(ilike(schema.technologies.name, like)).limit(20),
  ]);
  return { articles, knowledge, experiments, technologies };
}
