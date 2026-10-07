import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { WatchItem } from "../db/schema";
import { parseRepo } from "../collectors/github";

export async function listWatchItems() {
  return db.select().from(schema.watchItems).orderBy(desc(schema.watchItems.createdAt));
}

export async function activeWatchItems() {
  return db.select().from(schema.watchItems).where(eq(schema.watchItems.active, true));
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does a watch item match an article? Repository patterns (owner/repo, owner/*) match GitHub URLs; others match keywords. */
export function watchMatches(w: Pick<WatchItem, "kind" | "pattern">, a: { title: string; url: string; excerpt?: string | null }): boolean {
  const pattern = w.pattern.trim();
  if (!pattern) return false;
  if (w.kind === "repository" || /^[\w.-]+\/(\*|[\w.-]+)$/.test(pattern)) {
    const [owner, repo] = pattern.toLowerCase().split("/");
    const m = a.url.toLowerCase().match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
    const titleRepo = a.title.toLowerCase().match(/^([\w.-]+)\/([\w.-]+)\b/);
    const hit = m ?? titleRepo;
    if (hit && hit[1] === owner && (repo === "*" || hit[2] === repo)) return true;
    if (w.kind === "repository") return false;
  }
  // "Claude Code" also matches "claude-code" / "claude_code".
  const body = escapeRe(pattern).replace(/\s+/g, "[\\s_-]+");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${body}($|[^\\p{L}\\p{N}])`, "iu");
  return re.test(a.title) || re.test(a.excerpt ?? "");
}

export function watchBoost<T extends Pick<WatchItem, "kind" | "pattern" | "boost">>(items: T[], a: { title: string; url: string; excerpt?: string | null }) {
  const matched = items.filter((w) => watchMatches(w, a));
  return { boost: Math.min(30, matched.reduce((s, w) => s + w.boost, 0)), matched };
}

export async function addWatchItem(input: { kind: string; name: string; pattern: string; boost?: number; createSource?: boolean }) {
  const [item] = await db
    .insert(schema.watchItems)
    .values({ kind: input.kind, name: input.name, pattern: input.pattern, boost: input.boost ?? 15 })
    .returning();
  if (input.createSource && input.kind === "repository") {
    const repo = parseRepo(input.pattern);
    if (repo && !input.pattern.includes("*")) {
      await db
        .insert(schema.sources)
        .values({
          name: `GitHub: ${repo.owner}/${repo.repo}`, type: "github", url: `${repo.owner}/${repo.repo}`,
          tier: 1, authorityLevel: "official", reliabilityScore: 95,
        })
        .onConflictDoNothing();
    }
  }
  return item;
}

export async function updateWatchItem(id: number, patch: Partial<{ active: boolean; boost: number }>) {
  await db.update(schema.watchItems).set(patch).where(eq(schema.watchItems.id, id));
}

export async function deleteWatchItem(id: number) {
  await db.delete(schema.watchItems).where(eq(schema.watchItems.id, id));
}
