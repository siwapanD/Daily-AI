import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseSubreddit, parseYoutubeChannel, redditCollector, youtubeCollector } from "@/lib/collectors/social";

const src = (type: "reddit" | "youtube", url: string, config = {}) => ({ id: 1, name: "s", type, url, config, state: {} });

beforeEach(() => { process.env.ALLOW_PRIVATE_FETCH = "true"; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ALLOW_PRIVATE_FETCH; });

describe("parsers", () => {
  it("parses subreddits", () => {
    expect(parseSubreddit("LocalLLaMA")).toBe("LocalLLaMA");
    expect(parseSubreddit("r/ClaudeAI")).toBe("ClaudeAI");
    expect(parseSubreddit("https://www.reddit.com/r/LocalLLaMA/")).toBe("LocalLLaMA");
    expect(parseSubreddit("https://evil.com/r/x")).toBeNull();
  });
  it("parses YouTube channel ids", () => {
    expect(parseYoutubeChannel("UCrDwWp7EBBv4NwvScIpBDOA")).toBe("UCrDwWp7EBBv4NwvScIpBDOA");
    expect(parseYoutubeChannel("https://www.youtube.com/channel/UCrDwWp7EBBv4NwvScIpBDOA/videos")).toBe("UCrDwWp7EBBv4NwvScIpBDOA");
    expect(parseYoutubeChannel("@anthropic-ai")).toBeNull();
  });
});

describe("reddit collector", () => {
  it("keeps top posts above minScore and skips stickied/NSFW", async () => {
    const post = (title: string, score: number, extra = {}) => ({ data: { title, score, permalink: `/r/localllm/comments/${title}/`, url: "https://example.com/a", selftext: "body", author: "u", created_utc: 1790000000, num_comments: 5, ...extra } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { children: [
      post("hot", 500), post("meh", 20), post("pinned", 900, { stickied: true }), post("nsfw", 900, { over_18: true }),
    ] } }))));
    const { items } = await redditCollector(src("reddit", "r/localllm", { minScore: 100 }));
    expect(items.map((i) => i.title)).toEqual(["hot"]);
    expect(items[0].url).toBe("https://www.reddit.com/r/localllm/comments/hot/");
    expect(items[0].content).toContain("500 upvotes");
  });
  it("falls back to RSS when the JSON API is blocked", async () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>From RSS</title><link href="https://www.reddit.com/r/x/1"/></entry></feed>`;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes(".json") ? new Response("", { status: 403 }) : new Response(atom)));
    const { items } = await redditCollector(src("reddit", "localllm"));
    expect(items[0].title).toBe("From RSS");
  });
});

describe("youtube collector", () => {
  it("reads the channel feed", async () => {
    const fetchMock = vi.fn(async () => new Response(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Video</title><link rel="alternate" href="https://www.youtube.com/watch?v=1"/><published>2026-10-01T00:00:00Z</published></entry></feed>`));
    vi.stubGlobal("fetch", fetchMock);
    const { items } = await youtubeCollector(src("youtube", "UCrDwWp7EBBv4NwvScIpBDOA"));
    expect(items[0]).toMatchObject({ title: "Video", url: "https://www.youtube.com/watch?v=1" });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("channel_id=UCrDwWp7EBBv4NwvScIpBDOA");
  });
});
