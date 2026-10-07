import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const secrets: Record<string, string> = {};
vi.mock("@/lib/services/settings", () => ({ getSecret: async (k: string) => secrets[k] ?? "" }));

const { digestToText, sendNotification, notificationChannels } = await import("@/lib/services/notify");

const DIGEST = {
  digestDate: "2026-10-07",
  title: "DAILY AI — 7 October 2026",
  contentMd: [
    "# DAILY AI — 7 October 2026", "", "Three things matter today.", "",
    "## Top Findings\n\n1. [Claude Code v9](https://github.com/anthropics/claude-code) — Planning mode.\n2. [MCP spec](https://mcp.io) — New auth.\n",
    "## Must Learn\n\n- [MCP spec](https://mcp.io) · HN · score 82 — Big change.\n",
    "## Worth Testing\n\n_Nothing today._\n",
    "## Recommended Experiment Today\n\n**Planning-first workflow**\n\nTry it.\n",
  ].join("\n"),
};

describe("digestToText", () => {
  it("builds a compact plain-text message", () => {
    const t = digestToText(DIGEST, "https://daily.example.com/");
    expect(t).toContain("📰 DAILY AI — 7 October 2026");
    expect(t).toContain("Three things matter today.");
    expect(t).toContain("1. Claude Code v9 (https://github.com/anthropics/claude-code) — Planning mode.");
    expect(t).toContain("🎓 Must learn\n- MCP spec (https://mcp.io) · HN — Big change.");
    expect(t).not.toContain("Worth testing");
    expect(t).toContain("🔬 Experiment today: Planning-first workflow");
    expect(t).toContain("https://daily.example.com/digest?date=2026-10-07");
    expect(t).not.toMatch(/\]\(|\*\*/);
  });
});

describe("sendNotification", () => {
  beforeEach(() => { for (const k of Object.keys(secrets)) delete secrets[k]; });
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing when no channel is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendNotification("hi")).toEqual([]);
    expect(await notificationChannels()).toEqual({ telegram: false, line: false, webhook: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to Telegram, LINE and webhook, isolating failures", async () => {
    Object.assign(secrets, {
      TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42",
      LINE_CHANNEL_ACCESS_TOKEN: "line-token", LINE_TO: "U1",
      NOTIFY_WEBHOOK_URL: "https://hooks.example.com/x",
    });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
      url.includes("line.me") ? new Response("bad", { status: 401 }) : new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await sendNotification("x".repeat(6000));
    expect(results).toEqual([
      { channel: "telegram", ok: true },
      { channel: "line", ok: false, error: "HTTP 401: bad" },
      { channel: "webhook", ok: true },
    ]);
    const calls = Object.fromEntries(fetchMock.mock.calls.map(([url, init]) => [url, init as RequestInit]));
    const tg = JSON.parse(String(calls["https://api.telegram.org/bot123:abc/sendMessage"].body));
    expect(tg.chat_id).toBe("42");
    expect(tg.text.length).toBe(4096);
    const line = calls["https://api.line.me/v2/bot/message/push"];
    expect((line.headers as Record<string, string>).authorization).toBe("Bearer line-token");
    expect(JSON.parse(String(line.body)).messages[0].text.length).toBe(5000);
    const hook = JSON.parse(String(calls["https://hooks.example.com/x"].body));
    expect(hook.text).toBe(hook.content);
  });

  it("never leaks the Telegram bot token in errors", async () => {
    Object.assign(secrets, { TELEGRAM_BOT_TOKEN: "123:secret", TELEGRAM_CHAT_ID: "1" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect failed https://api.telegram.org/bot123:secret/sendMessage"); }));
    const [r] = await sendNotification("hi");
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain("secret");
  });
});
