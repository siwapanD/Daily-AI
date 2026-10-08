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
const { embedPending, semanticSearch, relatedTo } = await import("@/lib/services/embeddings");
const { saveBenchmarkConfig, runBenchmark } = await import("@/lib/services/benchmark");
const { createExperiment } = await import("@/lib/services/experiments");
const { exportToGit } = await import("@/lib/services/git-export");
const { execFileSync } = await import("node:child_process");
const fsp = await import("node:fs/promises");
const os = await import("node:os");
const nodePath = await import("node:path");
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

  it("embeds content and finds it by meaning", async () => {
    const first = await embedPending();
    expect(first).toMatchObject({ provider: "local", remaining: 0 });
    expect(first.embedded).toBeGreaterThanOrEqual(4); // 3 articles + knowledge item
    expect((await embedPending()).embedded).toBe(0); // unchanged content is skipped
    const hits = await semanticSearch("agents planning mode MCP");
    expect(hits[0]).toMatchObject({ type: expect.any(String), title: expect.stringMatching(/claude-code v9\.0\.0/) });
    const [cc] = await db.select().from(schema.articles).where(eq(schema.articles.title, "anthropics/claude-code v9.0.0"));
    const related = await relatedTo("article", cc.id);
    expect(related.some((r) => r.type === "knowledge")).toBe(true); // its own Learn note
    expect(related.find((r) => r.type === "article" && r.id === cc.id)).toBeUndefined();
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

  it("runs an automated benchmark across models and records results per variant", async () => {
    Object.assign(process.env, {
      LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "https://llm.example/v1", LLM_API_KEY: "k",
      LLM_CHEAP_MODEL: "claude-haiku-4-5", LLM_STRONG_MODEL: "claude-sonnet-5-5", LLM_DAILY_TOKEN_LIMIT: "100000000",
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const user = body.messages[body.messages.length - 1].content as string;
      // Judge calls grade "off-by-one" answers as PASS.
      const text = user.includes("Answer to grade") ? (user.split("Answer to grade:")[1].includes("off-by-one") ? "PASS" : "FAIL")
        : body.model === "good-model" ? (user.includes("keyword") ? "RETURNING" : "It is an off-by-one bug") : "I don't know";
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const exp = await createExperiment({ title: "Model comparison" });
      await saveBenchmarkConfig(exp.id, {
        variants: [{ label: "baseline", model: "weak-model" }, { label: "new", model: "good-model", system: "Be precise." }],
        cases: [
          { name: "sql", input: "Which keyword returns inserted rows?", expected: "RETURNING" },
          { name: "bug", input: "Find the bug in the loop", expected: "Identifies off-by-one", match: "judge" },
        ],
      });
      const r = await runBenchmark(exp.id);
      expect(r.summary.map((s) => [s.variant, s.passed, s.total])).toEqual([["baseline", 0, 2], ["new", 2, 2]]);
      const e = await getExperiment(exp.id);
      const rows = Object.fromEntries(e!.results.map((x) => [x.variant, x]));
      expect(rows.new.accuracy).toBe(100);
      expect(rows.baseline.accuracy).toBe(0);
      expect(rows.new.tokens).toBe(30);
      expect(e!.executionNotes).toContain("Automated benchmark");
      expect(e!.status).toBe("running");
      const sys = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body))).find((b) => b.model === "good-model" && b.messages[0].role === "system");
      expect(sys.messages[0].content).toBe("Be precise.");
      // Benchmarks bypass the response cache: the second run calls the API again.
      const calls = fetchMock.mock.calls.length;
      await runBenchmark(exp.id);
      expect(fetchMock.mock.calls.length).toBe(calls * 2);
    } finally {
      vi.unstubAllGlobals();
      process.env.LLM_PROVIDER = "heuristic";
    }
  });

  it("exports knowledge, experiments and playbook to git, commits only on change, and pushes", async () => {
    const tmp = await fsp.mkdtemp(nodePath.join(os.tmpdir(), "dailyai-export-"));
    const remote = nodePath.join(tmp, "remote.git");
    const work = nodePath.join(tmp, "work");
    execFileSync("git", ["init", "-q", "--bare", remote]);
    execFileSync("git", ["init", "-q", work]);
    execFileSync("git", ["-C", work, "remote", "add", "origin", remote]);
    await fsp.writeFile(nodePath.join(work, "NOTES.md"), "user file\n"); // must never be touched
    process.env.GIT_EXPORT_DIR = work;
    process.env.GIT_EXPORT_PUSH = "true";
    try {
      expect(await exportToGit()).toMatchObject({ committed: true, pushed: true });
      const files = execFileSync("git", ["-C", work, "ls-files"]).toString().split("\n");
      expect(files).toEqual(expect.arrayContaining(["README.md", "radar.md", "playbook/AI-ENGINEERING-PLAYBOOK.md", "playbook/versions/v1.1.md"]));
      expect(files.some((f) => /^experiments\/EXP-\d{4}-001\.md$/.test(f))).toBe(true);
      expect(files.some((f) => f.startsWith("knowledge/"))).toBe(true);
      expect(files).not.toContain("NOTES.md");
      expect(await exportToGit()).toMatchObject({ committed: false }); // nothing changed
      const [k] = await db.select().from(schema.knowledgeItems).limit(1);
      await db.update(schema.knowledgeItems).set({ contentMd: k.contentMd + "\n\nEdited." }).where(eq(schema.knowledgeItems.id, k.id));
      expect(await exportToGit()).toMatchObject({ committed: true, changed: 1 });
      expect(execFileSync("git", ["-C", remote, "rev-list", "--count", "HEAD"]).toString().trim()).toBe("2");
      expect(await fsp.readFile(nodePath.join(work, "NOTES.md"), "utf8")).toBe("user file\n");
    } finally {
      delete process.env.GIT_EXPORT_DIR;
      delete process.env.GIT_EXPORT_PUSH;
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  });
});
