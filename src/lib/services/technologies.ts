import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { slugify } from "../pipeline/technologies";

export async function upsertTechnology(name: string, vendor: string | null = null, category = "OTHER"): Promise<number> {
  const slug = slugify(name);
  const [row] = await db
    .insert(schema.technologies)
    .values({ name: name.slice(0, 120), slug, vendor, category })
    .onConflictDoUpdate({ target: schema.technologies.slug, set: { slug } })
    .returning({ id: schema.technologies.id });
  return row.id;
}

export async function getTechnologyBySlug(slug: string) {
  const [t] = await db.select().from(schema.technologies).where(eq(schema.technologies.slug, slug));
  return t ?? null;
}

/** Timeline: articles, experiments and radar entries linked to a technology, newest first. */
export async function technologyTimeline(technologyId: number) {
  const [articles, experiments, radar] = await Promise.all([
    db.select({
      id: schema.articles.id, title: schema.articles.title, url: schema.articles.url,
      date: schema.articles.publishedAt, fetchedAt: schema.articles.fetchedAt,
      score: schema.articles.dailyScore, recommendation: schema.articles.recommendation,
    }).from(schema.articles).where(eq(schema.articles.technologyId, technologyId))
      .orderBy(desc(schema.articles.publishedAt)).limit(100),
    db.select().from(schema.experiments).where(eq(schema.experiments.technologyId, technologyId)),
    db.select().from(schema.radarItems).where(eq(schema.radarItems.technologyId, technologyId)),
  ]);
  type Event = { date: Date; kind: string; title: string; href: string; meta?: string };
  const events: Event[] = [
    ...articles.map((a) => ({
      date: a.date ?? a.fetchedAt, kind: "discovery", title: a.title, href: `/learn/${a.id}`,
      meta: a.score != null ? `score ${a.score} · ${a.recommendation ?? ""}` : undefined,
    })),
    ...experiments.map((e) => ({
      date: e.decidedAt ?? e.createdAt, kind: "experiment", title: `${e.code} ${e.title}`, href: `/experiments/${e.id}`,
      meta: e.decision ?? e.status,
    })),
    ...radar.map((r) => ({ date: r.updatedAt, kind: "radar", title: `Radar: ${r.ring}`, href: "/radar", meta: r.rationale })),
  ];
  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
