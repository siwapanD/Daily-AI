/**
 * End-to-end pipeline against a real PostgreSQL database (TEST_DATABASE_URL, default dailyai_test).
 * Skipped automatically when the database is unreachable.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";

const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://dailyai:dailyai@localhost:5432/dailyai_test";
process.env.DATABASE_URL = TEST_URL;
process.env.LLM_PROVIDER = "heuristic";
process.env.APP_SECRET_KEY = "integration-test-secret-key";
process.env.LOG_LEVEL = "error";

let available = true;
try {
  const probe = postgres(TEST_URL, { max: 1, connect_timeout: 3 });
  await probe`select 1`;
  await probe.unsafe("drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;");
  await probe.end();
} catch {
  available = false;
}

const { runMigrations } = await import("@/lib/db/migrate");
const { seed } = await import("@/lib/db/seed");
const { db, schema, closeDb } = await import("@/lib/db");
const { ingestItems } = await import("@/lib/services/discovery");
const { runAnalysis } = await import("@/lib/services/analysis");
const { learnArticle } = await import("@/lib/services/knowledge");
const { createExperimentFromArticle, addResult, decideExperiment, getExperiment } = await import("@/lib/services/experiments");
const { generateDigest } = await import("@/lib/services/digest");
const { listRadar } = await import("@/lib/services/radar");
const { latestPlaybook } = await import("@/lib/services/playbook");
const { todayData } = await import("@/lib/services/discoveries");
const { setSecret, getSecret } = await import("@/lib/services/settings");
const { searchAll } = await import("@/lib/services/search");
const { listDiscoveries } = await import("@/lib/services/discoveries");
const { createPromptVersion, activatePromptVersion, getActivePrompt, listPromptVersions } = await import("@/lib/services/prompts");
const { eq } = await import("drizzle-orm");

describe.skipIf(!available)("pipeline integration", () => {
  beforeAll(async () => {
    await runMigrations();
    await runMigrations(); // idempotent
    await seed();
    await seed(); // idempotent
  });
  afterAll(async () => closeDb());

  const now = new Date();
  const raw = [
    { url: "https://github.com/anthropics/claude-code/releases/tag/v9.0.0", title: "anthropics/claude-code v9.0.0", content: "Claude Code introduces planning mode for agents with MCP support.", publishedAt: now },
    { url: "https://example.com/post?utm_source=feed", title: "Introducing a new open-weights coding model", content: "A new LLM for code generation with 1M context window.", publishedAt: now },
    { url: "https://example.com/cooking", title: "Ten pasta recipes", content: "Boil water.", publishedAt: now },
  ];

  it("seeds sources, prompts and playbook once", async () => {
    const sources = await db.select().from(schema.sources);
    expect(sources.length).toBeGreaterThan(5);
    expect(new Set(sources.map((s) => `${s.type}:${s.url}`)).size).toBe(sources.length);
    expect((await db.select().from(schema.promptVersions)).length).toBe(5);
    expect((await latestPlaybook())?.version).toBe("1.0");
  });

  it("ingests and deduplicates by canonical URL and title", async () => {
    const [src] = await db.select().from(schema.sources).limit(1);
    const first = await ingestItems(src.id, raw);
    expect(first).toHaveLength(3);
    const again = await ingestItems(src.id, [
      ...raw,
      { url: "https://example.com/post", title: "different title, same canonical URL" },
      { url: "https://other.com/x", title: "Ten Pasta Recipes!" },
    ]);
    expect(again).toHaveLength(0);
  });

  it("classifies, scores and analyzes with watch boost", async () => {
    const r = await runAnalysis();
    expect(r).toMatchObject({ provider: "heuristic", classified: 3, failed: 0 });
    const rows = await db.select().from(schema.articles);
    for (const a of rows) {
      expect(a.status).toBe("analyzed");
      expect(a.dailyScore).toBeGreaterThanOrEqual(0);
      expect(a.dailyScore).toBeLessThanOrEqual(100);
      expect(a.recommendation).toBeTruthy();
    }
    const cc = rows.find((a) => a.title.includes("claude-code"))!;
    const pasta = rows.find((a) => a.title.includes("pasta"))!;
    expect(cc.watchBoost).toBeGreaterThan(0); // seeded watch: "Claude Code", "anthropics/*"
    expect(cc.dailyScore!).toBeGreaterThan(pasta.dailyScore!);
    expect(cc.technologyId).not.toBeNull();
    const tags = await db.select().from(schema.articleTags).where(eq(schema.articleTags.articleId, cc.id));
    expect(tags.length).toBeGreaterThan(0);
  });

  it("runs learn → experiment → results → decision → radar + playbook", async () => {
    const [cc] = await db.select().from(schema.articles).where(eq(schema.articles.title, "anthropics/claude-code v9.0.0"));
    const k = await learnArticle(cc.id);
    expect(k.status).toBe("LEARNING");
    expect(k.contentMd).toContain("## What is it?");
    expect((await learnArticle(cc.id)).id).toBe(k.id); // idempotent

    const exp = await createExperimentFromArticle(cc.id);
    expect(exp.code).toMatch(/^EXP-\d{4}-001$/);
    expect(exp.knowledgeItemId).toBe(k.id);
    await addResult({ experimentId: exp.id, variant: "baseline", timeMinutes: 40 });
    await addResult({ experimentId: exp.id, variant: "new", timeMinutes: 20 });
    const r = await decideExperiment(exp.id, "ADOPT", "Halved time", "Use planning mode for multi-file changes.");
    expect(r.playbookVersion).toBe("1.1");

    const e = await getExperiment(exp.id);
    expect(e).toMatchObject({ decision: "ADOPT", status: "completed" });
    const radar = await listRadar();
    expect(radar.find((x) => x.name === "Claude Code")?.ring).toBe("ADOPT");
    const [k2] = await db.select().from(schema.knowledgeItems).where(eq(schema.knowledgeItems.id, k.id));
    expect(k2.status).toBe("ADOPTED");
    expect((await latestPlaybook())?.contentMd).toContain("Use planning mode for multi-file changes.");
  });

  it("generates the daily digest and today dashboard", async () => {
    const d = await generateDigest(now);
    expect(d.contentMd).toContain("## Top Findings");
    expect(d.contentMd).toContain("## Recommended Experiment Today");
    expect((await generateDigest(now)).id).toBe(d.id); // upsert per day
    const t = await todayData();
    expect(t.top.length).toBeGreaterThan(0);
    expect(t.stats.total).toBe(3);
  });

  it("full-text search ranks title matches and supports web syntax", async () => {
    const r = await searchAll("planning mode");
    expect(r.articles[0]?.title).toBe("anthropics/claude-code v9.0.0"); // matched in body, not title
    expect(r.knowledge.length).toBeGreaterThan(0);
    expect((await searchAll("pasta -recipes")).articles).toHaveLength(0);
    expect((await searchAll('"coding model"')).articles.map((a) => a.title)).toEqual(["Introducing a new open-weights coding model"]);
    expect((await listDiscoveries({ q: "context window" })).rows).toHaveLength(1);
    expect((await searchAll("claude-co")).articles.length).toBe(1); // substring fallback on titles
  });

  it("creates, activates and resolves prompt versions; seed keeps the UI choice", async () => {
    expect((await getActivePrompt("digest-summary"))?.version).toBe(1);
    const v = await createPromptVersion("digest-summary", "Be terse.", "{{items}}", true);
    expect(v).toBe(2);
    const active = await getActivePrompt("digest-summary");
    expect(active).toMatchObject({ version: 2, system: "Be terse.", user: "{{items}}" });
    await seed();
    const rows = (await listPromptVersions()).filter((r) => r.key === "digest-summary");
    expect(rows.filter((r) => r.isActive).map((r) => r.version)).toEqual([2]);
    await activatePromptVersion("digest-summary", 1);
    expect((await getActivePrompt("digest-summary"))?.version).toBe(1);
    await expect(activatePromptVersion("digest-summary", 99)).rejects.toThrow(/does not exist/);
  });

  it("stores secrets encrypted", async () => {
    delete process.env.GITHUB_TOKEN;
    await setSecret("GITHUB_TOKEN", "ghp_test");
    const [row] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, "secret:GITHUB_TOKEN"));
    expect(String(row.value)).not.toContain("ghp_test");
    expect(await getSecret("GITHUB_TOKEN")).toBe("ghp_test");
  });

  it("enforces the daily token budget and degrades to heuristic", async () => {
    const { getAI, withFallback } = await import("@/lib/llm");
    process.env.LLM_PROVIDER = "openai-compatible";
    process.env.LLM_BASE_URL = "https://llm.example/v1";
    process.env.LLM_API_KEY = "k";
    process.env.LLM_CHEAP_MODEL = "claude-haiku-4-5";
    process.env.LLM_DAILY_TOKEN_LIMIT = "150";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"categories":["CODING"],"impact":70,"novelty":70,"relevance":70,"experimentValue":70,"technology":null}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 100 },
    })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const ai = await getAI();
      expect(ai.isHeuristic).toBe(false);
      const item = { title: "Budget test", content: "x" };
      const first = await withFallback("classify", (p) => p.classify(item, { ...ai.cheap, task: "classify" }), ai);
      expect(first.by).toBe("openai-compatible");
      const cached = await withFallback("classify", (p) => p.classify(item, { ...ai.cheap, task: "classify" }), ai);
      expect(cached.by).toBe("openai-compatible");
      expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from cache
      const over = await withFallback("classify", (p) => p.classify({ title: "Other", content: "y" }, { ...ai.cheap, task: "classify" }), ai);
      expect(over.by).toBe("heuristic");
      expect(over.error).toMatch(/token limit/);
      const runs = await db.select().from(schema.llmRuns);
      expect(runs.some((r) => r.cached)).toBe(true);
      expect(runs.find((r) => !r.cached)?.estimatedCost).toBeCloseTo((100 * 1 + 100 * 5) / 1e6);
    } finally {
      vi.unstubAllGlobals();
      process.env.LLM_PROVIDER = "heuristic";
    }
  });
});
