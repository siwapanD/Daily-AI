import { safeFetch } from "../security/safe-fetch";
import { parseFeed } from "./rss";
import type { Collector } from "./types";
import type { RawItem } from "../pipeline/normalize";

/** Accepts "LocalLLaMA", "r/LocalLLaMA" or a reddit.com/r/... URL. */
export function parseSubreddit(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/(?:www\.|old\.)?reddit\.com)?\/?(?:r\/)?([A-Za-z0-9_]{2,21})\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

/**
 * Reddit (community, tier 3): top posts of the day above `config.minScore` upvotes (default 100).
 * Uses the public JSON listing; falls back to the RSS feed (no score filter) when JSON is blocked.
 */
export const redditCollector: Collector = async (source) => {
  const sub = parseSubreddit(source.url);
  if (!sub) throw new Error(`Invalid subreddit: ${source.url}`);
  const cfg = source.config as { minScore?: number; limit?: number; period?: string };
  const minScore = cfg.minScore ?? 100;
  const limit = Math.min(cfg.limit ?? 25, 100);
  const period = ["hour", "day", "week", "month"].includes(cfg.period ?? "") ? cfg.period : "day";

  const res = await safeFetch(`https://www.reddit.com/r/${sub}/top.json?t=${period}&limit=${limit}&raw_json=1`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 403 || res.status === 429) {
    const feed = await safeFetch(`https://www.reddit.com/r/${sub}/top/.rss?t=${period}`);
    if (feed.status >= 400) throw new Error(`Reddit HTTP ${res.status}; RSS fallback HTTP ${feed.status}`);
    return { items: parseFeed(feed.text, limit) };
  }
  if (res.status >= 400) throw new Error(`Reddit HTTP ${res.status}`);

  type Post = { data: { title: string; permalink: string; url: string; selftext?: string; author?: string; created_utc: number; score: number; num_comments: number; stickied?: boolean; over_18?: boolean } };
  const posts = (JSON.parse(res.text) as { data?: { children?: Post[] } }).data?.children ?? [];
  const items: RawItem[] = posts
    .map((p) => p.data)
    .filter((p) => !p.stickied && !p.over_18 && p.score >= minScore)
    .map((p) => ({
      url: `https://www.reddit.com${p.permalink}`,
      title: p.title,
      content: [p.selftext, p.url && !p.url.includes(p.permalink) ? `Link: ${p.url}` : "", `${p.score} upvotes · ${p.num_comments} comments on r/${sub}`]
        .filter(Boolean).join("\n\n"),
      author: p.author ?? null,
      publishedAt: new Date(p.created_utc * 1000),
    }));
  return { items };
};

/** Accepts a channel id (UC…) or a youtube.com/channel/UC… URL. */
export function parseYoutubeChannel(input: string): string | null {
  const m = input.trim().match(/(?:^|\/channel\/|channel_id=)(UC[\w-]{22})(?:$|[/?&#])/);
  return m ? m[1] : null;
}

/** YouTube channel uploads via the public channel feed (no API key). */
export const youtubeCollector: Collector = async (source) => {
  const id = parseYoutubeChannel(source.url);
  if (!id) throw new Error("YouTube source must be a channel id (UC…) or a youtube.com/channel/UC… URL");
  const res = await safeFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  if (res.status >= 400) throw new Error(`YouTube HTTP ${res.status}`);
  const limit = Number((source.config as { limit?: number }).limit) || 15;
  return { items: parseFeed(res.text, limit) };
};
