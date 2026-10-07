import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import type { Source } from "../db/schema";
import { collectors, domainAuthority } from "../collectors";
import { fetchPage } from "../collectors/web";
import { parseRepo } from "../collectors/github";
import { normalizeItem, type RawItem } from "../pipeline/normalize";
import { canonicalizeUrl, assertPublicUrl } from "../security/url";
import { env } from "../env";
import { logger, errMsg } from "../logger";

export interface SourceInput {
  name: string;
  type: Source["type"];
  url: string;
  tier?: number;
  authorityLevel?: string;
  reliabilityScore?: number;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export async function listSources() {
  return db.select().from(schema.sources).orderBy(asc(schema.sources.tier), asc(schema.sources.name));
}

export async function getSource(id: number) {
  const [s] = await db.select().from(schema.sources).where(eq(schema.sources.id, id));
  return s ?? null;
}

async function validateSourceUrl(type: Source["type"], url: string): Promise<string> {
  if (type === "github") {
    const repo = parseRepo(url);
    if (!repo) throw new Error("GitHub source must be owner/repo or a github.com URL");
    return `${repo.owner}/${repo.repo}`;
  }
  if (type === "manual") return url || "manual";
  await assertPublicUrl(url, env.allowPrivateFetch);
  return url.trim();
}

export async function createSource(input: SourceInput) {
  const url = await validateSourceUrl(input.type, input.url);
  const [row] = await db
    .insert(schema.sources)
    .values({
      name: input.name,
      type: input.type,
      url,
      tier: input.tier ?? 2,
      authorityLevel: input.authorityLevel ?? "technical",
      reliabilityScore: input.reliabilityScore ?? 70,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
    })
    .returning();
  return row;
}

export async function updateSource(id: number, patch: Partial<SourceInput>) {
  const current = await getSource(id);
  if (!current) throw new Error("Source not found");
  const url = patch.url !== undefined ? await validateSourceUrl(patch.type ?? current.type, patch.url) : undefined;
  await db
    .update(schema.sources)
    .set({ ...patch, ...(url ? { url } : {}), updatedAt: new Date() })
    .where(eq(schema.sources.id, id));
}

export async function deleteSource(id: number) {
  await db.delete(schema.sources).where(eq(schema.sources.id, id));
}

/**
 * Normalize + dedupe + store. Dedupe rules (MVP): unique canonical URL, and no identical normalized
 * title within the last 30 days. Returns ids of newly inserted articles.
 */
export async function ingestItems(sourceId: number | null, raw: RawItem[]): Promise<number[]> {
  const seen = new Set<string>();
  const items = raw
    .map(normalizeItem)
    .filter((i): i is NonNullable<typeof i> => !!i)
    .filter((i) => {
      if (seen.has(i.canonicalUrl) || seen.has(i.titleHash)) return false;
      seen.add(i.canonicalUrl);
      seen.add(i.titleHash);
      return true;
    });
  if (items.length === 0) return [];

  const since = new Date(Date.now() - 30 * 86400000);
  const existing = await db
    .select({ canonicalUrl: schema.articles.canonicalUrl, titleHash: schema.articles.titleHash, fetchedAt: schema.articles.fetchedAt })
    .from(schema.articles)
    .where(inArray(schema.articles.canonicalUrl, items.map((i) => i.canonicalUrl)));
  const existingTitles = await db
    .select({ titleHash: schema.articles.titleHash })
    .from(schema.articles)
    .where(and(inArray(schema.articles.titleHash, items.map((i) => i.titleHash)), gte(schema.articles.fetchedAt, since)));
  const skipUrl = new Set(existing.map((e) => e.canonicalUrl));
  const skipTitle = new Set(existingTitles.map((e) => e.titleHash));

  const fresh = items.filter((i) => !skipUrl.has(i.canonicalUrl) && !skipTitle.has(i.titleHash));
  if (fresh.length === 0) return [];
  const rows = await db
    .insert(schema.articles)
    .values(fresh.map((i) => ({ ...i, sourceId })))
    .onConflictDoNothing({ target: schema.articles.canonicalUrl })
    .returning({ id: schema.articles.id });
  return rows.map((r) => r.id);
}

export interface FetchResult {
  sourceId: number;
  name: string;
  ok: boolean;
  found: number;
  inserted: number;
  error?: string;
}

/** Fetch one source in isolation: failures are logged and recorded, never thrown. */
export async function fetchSource(source: Source): Promise<FetchResult> {
  const t0 = Date.now();
  const collector = collectors[source.type];
  try {
    if (!collector) throw new Error(`No collector for type ${source.type}`);
    const res = await collector(source);
    const ids = await ingestItems(source.id, res.items);
    await db.update(schema.sources)
      .set({ lastFetchedAt: new Date(), lastStatus: "ok", lastError: null, state: res.state ?? source.state })
      .where(eq(schema.sources.id, source.id));
    await db.insert(schema.fetchLogs).values({
      sourceId: source.id, status: "ok", itemsFound: res.items.length, itemsNew: ids.length, durationMs: Date.now() - t0,
    });
    return { sourceId: source.id, name: source.name, ok: true, found: res.items.length, inserted: ids.length };
  } catch (e) {
    const error = errMsg(e).slice(0, 500);
    logger.warn("source fetch failed", { source: source.name, error });
    await db.update(schema.sources)
      .set({ lastFetchedAt: new Date(), lastStatus: "error", lastError: error })
      .where(eq(schema.sources.id, source.id));
    await db.insert(schema.fetchLogs).values({ sourceId: source.id, status: "error", durationMs: Date.now() - t0, error });
    return { sourceId: source.id, name: source.name, ok: false, found: 0, inserted: 0, error };
  }
}

/** Fetch all enabled sources with bounded concurrency. */
export async function fetchAllSources(concurrency = 4): Promise<FetchResult[]> {
  const sources = (await listSources()).filter((s) => s.enabled && s.type !== "manual");
  const results: FetchResult[] = [];
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
      while (idx < sources.length) {
        const s = sources[idx++];
        results.push(await fetchSource(s));
      }
    }),
  );
  return results;
}

async function manualSource(): Promise<Source> {
  const [existing] = await db.select().from(schema.sources).where(eq(schema.sources.type, "manual")).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.sources)
    .values({ name: "Manual URL", type: "manual", url: "manual", tier: 2, authorityLevel: "technical", reliabilityScore: 60 })
    .returning();
  return row;
}

/** Add a single URL submitted by the user. Returns the article id (existing one if duplicate). */
export async function addManualUrl(url: string): Promise<{ id: number; created: boolean }> {
  await assertPublicUrl(url, env.allowPrivateFetch);
  const canonical = canonicalizeUrl(url);
  const [dup] = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.canonicalUrl, canonical));
  if (dup) return { id: dup.id, created: false };

  const page = await fetchPage(url);
  const src = await manualSource();
  const auth = domainAuthority(url);
  const item = normalizeItem({
    url,
    title: page.title,
    content: [page.description, page.text].filter(Boolean).join("\n\n"),
    publishedAt: page.publishedAt ?? new Date(),
  });
  if (!item) throw new Error("Could not extract content from URL");
  const [row] = await db.insert(schema.articles)
    .values({ ...item, sourceId: src.id, reliabilityScore: auth.reliability, analysis: { authority: auth.authority } })
    .onConflictDoNothing({ target: schema.articles.canonicalUrl })
    .returning({ id: schema.articles.id });
  if (!row) {
    const [again] = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.canonicalUrl, item.canonicalUrl));
    return { id: again.id, created: false };
  }
  return { id: row.id, created: true };
}
