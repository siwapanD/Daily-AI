import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { parseFeed } from "@/lib/collectors/rss";
import { parseRepo, githubCollector } from "@/lib/collectors/github";
import { extractPage } from "@/lib/collectors/web";
import { domainAuthority } from "@/lib/collectors";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>First &amp; best</title><link>https://example.com/1</link><description><![CDATA[<p>Hello</p>]]></description><pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Second</title><link>https://example.com/2</link></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<entry><title>Atom entry</title><link rel="alternate" href="https://example.com/a"/><updated>2026-10-05T00:00:00Z</updated><summary>Sum</summary><author><name>Ann</name></author></entry></feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: "https://example.com/1", title: "First & best", content: "<p>Hello</p>" });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-10-06T10:00:00.000Z");
  });
  it("parses Atom", () => {
    const [e] = parseFeed(ATOM);
    expect(e).toMatchObject({ url: "https://example.com/a", title: "Atom entry", content: "Sum", author: "Ann" });
  });
});

describe("github collector", () => {
  beforeEach(() => { process.env.ALLOW_PRIVATE_FETCH = "true"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ALLOW_PRIVATE_FETCH; });

  it("parses repo identifiers", () => {
    expect(parseRepo("openai/codex")).toEqual({ owner: "openai", repo: "codex" });
    expect(parseRepo("https://github.com/anthropics/claude-code/releases")).toEqual({ owner: "anthropics", repo: "claude-code" });
    expect(parseRepo("not a repo")).toBeNull();
  });

  it("maps releases and skips drafts/prereleases", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { html_url: "https://github.com/o/r/releases/tag/v2", name: "v2.0.0", tag_name: "v2.0.0", body: "Notes", published_at: "2026-10-01T00:00:00Z", draft: false, prerelease: false, author: { login: "dev" } },
      { html_url: "https://github.com/o/r/releases/tag/v3-rc", name: "v3 rc", tag_name: "v3-rc", draft: false, prerelease: true },
      { html_url: "x", name: "draft", draft: true },
    ]), { status: 200 })));
    const { items } = await githubCollector({ id: 1, name: "r", type: "github", url: "o/r", config: {}, state: {} });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "o/r v2.0.0", author: "dev", content: "Notes" });
  });

  it("falls back to the releases Atom feed when rate limited", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("api.github.com") ? new Response("limit", { status: 403 }) : new Response(ATOM, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { items } = await githubCollector({ id: 1, name: "r", type: "github", url: "o/r", config: {}, state: {} });
    expect(items[0].title).toBe("o/r Atom entry");
    expect(fetchMock.mock.calls[1][0]).toBe("https://github.com/o/r/releases.atom");
  });
});

describe("web extraction", () => {
  it("extracts title, description and main text", () => {
    const p = extractPage(`<html><head><title>Doc &amp; page</title><meta name="description" content="Desc"></head><body><nav>menu</nav><main><h1>H</h1><p>Body text</p></main></body></html>`, "https://x.com");
    expect(p.title).toBe("Doc & page");
    expect(p.description).toBe("Desc");
    expect(p.text).toContain("Body text");
    expect(p.text).not.toContain("menu");
  });
  it("assigns domain authority", () => {
    expect(domainAuthority("https://docs.anthropic.com/x").reliability).toBe(100);
    expect(domainAuthority("https://github.com/a/b").reliability).toBe(90);
    expect(domainAuthority("https://www.reddit.com/r/x").reliability).toBe(55);
    expect(domainAuthority("https://random.blog/x").reliability).toBe(40);
  });
});
