# DAILY AI — Task List

Status: ✅ done · ⏳ partial · ⬜ not started. Each task: Goal / Files / Dependencies / Implementation / Acceptance / Verification.

## P0

| ID | Goal | Files | Deps | Acceptance | Verification | Status |
|---|---|---|---|---|---|---|
| T01 | Scaffold Next.js + TS + Tailwind + lint + vitest | `package.json`, `src/app/*` | — | `npm run build` passes | lint/typecheck/build | ✅ |
| T02 | DB schema + migrations + seed | `src/lib/db/*`, `drizzle/*` | T01 | migration applies on clean DB; seed idempotent | `npm run db:migrate`, `npm run db:seed` twice | ✅ |
| T03 | Env, logger, security utils (SSRF, rate limit, crypto) | `src/lib/env.ts`, `logger.ts`, `security/*` | T01 | private IPs rejected; secrets round-trip | unit tests | ✅ |
| T04 | Collectors: RSS, GitHub, web, manual + safe fetch | `src/lib/collectors/*` | T03 | parse real RSS/Atom; GitHub releases | unit tests + live fetch | ✅ |
| T05 | Normalize + dedupe + ingest service | `src/lib/pipeline/*`, `services/discovery.ts` | T02,T04 | refetch inserts 0 duplicates | integration test | ✅ |
| T06 | Heuristic classify + score + recommendation | `src/lib/pipeline/classify.ts`, `score.ts` | T05 | deterministic scores 0-100, multi-tag | unit tests | ✅ |
| T07 | LLM gateway + adapters + budget + cache + logging + prompts | `src/lib/llm/*`, `src/lib/prompts.ts` | T02 | no key → heuristic; runs logged; cap enforced | unit tests (mock fetch) | ✅ |
| T08 | Analysis service (cheap → strong cascade, technology linking, watch boost) | `services/analysis.ts` | T06,T07 | articles analyzed + scored | integration test | ✅ |
| T09 | Layout/nav + Today page + Discover (filters, cards, actions) | `src/app/page.tsx`, `discover/*`, `components/*` | T08 | dashboard answers the 4 questions | runtime smoke | ✅ |
| T10 | Learn + Knowledge (areas, statuses, search, markdown, export) | `learn/*`, `knowledge/*`, `services/knowledge.ts` | T08 | Learn → saved knowledge → .md export | runtime smoke | ✅ |
| T11 | Experiments + results + decision + playbook update | `experiments/*`, `services/experiments.ts` | T10 | full experiment lifecycle | integration test + smoke | ✅ |
| T12 | Daily digest + daily job + manual triggers + cron | `services/digest.ts`, `services/jobs.ts`, `api/jobs/*` | T08 | digest markdown generated | integration test | ✅ |
| T13 | REST API | `src/app/api/*` | services | endpoints validate input | smoke via curl | ✅ |
| T14 | Production Docker + compose + health + backup/restore + docs | `Dockerfile`, `docker-compose.yml`, `scripts/*`, `docs/*` | all | `docker compose up` healthy | docker build + health check | ✅ |

## P1

| ID | Goal | Status |
|---|---|---|
| T20 | Technology radar page + auto-update from decisions | ✅ |
| T21 | Technology timeline page | ✅ |
| T22 | Global search across entities | ✅ |
| T23 | Watch list (boost + auto GitHub source for repos) | ✅ |
| T24 | Prompt version UI: view, create, activate, compare usage per version (Settings → Prompts) | ✅ |
| T25 | Full-text search: generated tsvector columns + GIN, ranked, web query syntax | ✅ |

## P2

| ID | Goal | Status |
|---|---|---|
| T30 | Daily digest notifications: Telegram, LINE Messaging API, Slack/Discord webhook; part of the daily job; test + manual send | ✅ |
| T31 | Semantic search: embeddings (OpenAI-compatible or offline local), semantic mode in Search/API, Related items on Learn/Knowledge, `embed` step in the daily job | ✅ |
| T32 | Social collectors: Reddit (top posts above an upvote threshold, RSS fallback) and YouTube channels. X/Twitter is not included: there is no free API | ✅ |
| T33 | Automated benchmark runner: variants (model + system prompt) × cases, auto-scored (contains/exact/regex/LLM judge), results recorded per variant | ✅ |
| T34 | Git export: Markdown export of knowledge/playbook/experiments/prompts/radar/digests, commit on change, optional push | ✅ |
