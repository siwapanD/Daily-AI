import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./index";
import { PROMPTS, formatTemplate } from "../prompts";
import { PLAYBOOK_V1 } from "../services/playbook";
import { logger } from "../logger";

type SeedSource = Omit<typeof schema.sources.$inferInsert, "id">;

/** Curated default sources (Tier 1 official first). Edit or disable them in Settings. */
export const DEFAULT_SOURCES: SeedSource[] = [
  // Tier 1 — official
  { name: "OpenAI News", type: "rss", url: "https://openai.com/news/rss.xml", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "Google AI Blog", type: "rss", url: "https://blog.google/technology/ai/rss/", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "GitHub Changelog", type: "rss", url: "https://github.blog/changelog/feed/", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "Hugging Face Blog", type: "rss", url: "https://huggingface.co/blog/feed.xml", tier: 1, authorityLevel: "official", reliabilityScore: 90 },
  { name: "GitHub: anthropics/claude-code", type: "github", url: "anthropics/claude-code", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "GitHub: openai/codex", type: "github", url: "openai/codex", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "GitHub: google-gemini/gemini-cli", type: "github", url: "google-gemini/gemini-cli", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "GitHub: modelcontextprotocol/typescript-sdk", type: "github", url: "modelcontextprotocol/typescript-sdk", tier: 1, authorityLevel: "official", reliabilityScore: 95 },
  { name: "GitHub: Aider-AI/aider", type: "github", url: "Aider-AI/aider", tier: 1, authorityLevel: "official", reliabilityScore: 90 },
  { name: "GitHub: cline/cline", type: "github", url: "cline/cline", tier: 1, authorityLevel: "official", reliabilityScore: 90 },
  { name: "GitHub: BerriAI/litellm", type: "github", url: "BerriAI/litellm", tier: 1, authorityLevel: "official", reliabilityScore: 90 },
  // Tier 2 — technical
  { name: "Simon Willison", type: "rss", url: "https://simonwillison.net/atom/everything/", tier: 2, authorityLevel: "technical", reliabilityScore: 85 },
  { name: "Hacker News (AI, 100+ points)", type: "rss", url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+Claude+OR+GPT+OR+agent&points=100", tier: 2, authorityLevel: "technical", reliabilityScore: 70 },
  { name: "arXiv cs.SE", type: "rss", url: "https://rss.arxiv.org/rss/cs.SE", tier: 2, authorityLevel: "technical", reliabilityScore: 80, enabled: false, config: { limit: 20 } },
];

const DEFAULT_WATCH = [
  { kind: "technology", name: "Claude Code", pattern: "Claude Code", boost: 15 },
  { kind: "technology", name: "MCP", pattern: "MCP", boost: 10 },
  { kind: "repository", name: "anthropics/*", pattern: "anthropics/*", boost: 10 },
  { kind: "repository", name: "openai/codex", pattern: "openai/codex", boost: 10 },
];

/** Idempotent seed: safe to run on every start. */
export async function seed() {
  await db.insert(schema.sources).values(DEFAULT_SOURCES).onConflictDoNothing();

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.watchItems);
  if (count === 0) await db.insert(schema.watchItems).values(DEFAULT_WATCH);

  for (const p of Object.values(PROMPTS)) {
    const [row] = await db.insert(schema.prompts).values({ key: p.key, description: p.description })
      .onConflictDoUpdate({ target: schema.prompts.key, set: { description: p.description } })
      .returning();
    // A version activated in the UI wins over the code default, so only mark the code
    // version active when the prompt has no active version yet.
    const active = await db.select({ id: schema.promptVersions.id }).from(schema.promptVersions)
      .where(and(eq(schema.promptVersions.promptId, row.id), eq(schema.promptVersions.isActive, true)));
    for (const [v, t] of Object.entries(p.versions)) {
      await db.insert(schema.promptVersions)
        .values({ promptId: row.id, version: Number(v), template: formatTemplate(t.system, t.user), isActive: active.length === 0 && Number(v) === p.active })
        .onConflictDoNothing();
    }
  }

  await db.insert(schema.playbookVersions)
    .values({ version: "1.0", contentMd: PLAYBOOK_V1, changelog: "Initial playbook" })
    .onConflictDoNothing();

  const radar = [
    { name: "Claude Code", ring: "ADOPT", quadrant: "Tools", rationale: "Primary coding agent (initial assessment)." },
    { name: "Codex", ring: "ADOPT", quadrant: "Tools", rationale: "Second coding agent for comparison (initial assessment)." },
    { name: "MCP", ring: "TRIAL", quadrant: "Platforms", rationale: "Standard tool protocol; trial new servers before adopting." },
    { name: "Planning-first workflow", ring: "TRIAL", quadrant: "Techniques", rationale: "Validate with EXP: planning vs direct coding." },
  ];
  await db.insert(schema.radarItems).values(radar).onConflictDoNothing();
  logger.info("seed complete");
}
