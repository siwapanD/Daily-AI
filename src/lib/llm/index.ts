import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { logger, errMsg } from "../logger";
import { sha256 } from "../security/crypto";
import { getSecret } from "../services/settings";
import { getActivePrompt } from "../services/prompts";
import { HeuristicProvider } from "./heuristic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { AnthropicProvider } from "./anthropic";
import type { PromptedProvider } from "./base";
import type { LLMProvider, ChatMessage, ChatOptions, ChatResult } from "./types";

export * from "./types";

/** USD per 1M tokens [input, output]. Override/extend with LLM_PRICING. */
const DEFAULT_PRICING: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "gpt-5-mini": [0.25, 2],
  "gpt-5": [1.25, 10],
};

export function estimateCost(model: string, input: number, output: number): number {
  const table = { ...DEFAULT_PRICING, ...env.llm.pricing };
  const key = Object.keys(table).find((k) => model === k || model.endsWith(`/${k}`) || model.startsWith(k));
  if (!key) return 0;
  const [pi, po] = table[key];
  return (input * pi + output * po) / 1_000_000;
}

export class BudgetExceededError extends Error {
  constructor(used: number, limit: number) {
    super(`Daily LLM token limit reached (${used}/${limit})`);
  }
}

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function tokensUsedToday(): Promise<{ tokens: number; cost: number; calls: number }> {
  const [row] = await db
    .select({
      tokens: sql<number>`coalesce(sum(${schema.llmRuns.inputTokens} + ${schema.llmRuns.outputTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${schema.llmRuns.estimatedCost}), 0)::float`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.llmRuns)
    .where(and(gte(schema.llmRuns.createdAt, startOfDay()), eq(schema.llmRuns.cached, false)));
  return row ?? { tokens: 0, cost: 0, calls: 0 };
}

async function logRun(provider: string, opts: ChatOptions, r: Partial<ChatResult>, latency: number, error?: string) {
  try {
    await db.insert(schema.llmRuns).values({
      provider,
      model: r.model ?? opts.model,
      task: opts.task,
      promptVersion: opts.promptVersion ?? null,
      inputTokens: r.cached ? 0 : (r.inputTokens ?? 0),
      outputTokens: r.cached ? 0 : (r.outputTokens ?? 0),
      estimatedCost: r.cached ? 0 : estimateCost(r.model ?? opts.model, r.inputTokens ?? 0, r.outputTokens ?? 0),
      latencyMs: latency,
      success: !error,
      cached: !!r.cached,
      error: error?.slice(0, 1000) ?? null,
    });
  } catch (e) {
    logger.error("failed to log llm run", { error: errMsg(e) });
  }
}

/**
 * Wraps a provider's chat() with: response cache → daily budget check → call → fallback model → run logging.
 * Every high-level operation (classify/analyze/summarize/draft) goes through chat(), so all are metered.
 */
function metered(provider: PromptedProvider, fallbackModel: string): LLMProvider {
  const raw = provider.chat.bind(provider);
  provider.chat = async (messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> => {
    const key = sha256(JSON.stringify([provider.name, opts.model, opts.maxTokens, messages]));
    const [hit] = await db.select().from(schema.llmCache).where(eq(schema.llmCache.key, key));
    if (hit) {
      const res = { ...hit.response, model: opts.model, cached: true };
      await logRun(provider.name, opts, res, 0);
      return res;
    }
    const used = await tokensUsedToday();
    if (used.tokens >= env.llm.dailyTokenLimit) throw new BudgetExceededError(used.tokens, env.llm.dailyTokenLimit);

    const attempt = async (model: string) => {
      const t0 = Date.now();
      try {
        const res = await raw(messages, { ...opts, model });
        await logRun(provider.name, { ...opts, model }, res, Date.now() - t0);
        return res;
      } catch (e) {
        await logRun(provider.name, { ...opts, model }, {}, Date.now() - t0, errMsg(e));
        throw e;
      }
    };
    let res: ChatResult;
    try {
      res = await attempt(opts.model);
    } catch (e) {
      if (!fallbackModel || fallbackModel === opts.model) throw e;
      logger.warn("llm call failed, trying fallback model", { model: opts.model, fallbackModel, error: errMsg(e) });
      res = await attempt(fallbackModel);
    }
    await db
      .insert(schema.llmCache)
      .values({ key, response: { text: res.text, inputTokens: res.inputTokens, outputTokens: res.outputTokens } })
      .onConflictDoNothing();
    return res;
  };
  return provider;
}

export interface AIConfig {
  provider: LLMProvider;
  heuristic: HeuristicProvider;
  isHeuristic: boolean;
  cheap: ChatOptions;
  strong: ChatOptions;
}

/** Build the configured provider. Falls back to the heuristic provider when not configured. */
export async function getAI(): Promise<AIConfig> {
  const heuristic = new HeuristicProvider();
  const cfg = env.llm;
  const maxTokens = cfg.maxTokensPerTask;
  const base = { maxTokens, task: "" };
  const apiKey = cfg.provider === "heuristic" ? "" : await getSecret("LLM_API_KEY");
  const cheapModel = cfg.cheapModel || cfg.strongModel;
  const strongModel = cfg.strongModel || cfg.cheapModel;

  let provider: PromptedProvider | null = null;
  if (cfg.provider === "anthropic" && apiKey) {
    provider = new AnthropicProvider(apiKey, cfg.baseUrl.includes("anthropic") ? cfg.baseUrl : undefined);
  } else if (cfg.provider === "openai-compatible" && cfg.baseUrl && (apiKey || /localhost|127\.0\.0\.1|ollama|:11434|:1234/.test(cfg.baseUrl))) {
    provider = new OpenAICompatibleProvider(cfg.baseUrl, apiKey, env.appUrl);
  }
  if (!provider || !cheapModel) {
    return {
      provider: heuristic, heuristic, isHeuristic: true,
      cheap: { ...base, model: "heuristic" }, strong: { ...base, model: "heuristic" },
    };
  }
  provider.resolvePrompt = getActivePrompt;
  return {
    provider: metered(provider, cfg.fallbackModel),
    heuristic,
    isHeuristic: false,
    cheap: { ...base, model: cheapModel },
    strong: { ...base, model: strongModel, maxTokens: Math.round(maxTokens * 1.5) },
  };
}

/** Run an AI operation; on any failure (budget, network, bad JSON) degrade to the heuristic provider. */
export async function withFallback<T>(
  task: string,
  fn: (p: LLMProvider) => Promise<T>,
  ai: AIConfig,
): Promise<{ value: T; by: string; error?: string }> {
  if (ai.isHeuristic) return { value: await fn(ai.heuristic), by: "heuristic" };
  try {
    return { value: await fn(ai.provider), by: ai.provider.name };
  } catch (e) {
    logger.warn("ai operation failed, using heuristic", { task, error: errMsg(e) });
    return { value: await fn(ai.heuristic), by: "heuristic", error: errMsg(e) };
  }
}
