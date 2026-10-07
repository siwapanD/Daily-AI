import { describe, it, expect, vi, afterEach } from "vitest";
import { extractJson, classifySchema, experimentSchema } from "@/lib/llm/json";
import { HeuristicProvider } from "@/lib/llm/heuristic";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { renderPrompt, PROMPTS } from "@/lib/prompts";
import { estimateCost } from "@/lib/llm";
import { compareResults } from "@/lib/services/experiments";
import type { ExperimentResult } from "@/lib/db/schema";

afterEach(() => vi.unstubAllGlobals());

describe("JSON extraction", () => {
  it("handles fences and prose", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Result: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("no json")).toThrow();
  });
  it("coerces and clamps classifier output", () => {
    const r = classifySchema.parse({ categories: ["coding", "ai gateway", "bogus"], impact: "120", novelty: -5, relevance: 50.6, experimentValue: "x", technology: "" });
    expect(r).toEqual({ categories: ["CODING", "AI_GATEWAY"], impact: 100, novelty: 0, relevance: 51, experimentValue: 50, technology: null });
  });
  it("accepts steps as array", () => {
    expect(experimentSchema.parse({ title: "t", steps: ["a", "b"] }).steps).toBe("1. a\n2. b");
  });
});

describe("prompts", () => {
  it("are versioned and render variables", () => {
    for (const p of Object.values(PROMPTS)) expect(p.versions[p.active]).toBeDefined();
    const r = renderPrompt("importance-classifier", { title: "Hello", content: "Body" });
    expect(r.version).toBe("importance-classifier-v1");
    expect(r.user).toContain("Title: Hello");
    expect(r.user).not.toContain("{{");
  });
});

describe("providers", () => {
  it("heuristic provider is deterministic and complete", async () => {
    const h = new HeuristicProvider();
    const item = { title: "Claude Code adds subagents", content: "Claude Code now supports subagents for parallel tasks. It ships today." };
    const a1 = await h.analyze(item);
    expect(a1).toEqual(await h.analyze(item));
    expect(a1.technologyInfo?.name).toBe("Claude Code");
    expect(a1.summary.length).toBeGreaterThan(0);
    const md = await h.summarize(item);
    expect(md).toContain("## Should we test it?");
    expect((await h.draftExperiment(item)).metrics.length).toBeGreaterThan(0);
  });

  it("openai-compatible provider calls chat/completions and parses classify JSON", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("test-model");
      expect(body.messages[0].role).toBe("system");
      return new Response(JSON.stringify({
        model: "test-model",
        choices: [{ message: { content: '```json\n{"categories":["MCP"],"impact":90,"novelty":80,"relevance":95,"experimentValue":85,"technology":"MCP"}\n```' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = new OpenAICompatibleProvider("https://llm.example/v1", "key");
    const r = await p.classify({ title: "MCP spec update", content: "..." }, { model: "test-model", maxTokens: 500, task: "classify" });
    expect(r).toMatchObject({ categories: ["MCP"], impact: 90, technology: "MCP" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://llm.example/v1/chat/completions");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("surfaces HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 401 })));
    const p = new OpenAICompatibleProvider("https://llm.example/v1", "key");
    await expect(p.chat([{ role: "user", content: "hi" }], { model: "m", maxTokens: 10, task: "t" })).rejects.toThrow(/401/);
  });
});

describe("cost + benchmark", () => {
  it("estimates cost from the price table", () => {
    expect(estimateCost("claude-haiku-4-5", 1_000_000, 0)).toBe(1);
    expect(estimateCost("anthropic/claude-sonnet-5-5", 0, 1_000_000)).toBe(10);
    expect(estimateCost("unknown-model", 1000, 1000)).toBe(0);
  });
  it("compares variants against baseline", () => {
    const base = { id: 1, experimentId: 1, tokens: null, costUsd: null, accuracy: null, testPassRate: null, humanInterventions: null, retries: null, notes: null, extra: {}, createdAt: new Date() };
    const rows = [
      { ...base, variant: "baseline", timeMinutes: 40, quality: 6 },
      { ...base, variant: "baseline", timeMinutes: 60, quality: 6 },
      { ...base, variant: "new", timeMinutes: 25, quality: 9 },
    ] as ExperimentResult[];
    const cmp = compareResults(rows);
    const time = cmp.find((c) => c.key === "timeMinutes")!;
    expect(time.values).toEqual({ baseline: 50, new: 25 });
    expect(time.deltas.new).toEqual({ pct: -50, better: true });
    expect(cmp.find((c) => c.key === "quality")!.deltas.new!.better).toBe(true);
    expect(cmp.find((c) => c.key === "tokens")).toBeUndefined();
  });
});
