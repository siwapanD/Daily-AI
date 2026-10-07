# DAILY AI — Database Design (PostgreSQL)

Defined in `src/lib/db/schema.ts` (Drizzle). Migrations in `drizzle/`.

## Entity overview

```
sources 1─* articles *─* tags (article_tags)
                │  *─1 technologies 1─* radar_items
                │                     1─* knowledge_items
                └─1 knowledge_items        experiments *─1 technologies
experiments 1─* experiment_results
watch_items · daily_digests · prompts 1─* prompt_versions · llm_runs · llm_cache
system_settings · job_runs · fetch_logs · playbook_versions
```

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `sources` | Where content comes from | `type` (rss/github/web/manual), `url`, `config` jsonb, `tier` 1-3, `authority_level`, `reliability_score` 0-100, `enabled`, `last_fetched_at`, `last_error`, `state` jsonb (e.g. web page hash) |
| `articles` | Discoveries | `canonical_url` UNIQUE, `title_hash` (normalized title sha256), `content_hash`, `content`, `excerpt`, `published_at`, `status` (new/classified/analyzed/error), five sub-scores, `daily_score`, `watch_boost`, `recommendation`, `summary`, `why_it_matters`, `analysis` jsonb, `analyzed_by`, `technology_id`, `user_action` (learn/experiment/watch/ignore) |
| `tags` / `article_tags` | Category classification (MODEL, CODING, AGENT…, multi-tag) | PK (`article_id`,`tag_id`) |
| `technologies` | Tracked things (Claude Code, MCP…) | `name`, `slug` UNIQUE, `category`, `vendor` |
| `knowledge_items` | Learned knowledge (markdown) | `area` (Prompt Engineering…), `status` (NEW…OUTDATED), `content_md`, `article_id`, `technology_id`, `tags` text[] |
| `experiments` | Experiment engine | `code` UNIQUE (EXP-YYYY-NNN), problem, hypothesis, baseline, new_approach, setup, steps, `metrics` text[], `status` (planned/running/completed), `decision` (ADOPT/WATCH/REJECT/RETEST), conclusion, problems, execution_notes |
| `experiment_results` | Per-variant measurements (benchmark) | `variant` (baseline/new/other label), time_minutes, tokens, cost_usd, quality, accuracy, test_pass_rate, human_interventions, retries, `extra` jsonb |
| `radar_items` | Technology radar | `name` UNIQUE, `ring` (ADOPT/TRIAL/ASSESS/WATCH/HOLD), `quadrant`, `rationale`, `technology_id`, `experiment_id` |
| `watch_items` | Watch list | `kind` (technology/repository/model/company/framework/feature), `name`, `pattern` (keyword or owner/repo or owner/*), `boost` |
| `daily_digests` | Generated digests | `digest_date` UNIQUE, `content_md`, `data` jsonb, `generated_by` |
| `prompts` / `prompt_versions` | Prompt registry | `key` UNIQUE; (`prompt_id`,`version`) UNIQUE, `template`, `is_active` |
| `llm_runs` | LLM usage log | provider, model, task, prompt_version, input/output tokens, estimated_cost, latency_ms, success, error, cached |
| `llm_cache` | Response cache | `key` (sha256) PK, `response` jsonb |
| `system_settings` | Runtime settings & encrypted secrets | `key` PK, `value` jsonb, `is_secret` |
| `job_runs` | Job history | job, status, started/finished, `stats` jsonb, error |
| `fetch_logs` | Fetch history | source_id, status, items_found, items_new, duration_ms, error |
| `playbook_versions` | AI Engineering Playbook history | `version` UNIQUE, `content_md`, `changelog`, `experiment_id` |

## Indexes

* `articles(canonical_url)` unique, `articles(title_hash)`, `articles(daily_score desc)`, `articles(published_at desc)`, `articles(status)`.
* `knowledge_items(area)`, `experiments(code)` unique, `llm_runs(created_at)`.

## Deduplication (MVP)

1. Canonical URL: lower-cased host, no fragment, tracking params (`utm_*`, `ref`, `fbclid`, `gclid`…) removed, trailing slash trimmed → UNIQUE constraint (`ON CONFLICT DO NOTHING`).
2. Normalized title hash: lowercase, punctuation stripped, whitespace collapsed → sha256; an article whose title hash exists in the last 30 days is skipped.

Future: content hash similarity, embeddings (pgvector).
