# DAILY AI

**A personal R&D system for getting better at AI-assisted software engineering, every day.**

DAILY AI collects what's new in AI (models, coding agents, MCP, agent frameworks, AI infrastructure), scores how much each item matters for software engineering, and helps you learn it, run an experiment on it, and record the result. Adopted results update a versioned **AI Engineering Playbook**.

```
DISCOVER → UNDERSTAND → LEARN → EXPERIMENT → BENCHMARK → VALIDATE → ADOPT / WATCH / REJECT → CAPTURE KNOWLEDGE → IMPROVE WORKFLOW
```

It's not a news aggregator. Finding something new doesn't mean adopting it: the playbook only changes through experiments.

| Page | Answers |
|---|---|
| **Today** | What changed today? What should I learn and test? What can improve my workflow? |
| **Discover** | Every collected item, scored and filterable. Add any URL manually |
| **Learn** | A structured study note per item (What is it? / Why it matters / … / Should we test it?) |
| **Experiments** | Hypothesis, baseline vs. new approach, metrics, benchmark results, then a decision: ADOPT / WATCH / REJECT / RETEST |
| **Knowledge** | Knowledge base by area and status, with Markdown export. Also holds the AI Engineering Playbook and its versions |
| **Radar** | Technology radar (ADOPT / TRIAL / ASSESS / WATCH / HOLD), updated when you decide an experiment |
| **Watch** | Technologies, repos, models and companies that get a score boost |
| **Digest** | The daily Markdown digest and its history |
| **Search** | Keyword (ranked full-text) or semantic (embeddings) search across discoveries and knowledge |
| **Settings** | Sources, AI provider status, encrypted secrets, notifications (Telegram / LINE / Slack / Discord), Git export, prompt versions, job/fetch/LLM-usage history |

Stack: Next.js 16 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS · Docker. The AI provider is pluggable: OpenAI-compatible (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio), Anthropic, or an offline heuristic provider that needs no API key.

---

## Quick start (development)

Prerequisites: Node.js ≥ 20.9 (22 recommended), PostgreSQL 16 (local or Docker).

```bash
# 1. Clone
git clone https://github.com/siwapanD/Daily-AI.git && cd Daily-AI
npm install

# 2. Configure
cp .env.example .env            # defaults work for local dev with the heuristic AI provider

# 3. Start a database (skip if you already run PostgreSQL)
docker run -d --name dailyai-db -p 5432:5432 \
  -e POSTGRES_USER=dailyai -e POSTGRES_PASSWORD=dailyai -e POSTGRES_DB=dailyai postgres:16-alpine

# 4. Create schema + seed default sources, prompts, playbook v1.0
npm run db:migrate
npm run db:seed

# 5. Start the app
npm run dev                      # http://localhost:3000
```

Then click **Fetch Now**, **Analyze Now**, and **Generate Digest** on the Today page.

### Add a source
**Settings → Sources → Add source.** Types:
- `rss`: any RSS/Atom feed URL
- `github`: `owner/repo` (tracks releases, or tags if there are no releases)
- `web`: a changelog or docs page (a new item appears whenever the page changes)
- `reddit`: `r/<subreddit>` (top posts above an upvote threshold)
- `youtube`: a channel id `UC…` (new videos)

To add a single article, paste its URL into the box at the top of **Discover**.

### Configure AI
The app works without a key: the **heuristic** provider classifies and scores with keyword rules. For real analysis, set these in `.env`:

```bash
# Anthropic
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_CHEAP_MODEL=claude-haiku-4-5      # classifies every item
LLM_STRONG_MODEL=claude-opus-5-5      # analyzes only items above LLM_ANALYZE_THRESHOLD

# or any OpenAI-compatible endpoint (OpenRouter shown)
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-...
LLM_CHEAP_MODEL=...                   # any model id your endpoint serves
LLM_STRONG_MODEL=...
```

You can also save the key in **Settings → Secrets**, where it's stored encrypted. See [docs/ai-provider.md](docs/ai-provider.md).

