import { safeFetch } from "../security/safe-fetch";
import { env } from "../env";
import type { Collector } from "./types";
import type { RawItem } from "../pipeline/normalize";
import { parseFeed } from "./rss";

class GitHubLimitError extends Error {}

/** Accepts "owner/repo", "https://github.com/owner/repo" or ".../releases". */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function gh(path: string) {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (env.githubToken) headers.authorization = `Bearer ${env.githubToken}`;
  const res = await safeFetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return [];
  if (res.status === 403 || res.status === 429) throw new GitHubLimitError(`GitHub HTTP ${res.status} (rate limited? set GITHUB_TOKEN)`);
  if (res.status >= 400) throw new Error(`GitHub HTTP ${res.status}`);
  return JSON.parse(res.text) as Record<string, unknown>[];
}

export const githubCollector: Collector = async (source) => {
  const parsed = parseRepo(source.url);
  if (!parsed) throw new Error(`Invalid GitHub repo: ${source.url}`);
  const { owner, repo } = parsed;
  const cfg = source.config as { includePrereleases?: boolean; limit?: number };
  const limit = cfg.limit ?? 10;

  let releases: Record<string, unknown>[];
  try {
    releases = await gh(`/repos/${owner}/${repo}/releases?per_page=${limit}`);
  } catch (e) {
    if (!(e instanceof GitHubLimitError)) throw e;
    // API rate limit: fall back to the public releases Atom feed (no token needed).
    const feed = await safeFetch(`https://github.com/${owner}/${repo}/releases.atom`);
    if (feed.status >= 400) throw new Error(`${e.message}; atom fallback HTTP ${feed.status}`);
    return { items: parseFeed(feed.text, limit).map((i) => ({ ...i, title: `${owner}/${repo} ${i.title}` })) };
  }
  const items: RawItem[] = releases
    .filter((r) => !r.draft && (cfg.includePrereleases || !r.prerelease))
    .map((r) => ({
      url: String(r.html_url),
      title: `${owner}/${repo} ${String(r.name || r.tag_name)}`.replace(new RegExp(`^(${owner}/${repo}) \\1`, "i"), "$1"),
      content: String(r.body ?? ""),
      author: (r.author as { login?: string } | null)?.login ?? null,
      publishedAt: r.published_at ? new Date(String(r.published_at)) : null,
    }));

  if (items.length === 0) {
    const tags = await gh(`/repos/${owner}/${repo}/tags?per_page=${Math.min(limit, 5)}`);
    for (const t of tags) {
      items.push({
        url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(String(t.name))}`,
        title: `${owner}/${repo} tag ${String(t.name)}`,
        content: `New tag ${String(t.name)} in ${owner}/${repo}.`,
        publishedAt: null,
      });
    }
  }
  return { items };
};
