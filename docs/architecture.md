# DAILY AI — Architecture

## 1. Phase 0 findings (repository analysis)

| Item | Finding | Decision |
|---|---|---|
| Repository | Empty (only `README.md`) | Greenfield; nothing to reuse in-repo |
| Runtime | Node 22, npm 10 | Next.js 16 + TypeScript |
| Database | PostgreSQL 16 available | PostgreSQL + Drizzle ORM (SQL-first, light, no codegen engine) |
| Containers | Docker + Compose v2 | `docker-compose.yml` for db + app + cron |
| Infra assumed | Reverse proxy, Linux server, GitHub | App listens on `:3000`; TLS terminates at the proxy |

## 2. Guiding constraints

* MVP first, budget ≈ $50 of development. Working product > beautiful architecture > automation.
* One deployable (Next.js monolith). No microservices, no queue, no vector DB.
* Everything that costs money (LLM calls) is metered, cached and capped.
* The system must run **without any LLM key** (heuristic provider) so it is always usable; an LLM improves quality.

## 3. System overview

```
Browser ──► Next.js (App Router, server components + server actions)
              │
              ├── UI pages: Today · Discover · Learn · Experiments · Knowledge · Radar · Watch · Digest · Settings
              ├── REST API: /api/*  (thin wrappers over services, zod-validated)
              ├── proxy.ts: optional Basic Auth (APP_PASSWORD), Bearer CRON_SECRET for /api/jobs/*
              │
              ▼
        Application services (src/lib/services)
              ├── sources       – CRUD, reliability
              ├── discovery     – fetch → normalize → dedupe → store (collectors)
              ├── analysis      – heuristic classify/score → cheap LLM → strong LLM for top items
              ├── knowledge     – Learn briefs, knowledge items, playbook versions
              ├── experiments   – experiments, results (benchmark), decisions
              ├── radar         – technology radar + timelines
              ├── watch         – watch list, score boost
              ├── digest        – daily digest (markdown)
              └── jobs          – daily job orchestration, job history
              │
              ├── LLM gateway (src/lib/llm): provider adapters + budget + cache + run logging
              └── Collectors (src/lib/collectors): rss · github · web · manual
              ▼
        PostgreSQL ◄── cron container (curl /api/jobs/daily with CRON_SECRET)
```

## 4. Data pipeline

```
FETCH (per source, isolated, timeout + retry)
  → NORMALIZE (canonical URL, strip HTML, trim content, normalized title)
  → DEDUPLICATE (unique canonical URL + normalized-title hash within 30 days)
  → CLASSIFY (keyword heuristics → tags; cheap LLM refines when configured)
  → SCORE (impact, novelty, reliability, relevance, experiment value → DAILY AI SCORE)
  → AI ANALYSIS (strong LLM only for items above LLM_ANALYZE_THRESHOLD)
  → STORE → RECOMMEND (MUST LEARN … IGNORE) → EXPERIMENT (user action)
```

**Score** (0–100): `impact*.25 + novelty*.20 + reliability*.20 + relevance*.25 + experimentValue*.10`, plus a watch-list boost (capped at 100). Reliability always comes from the source (not from the LLM).

**Recommendation** (deterministic from scores, so it is testable and consistent):

| Rule | Level |
|---|---|
| score ≥ 80 | MUST_LEARN |
| score ≥ 65 and experimentValue ≥ 70 | EXPERIMENT |
| score ≥ 65 | SHOULD_LEARN |
| score ≥ 50 | WATCH |
| score ≥ 30 | LOW_PRIORITY |
| otherwise | IGNORE |

## 5. LLM gateway

```ts
interface LLMProvider {
  name: string;
  chat(messages, opts): Promise<ChatResult>;        // raw completion + token usage
  summarize(text, opts): Promise<string>;
  classify(item, opts): Promise<ClassifyResult>;    // tags + scores (cheap model)
  analyze(item, opts): Promise<AnalyzeResult>;      // summary, why it matters, technology (strong model)
}
```

Adapters: `openai-compatible` (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio, vLLM), `anthropic` (Messages API), `heuristic` (offline, deterministic). All use `fetch`; no vendor SDKs.

Cost controls: daily token limit, per-task max tokens, cheap→strong model cascade, fallback model, response cache (`llm_cache`, keyed by provider+model+prompt hash), content dedupe before any LLM call, versioned prompts. When the daily budget is exhausted the gateway degrades to the heuristic provider instead of failing. Every call is logged to `llm_runs` (provider, model, prompt version, tokens, estimated cost, latency, success, error).

## 6. Collectors

| Collector | Input | Notes |
|---|---|---|
| `rss` | RSS 2.0 / Atom / RDF URL | `fast-xml-parser`; newest 30 items |
| `github` | `owner/repo` | Releases API, falls back to tags; optional `GITHUB_TOKEN` |
| `web` | Page URL (changelog/docs) | Detects page changes by content hash; emits "Updated: <title>" items |
| `manual` | Any URL pasted by user | Extracts title/description/text; reliability from domain authority map |

Each source fetch is isolated: timeout (15s), 1 retry, 2 MB body cap, failure logged in `fetch_logs`, source marked with `last_error`; the pipeline continues.

## 7. Security

* API keys only in server env or encrypted (`AES-256-GCM`, `APP_SECRET_KEY`) in `system_settings`; never serialized to the client.
* SSRF protection for every outbound fetch: http(s) only, no credentials in URL, DNS resolution checked against private/loopback/link-local/metadata ranges, redirects followed manually and re-validated (max 5).
* Input validation with `zod` on API routes and server actions.
* Fetched HTML is reduced to plain text before storage; markdown rendered with `react-markdown` (no raw HTML, safe URL transform).
* In-memory rate limiting on expensive endpoints (fetch/analyze/manual URL/LLM).
* Optional Basic Auth for the whole app (`APP_PASSWORD`), `CRON_SECRET` bearer for jobs. `/api/health` is public.

## 8. Observability

Structured JSON logs (`src/lib/logger.ts`), `job_runs` (job history), `fetch_logs` (fetch history), `llm_runs` (usage + cost). Settings page shows all of them.

## 9. Scheduling

`cron` service in Compose (busybox `crond`) calls `POST /api/jobs/daily` with `CRON_SECRET` at 06:00 (configurable). Manual triggers: Fetch Now, Analyze Now, Generate Digest, Create Experiment.

## 10. Migrations

Drizzle Kit generates SQL migrations into `drizzle/`. They are applied by `npm run db:migrate` in development and automatically on server start (`instrumentation.ts`, guarded by a Postgres advisory lock; disable with `AUTO_MIGRATE=false`). Seed data (default sources, prompts, playbook v1.0) is idempotent.

## 11. Future extension points

* `collectors/` registry → add Reddit/X/YouTube collectors.
* `llm/` adapters → add providers; `prompt_versions` → benchmark prompts.
* `experiment_results` already stores per-variant metrics → automated benchmark runner can write the same rows.
* Markdown export everywhere → Git commit of knowledge/playbook later.
* Single-user now; `owner_id` columns can be added for teams.