---

## Production (Docker Compose)

```bash
cp .env.example .env
# set at least: APP_PASSWORD, CRON_SECRET, APP_SECRET_KEY, POSTGRES_PASSWORD (+ LLM_* to enable AI)
docker compose up -d --build
curl http://localhost:3000/api/health
```

The stack runs `db` (PostgreSQL 16), `app` (Next.js standalone, which migrates and seeds itself on start), and `cron` (calls the daily job at `DAILY_JOB_CRON`, 06:00 UTC by default). To get the digest in Telegram, LINE, Slack or Discord every morning, see [docs/notifications.md](docs/notifications.md). Put your reverse proxy in front of port 3000. See [docs/deployment.md](docs/deployment.md).

## Commands

| Task | Command |
|---|---|
| Development start | `npm run dev` |
| Production start | `docker compose up -d --build` (or `npm run build && node .next/standalone/server.js` after copying `.next/static` and `drizzle/`) |
| Migration | `npm run db:migrate` (production runs it automatically on start) |
| New migration after a schema change | `npm run db:generate` |
| Seed (idempotent) | `npm run db:seed` |
| Run the daily job once | `npm run job:daily` or `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/daily` |
| Backup | `scripts/backup.sh [dir]` |
| Restore | `scripts/restore.sh backups/dailyai-YYYYMMDD-HHMMSS.sql.gz` |
| All checks | `npm run check` (lint, typecheck, tests, build) |

## API

Every API route except `/api/health` sits behind Basic Auth when `APP_PASSWORD` is set. `/api/jobs/*` also accepts `Authorization: Bearer $CRON_SECRET`.

| Endpoint | Methods |
|---|---|
| `/api/health` | GET: DB check |
| `/api/sources`, `/api/sources/:id` | GET, POST / GET, PATCH, DELETE |
| `/api/discoveries` | GET (filters: `q, category, recommendation, minScore, sourceId, days, page`), POST `{url}` (manual URL) |
| `/api/discoveries/:id` | GET, PATCH `{action: learn\|experiment\|watch\|ignore\|analyze\|clear}` |
| `/api/jobs/:job` | POST, where `job` is `fetch`, `analyze`, `embed`, `digest`, `notify`, `export` or `daily` |
| `/api/digest` | GET `?date=` / `?list=1`, POST to generate · `/api/digest/export` gives Markdown |
| `/api/knowledge`, `/api/knowledge/:id` | GET, POST / GET, PATCH, DELETE · `/:id/export` gives Markdown |
| `/api/experiments`, `/api/experiments/:id` | GET, POST (fields, or `{articleId}` for an AI draft) / GET (includes the benchmark comparison), PATCH, DELETE |
| `/api/experiments/:id/results` | POST `{variant, timeMinutes, tokens, costUsd, quality, accuracy, testPassRate, humanInterventions, retries}` |
| `/api/experiments/:id/decision` | POST `{decision, conclusion, playbookRule?}` |
| `/api/experiments/:id/benchmark` | POST `{config?}`: run the automated LLM benchmark |
| `/api/experiments/:id/export`, `/api/playbook/export?v=` | Markdown |
| `/api/radar`, `/api/watch`, `/api/watch/:id`, `/api/search?q=&mode=keyword\|semantic` | GET/POST, DELETE, GET |

## Documentation

- [Architecture](docs/architecture.md) · [Database design](docs/database-design.md) · [Implementation plan](docs/implementation-plan.md) · [Task list](docs/task-list.md)
- [Installation](docs/installation.md) · [Configuration](docs/configuration.md) · [Collectors](docs/collectors.md) · [AI provider](docs/ai-provider.md)
- [Experiments](docs/experiments.md) · [Notifications](docs/notifications.md) · [Git export](docs/git-export.md) · [Deployment](docs/deployment.md) · [Backup](docs/backup.md) · [Troubleshooting](docs/troubleshooting.md)
