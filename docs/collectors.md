# Collectors

Collectors live in `src/lib/collectors/`. Each one is a function `(source) => { items, state? }`, registered in `collectors/index.ts`.

| Type | Source URL | Behaviour |
|---|---|---|
| `rss` | RSS 2.0 / RSS 1.0 (RDF) / Atom URL | Takes the newest 30 items (`config.limit` overrides) |
| `github` | `owner/repo` or a github.com URL | Releases API (skips drafts; prereleases only with `config.includePrereleases`). Falls back to tags when a repo has no releases, and to the public `releases.atom` feed when the API is rate limited |
| `web` | Any HTML page (changelog, docs) | Hashes the page text. The first fetch emits the page; after that, a new `Updated: <title>` item appears whenever the content changes |
| `reddit` | `r/<subreddit>` | Community (tier 3). Top posts of the day with at least `config.minScore` upvotes (default 100); stickied and NSFW posts are skipped. Falls back to the subreddit RSS feed when the JSON API is blocked. Reddit often blocks datacenter IPs, so the seeded Reddit sources start **disabled** |
| `youtube` | Channel id `UC…` or a `youtube.com/channel/UC…` URL | The channel's public uploads feed (no API key); newest 15 videos |
| `manual` | — | Holds URLs you add in Discover. Reliability comes from a domain authority map (official docs 100, vendor blogs/GitHub 90–95, HN 70, Reddit 55, unknown 40) |

## Pipeline
`fetch → normalize → deduplicate → classify → score → analyze → store → recommend`

- **Normalize**: HTML reduced to plain text (nothing executable is stored), entities decoded, aggregator boilerplate stripped, content capped at 20k characters, future dates clamped.
- **Deduplicate**: unique canonical URL (lowercased host, no `www.`, no fragment, tracking parameters removed, sorted query, no trailing slash), plus no repeat of a normalized-title hash within 30 days.
- **Isolation**: each source has a timeout, one retry on network/5xx errors, and a 2 MB body cap. A failure is written to `fetch_logs` and `sources.last_error`, and the other sources keep going.
- **SSRF protection**: http(s) only, no credentials in the URL, the DNS answer must be a public address, and every redirect is re-validated (at most 5).

## Default sources
Seeded in `src/lib/db/seed.ts`: OpenAI News, Google AI Blog, GitHub Changelog, Hugging Face Blog, GitHub releases (claude-code, codex, gemini-cli, MCP TypeScript SDK, aider, cline, litellm), Simon Willison, Hacker News (AI, 100+ points), and arXiv cs.SE (disabled by default because of its volume). Feeds change over time, so check **Settings → Sources** for errors and edit or disable sources there.

## Adding a collector
1. Create `src/lib/collectors/<name>.ts` that exports a `Collector`.
2. Register it in `collectors/index.ts` and add the type to `SOURCE_TYPES` in `src/lib/constants.ts`.
3. Use `safeFetch()` for every outbound request so SSRF protection, timeouts and size limits apply.
