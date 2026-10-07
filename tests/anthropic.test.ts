import { describe, it, expect, vi, afterEach } from "vitest";
import { AnthropicProvider } from "@/lib/llm/anthropic";

afterEach(() => vi.unstubAllGlobals());

function mockMessages(response: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, body: JSON.parse(await req.text()), headers: req.headers });
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "m", stop_reason: "end_turn",
      content: [{ type: "text", text: "hello" }], usage: { input_tokens: 12, output_tokens: 3 }, ...response,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}

describe("AnthropicProvider", () => {
  it("sends system separately, effort + server-side fallback for Opus 5.5", async () => {
    const calls = mockMessages({ model: "claude-opus-5-5" });
    const p = new AnthropicProvider("sk-test");
    const r = await p.chat([{ role: "system", content: "SYS" }, { role: "user", content: "hi" }], { model: "claude-opus-5-5", maxTokens: 1000, task: "t" });
    expect(r).toMatchObject({ text: "hello", inputTokens: 12, outputTokens: 3, model: "claude-opus-5-5" });
    const { body, headers, url } = calls[0];
    expect(url).toContain("/v1/messages");
    expect(body.system).toBe("SYS");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.max_tokens).toBe(4000);
    expect(body).not.toHaveProperty("temperature");
  });

  it("omits effort and fallbacks for Haiku 4.5", async () => {
    const calls = mockMessages({ model: "claude-haiku-4-5" });
    await new AnthropicProvider("sk-test").chat([{ role: "user", content: "hi" }], { model: "claude-haiku-4-5", maxTokens: 800, task: "t" });
    expect(calls[0].body).not.toHaveProperty("output_config");
    expect(calls[0].body).not.toHaveProperty("fallbacks");
    expect(calls[0].body.max_tokens).toBe(800);
  });

  it("throws on refusal so the gateway can fall back", async () => {
    mockMessages({ stop_reason: "refusal", content: [] });
    await expect(new AnthropicProvider("sk-test").chat([{ role: "user", content: "x" }], { model: "claude-haiku-4-5", maxTokens: 10, task: "t" }))
      .rejects.toThrow(/refusal/);
  });
});
