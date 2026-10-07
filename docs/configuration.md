# Configuration

All configuration is through environment variables (`.env`, read by Next.js and Docker Compose). Secrets are read only on the server and never sent to the browser.

## Core
| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://dailyai:dailyai@localhost:5432/dailyai` | PostgreSQL connection string (Compose overrides this for the `app` service) |
| `APP_URL` | `http://localhost:3000` | Public URL, used in digest links |
| `APP_PASSWORD` | _(empty)_ | Turns on HTTP Basic Auth for every page and API route except `/api/health`. **Set it whenever the app is reachable from the internet.** Any username is accepted |
| `CRON_SECRET` | — | Bearer token accepted on `/api/jobs/*` (used by the cron container) |
| `APP_SECRET_KEY` | — | Key (≥ 16 chars) for AES-256-GCM encryption of secrets stored in the DB. Generate with `openssl rand -hex 32`. If you change it, previously stored secrets can no longer be read |
| `AUTO_MIGRATE` | `true` | Apply migrations and the idempotent seed on server start |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` (structured JSON logs) |
| `ALLOW_PRIVATE_FETCH` | `false` | Allow collectors to fetch private/loopback addresses (only for local feeds) |
| `FETCH_TIMEOUT_MS` | `15000` | Per-request timeout for collectors |
| `GITHUB_TOKEN` | — | Raises the GitHub API limit from 60 to 5000 requests/hour. Can also be stored in Settings → Secrets |
| `DAILY_JOB_CRON` | `0 6 * * *` | Schedule for the cron container (UTC). Quote it in `.env` |

## Notifications
| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Send the daily digest to Telegram |
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TO` | Send it to LINE (Messaging API push) |
| `NOTIFY_WEBHOOK_URL` | Send it to a Slack/Discord incoming webhook |

All of these can also be stored encrypted in Settings → Secrets. See [notifications.md](notifications.md).

## Semantic search
| Variable | Default | Description |
|---|---|---|
| `EMBEDDING_PROVIDER` | `local`, or `openai-compatible` when `EMBEDDING_MODEL` is set | `local` = offline lexical hashing (no key, weaker); `openai-compatible` = `/embeddings` endpoint |
| `EMBEDDING_BASE_URL` | `LLM_BASE_URL` | e.g. `https://api.openai.com/v1`, `http://ollama:11434/v1` |
| `EMBEDDING_MODEL` | — | e.g. `text-embedding-3-small`, `nomic-embed-text` (Ollama) |
| `EMBEDDING_API_KEY` | `LLM_API_KEY` | Key for the embeddings endpoint |

Changing the model re-embeds everything on the next `embed` run (vectors are stored per model).

## Git export
| Variable | Default | Description |
|---|---|---|
| `GIT_EXPORT_DIR` | — | Git working copy to write Markdown into (enables the export step) |
| `GIT_EXPORT_PUSH` | `false` | Push after committing |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `DAILY AI` / `daily-ai@localhost` | Commit author |

See [git-export.md](git-export.md).

## AI provider
| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `heuristic` | `heuristic`, `openai-compatible` or `anthropic` |
| `LLM_BASE_URL` | — | Base URL for `openai-compatible` (e.g. `https://openrouter.ai/api/v1`, `https://api.openai.com/v1`, `http://ollama:11434/v1`) |
| `LLM_API_KEY` | — | API key. Can also be stored encrypted in Settings → Secrets; the env value wins |
| `LLM_CHEAP_MODEL` | — | Classifies and scores every new item |
| `LLM_STRONG_MODEL` | cheap model | Deep analysis, Learn notes, experiment drafts, digest intro |
| `LLM_FALLBACK_MODEL` | — | Retried once when a call to the primary model fails |
| `LLM_DAILY_TOKEN_LIMIT` | `300000` | Hard daily cap. Once reached, the app switches to the heuristic provider |
| `LLM_MAX_TOKENS_PER_TASK` | `1200` | Output cap per call (×1.5 for the strong model) |
| `LLM_ANALYZE_THRESHOLD` | `55` | Minimum score after classification for an item to get strong-model analysis |
| `LLM_MAX_STRONG_PER_RUN` | `15` | Maximum strong-model analyses per run |
| `LLM_PRICING` | — | JSON price overrides in USD per 1M tokens: `{"model":[input,output]}` |

## Runtime settings (UI)
- **Sources**: add, enable/disable, edit tier and reliability, fetch one source (Settings).
- **Secrets**: `LLM_API_KEY` and `GITHUB_TOKEN` can be saved encrypted (Settings).
- **Watch list**: keyword and repository boosts (Watch).
