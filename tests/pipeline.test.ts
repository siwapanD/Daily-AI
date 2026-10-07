import { describe, it, expect } from "vitest";
import { htmlToText, normalizeItem, titleHash, stripFeedBoilerplate } from "@/lib/pipeline/normalize";
import { classifyText, heuristicScores } from "@/lib/pipeline/classify";
import { dailyScore, recommend } from "@/lib/pipeline/score";
import { detectTechnology, slugify } from "@/lib/pipeline/technologies";
import { watchMatches, watchBoost } from "@/lib/services/watch";

describe("normalize", () => {
  it("strips scripts and markup", () => {
    expect(htmlToText("<p>Hello <b>world</b></p><script>alert(1)</script><p>A &amp; B</p>")).toBe("Hello world\nA & B");
  });
  it("title hash ignores case and punctuation", () => {
    expect(titleHash("Claude Code 2.0 — released!")).toBe(titleHash("claude code 2.0 released"));
    expect(titleHash("v1.2")).not.toBe(titleHash("v12"));
  });
  it("normalizes items and rejects empty ones", () => {
    const n = normalizeItem({ url: "https://Example.com/x?utm_medium=a", title: "<b>Title</b>", content: "<p>Body</p>", publishedAt: new Date("2026-01-01") })!;
    expect(n.title).toBe("Title");
    expect(n.canonicalUrl).toBe("https://example.com/x");
    expect(n.content).toBe("Body");
    expect(normalizeItem({ url: "", title: "x" })).toBeNull();
    expect(normalizeItem({ url: "https://a.com", title: "  " })).toBeNull();
  });
  it("clamps future publish dates", () => {
    const n = normalizeItem({ url: "https://a.com", title: "t", publishedAt: new Date(Date.now() + 10 * 86400000) })!;
    expect(n.publishedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
  it("removes hnrss boilerplate", () => {
    expect(stripFeedBoilerplate("Article URL: https://x.com/a Comments URL: https://news.ycombinator.com/item?id=1 Points: 120 # Comments: 40")).toBe("");
  });
});

describe("classification", () => {
  it("multi-labels AI coding content", () => {
    const cats = classifyText("Claude Code adds MCP server support for agents");
    expect(cats).toEqual(expect.arrayContaining(["CODING", "MCP", "AGENT"]));
  });
  it("falls back to OTHER", () => {
    expect(classifyText("Best pasta recipes of the year")).toEqual(["OTHER"]);
  });
  it("does not tag 'author' as security", () => {
    expect(classifyText("Meet the author")).not.toContain("SECURITY");
  });
  it("scores stay in 0-100 and reward relevance", () => {
    const now = new Date();
    const relevant = heuristicScores({ title: "Introducing Codex CLI agent mode", categories: ["CODING", "AGENT"], publishedAt: now, authorityLevel: "official" }, now);
    const irrelevant = heuristicScores({ title: "Quarterly earnings", categories: ["OTHER"], publishedAt: new Date(now.getTime() - 60 * 86400000) }, now);
    for (const v of [...Object.values(relevant), ...Object.values(irrelevant)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(relevant.relevance).toBeGreaterThan(irrelevant.relevance);
    expect(relevant.novelty).toBeGreaterThan(irrelevant.novelty);
  });
});

describe("score + recommendation", () => {
  it("applies the documented weights", () => {
    expect(dailyScore({ impact: 100, novelty: 0, reliability: 0, relevance: 0, experimentValue: 0 })).toBe(25);
    expect(dailyScore({ impact: 80, novelty: 60, reliability: 90, relevance: 70, experimentValue: 50 })).toBe(Math.round(20 + 12 + 18 + 17.5 + 5));
    expect(dailyScore({ impact: 100, novelty: 100, reliability: 100, relevance: 100, experimentValue: 100 }, 30)).toBe(100);
  });
  it("maps thresholds", () => {
    expect(recommend(85, 10)).toBe("MUST_LEARN");
    expect(recommend(70, 80)).toBe("EXPERIMENT");
    expect(recommend(70, 50)).toBe("SHOULD_LEARN");
    expect(recommend(55, 90)).toBe("WATCH");
    expect(recommend(35, 0)).toBe("LOW_PRIORITY");
    expect(recommend(10, 0)).toBe("IGNORE");
  });
});

describe("technology + watch", () => {
  it("detects known technologies, specific first", () => {
    expect(detectTechnology("anthropics/claude-code v2.1.0")?.name).toBe("Claude Code");
    expect(detectTechnology("Claude Opus 5.5 is here")?.name).toBe("Claude");
    expect(slugify("Claude Code!")).toBe("claude-code");
  });
  it("matches repositories and keywords", () => {
    const art = { title: "anthropics/claude-code v2.1.0", url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.0" };
    expect(watchMatches({ kind: "repository", pattern: "anthropics/*" }, art)).toBe(true);
    expect(watchMatches({ kind: "repository", pattern: "openai/codex" }, art)).toBe(false);
    expect(watchMatches({ kind: "technology", pattern: "Claude Code" }, { title: "New Claude Code hooks", url: "https://x.com" })).toBe(true);
    expect(watchMatches({ kind: "technology", pattern: "MCP" }, { title: "MCPS stuff", url: "https://x.com" })).toBe(false);
    expect(watchBoost([{ kind: "technology", pattern: "Claude Code", boost: 20 }, { kind: "repository", pattern: "anthropics/*", boost: 20 }], art).boost).toBe(30);
  });
});
