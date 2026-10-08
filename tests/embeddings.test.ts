import { describe, it, expect, vi, afterEach } from "vitest";
import { LocalHashEmbedding, OpenAICompatibleEmbedding, dot } from "@/lib/llm/embeddings";

afterEach(() => vi.unstubAllGlobals());

describe("LocalHashEmbedding", () => {
  const e = new LocalHashEmbedding();
  it("produces deterministic unit vectors", async () => {
    const { vectors } = await e.embed(["Claude Code adds planning mode", "Claude Code adds planning mode"]);
    expect(vectors[0]).toHaveLength(512);
    expect(dot(vectors[0], vectors[0])).toBeCloseTo(1, 5);
    expect(vectors[0]).toEqual(vectors[1]);
  });
  it("ranks related text above unrelated text", async () => {
    const { vectors: [q, near, far] } = await e.embed([
      "coding agent planning workflow",
      "A planning workflow for your coding agent reduces rework",
      "Ten pasta recipes for the weekend",
    ]);
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
  it("handles Thai text without spaces", async () => {
    const { vectors: [a, b, c] } = await e.embed(["การเขียนโค้ดด้วยเอไอ", "เขียนโค้ดด้วยเอไอให้เร็วขึ้น", "สูตรอาหารไทย"]);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});

describe("OpenAICompatibleEmbedding", () => {
  it("posts to /embeddings, keeps input order and normalizes", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 7 },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new OpenAICompatibleEmbedding("https://api.example/v1/", "k", "text-embedding-3-small").embed(["a", "b"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/v1/embeddings");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ model: "text-embedding-3-small", input: ["a", "b"] });
    expect(r.vectors[0]).toEqual([0.6, 0.8]);
    expect(r.vectors[1]).toEqual([0, 1]);
    expect(r.tokens).toBe(7);
  });
  it("rejects a mismatched vector count", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [1] }] }))));
    await expect(new OpenAICompatibleEmbedding("https://x/v1", "", "m").embed(["a", "b"])).rejects.toThrow(/1 vectors for 2/);
  });
});
