function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
}

/** Read env lazily so tests and scripts can override process.env. */
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://dailyai:dailyai@localhost:5432/dailyai";
  },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get appPassword() { return process.env.APP_PASSWORD ?? ""; },
  get cronSecret() { return process.env.CRON_SECRET ?? ""; },
  get secretKey() { return process.env.APP_SECRET_KEY ?? ""; },
  get autoMigrate() { return process.env.AUTO_MIGRATE !== "false"; },
  get allowPrivateFetch() { return process.env.ALLOW_PRIVATE_FETCH === "true"; },
  get fetchTimeoutMs() { return num("FETCH_TIMEOUT_MS", 15000); },
  get githubToken() { return process.env.GITHUB_TOKEN ?? ""; },
  embeddings: {
    /** "local" (no API, feature hashing) or "openai-compatible" (/embeddings endpoint). */
    get provider() {
      const p = process.env.EMBEDDING_PROVIDER;
      if (p === "local" || p === "openai-compatible") return p;
      return process.env.EMBEDDING_MODEL ? "openai-compatible" : "local";
    },
    get baseUrl() { return process.env.EMBEDDING_BASE_URL || process.env.LLM_BASE_URL || ""; },
    get model() { return process.env.EMBEDDING_MODEL ?? ""; },
    get apiKey() { return process.env.EMBEDDING_API_KEY ?? ""; },
  },
  llm: {
    get provider() { return (process.env.LLM_PROVIDER ?? "heuristic") as "heuristic" | "openai-compatible" | "anthropic"; },
    get baseUrl() { return process.env.LLM_BASE_URL ?? ""; },
    get apiKey() { return process.env.LLM_API_KEY ?? ""; },
    get cheapModel() { return process.env.LLM_CHEAP_MODEL ?? ""; },
    get strongModel() { return process.env.LLM_STRONG_MODEL ?? ""; },
    get fallbackModel() { return process.env.LLM_FALLBACK_MODEL ?? ""; },
    get dailyTokenLimit() { return num("LLM_DAILY_TOKEN_LIMIT", 300000); },
    get maxTokensPerTask() { return num("LLM_MAX_TOKENS_PER_TASK", 1200); },
    get analyzeThreshold() { return num("LLM_ANALYZE_THRESHOLD", 55); },
    get maxStrongPerRun() { return num("LLM_MAX_STRONG_PER_RUN", 15); },
    get pricing(): Record<string, [number, number]> {
      try { return process.env.LLM_PRICING ? JSON.parse(process.env.LLM_PRICING) : {}; } catch { return {}; }
    },
  },
};
