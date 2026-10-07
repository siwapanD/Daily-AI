# AI Provider

## Interface
`src/lib/llm/types.ts`
```ts
interface LLMProvider {
  chat(messages, opts): Promise<ChatResult>;
  summarize(item, opts): Promise<string>;           // Learn note (markdown)
  classify(item, opts): Promise<ClassifyResult>;    // tags + scores
  analyze(item, opts): Promise<AnalyzeResult>;      // summary, why it matters, technology, experiment idea
  draftExperiment(item, opts): Promise<ExperimentDraft>;
}
```
Adapters:
- **`openai-compatible`** (`openai-compatible.ts`): `POST {LLM_BASE_URL}/chat/completions`. Works with OpenAI, OpenRouter, LiteLLM, vLLM, Ollama (`http://ollama:11434/v1`), and LM Studio (`http://host:1234/v1`). Local endpoints don't need a key.
- **`anthropic`** (`anthropic.ts`): uses the official `@anthropic-ai/sdk` (Messages API). Sets `output_config.effort: "low"` on models that support it (not Haiku 4.5). On `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5` and `claude-fable-5-1` it also sends the server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Remove that block in `anthropic.ts` if you don't want it.
- **`heuristic`** (`heuristic.ts`): offline and deterministic (keyword classification, rule-based scores, templated notes). It is the default, and every failure falls back to it.

The high-level operations are implemented once, in `base.ts`, on top of `chat()` and the versioned prompts. A new provider only has to implement `complete()`.

## Cost control
| Mechanism | Where |
|---|---|
| Cheap → strong cascade: the cheap model classifies everything; only items scoring ≥ `LLM_ANALYZE_THRESHOLD` (at most `LLM_MAX_STRONG_PER_RUN` per run) go to the strong model | `services/analysis.ts` |
| Daily token limit, after which calls degrade to heuristic | `llm/index.ts` (`metered`) |
| Per-task max tokens | `LLM_MAX_TOKENS_PER_TASK` |
| Response cache (sha256 of provider + model + prompt) | `llm_cache` table |
| Fallback model | `LLM_FALLBACK_MODEL` |
| Content dedupe before any LLM call | `services/discovery.ts` |
| Input truncation (1.5k chars to classify, 6k to analyze) | `llm/base.ts` |
| Every call logged: provider, model, prompt version, tokens, estimated cost, latency, success, error | `llm_runs` table, visible in Settings |

Estimated cost comes from a built-in price table (Claude Haiku 4.5 $1/$5, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per 1M tokens, plus a few others). Override or extend it with `LLM_PRICING`.

### Suggested setups
| Budget | Cheap model | Strong model |
|---|---|---|
| Free | heuristic | heuristic |
| Local | Ollama `qwen2.5:7b` | Ollama `qwen2.5:14b` |
| Low cost | `claude-haiku-4-5` | `claude-haiku-4-5` |
| Quality | `claude-haiku-4-5` | `claude-opus-5-5` |

With the defaults (about 100 new items/day, 15 strong analyses), expect roughly 150–250k tokens per day.

## Prompts
Default prompts are defined in `src/lib/prompts.ts`: `importance-classifier-v1`, `daily-analysis-v1`, `knowledge-summary-v1`, `experiment-generator-v1`, `digest-summary-v1`. The seed mirrors them into `prompts` / `prompt_versions`, and each `llm_runs` row records the version used.

**Settings → Manage prompts** (`/settings/prompts`) lets you:
- read every version's template,
- create a new version (pre-filled from the active one),
- activate any version (takes effect within 30 seconds),
- compare versions on calls, failures, tokens, cost and average latency.

The DB is authoritative for which version is active and for its template. Re-running the seed never overrides a version you activated in the UI. To ship a new default in code, add version N to `PROMPTS` with `active: N`. It becomes active only for prompts that have no active version yet; otherwise activate it in the UI.
