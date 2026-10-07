import { rssCollector } from "./rss";
import { githubCollector } from "./github";
import { webCollector } from "./web";
import type { Collector } from "./types";

export const collectors: Record<string, Collector> = {
  rss: rssCollector,
  github: githubCollector,
  web: webCollector,
  // Manual sources hold user-submitted items only; nothing to poll.
  manual: async () => ({ items: [] }),
};

/** Reliability for an arbitrary URL based on its domain (used for manual URLs). */
const DOMAIN_AUTHORITY: [RegExp, number, string][] = [
  [/(^|\.)(docs\.anthropic\.com|docs\.claude\.com|platform\.openai\.com|ai\.google\.dev|modelcontextprotocol\.io)$/, 100, "official"],
  [/(^|\.)(anthropic\.com|openai\.com|claude\.com|deepmind\.google|blog\.google|ai\.meta\.com|mistral\.ai|deepseek\.com|github\.blog|huggingface\.co|qwenlm\.github\.io)$/, 95, "official"],
  [/(^|\.)github\.com$/, 90, "official"],
  [/(^|\.)(arxiv\.org)$/, 85, "technical"],
  [/(^|\.)(simonwillison\.net|martinfowler\.com|engineering\.\w+|\w+\.engineering)$/, 85, "technical"],
  [/(^|\.)(news\.ycombinator\.com)$/, 70, "technical"],
  [/(^|\.)(reddit\.com)$/, 55, "community"],
  [/(^|\.)(x\.com|twitter\.com|youtube\.com|medium\.com|dev\.to)$/, 50, "community"],
];

export function domainAuthority(url: string): { reliability: number; authority: string } {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const [re, reliability, authority] of DOMAIN_AUTHORITY) if (re.test(host)) return { reliability, authority };
  } catch {}
  return { reliability: 40, authority: "community" };
}
