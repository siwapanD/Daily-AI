import type { Category } from "../constants";

/** Keyword rules for heuristic multi-label classification. Word boundaries are applied. */
const RULES: Record<Exclude<Category, "OTHER">, RegExp> = {
  MODEL: /\b(gpt-?\d|o\d|claude|opus|sonnet|haiku|gemini|llama|mistral|deepseek|qwen|kimi|glm|grok|model card|new model|reasoning model|context window|tokens? per|benchmark|weights|open[- ]weights?|llm|fine-?tun\w*)\b/i,
  CODING: /\b(claude code|codex|copilot|cursor|windsurf|aider|cline|roo code|opencode|gemini cli|coding agent|code review|refactor\w*|debug\w*|ide|vs ?code|pair programm\w*|code generation|swe-bench|repository|pull request)\b/i,
  AGENT: /\b(agents?|agentic|multi-agent|subagents?|a2a|computer use|browser agent|tool (use|calling)|function calling|autonomous|orchestrat\w*|memory)\b/i,
  PROMPT: /\b(prompt\w*|system prompt|few-shot|chain[- ]of[- ]thought|instructions?)\b/i,
  CONTEXT: /\b(context engineering|context window|context management|agents\.md|claude\.md|long context|compaction|prompt cach\w*|retrieval)\b/i,
  MCP: /\b(mcp|model context protocol)\b/i,
  DEVOPS: /\b(docker|kubernetes|k8s|github actions|ci\/cd|ci|pipeline|terraform|infrastructure as code|helm|devops)\b/i,
  DATABASE: /\b(postgres\w*|mysql|sqlite|database|sql|pgvector|redis|mongodb|supabase)\b/i,
  SECURITY: /\b(security|vulnerabilit\w*|cve-\d+|prompt injection|jailbreak|exploit|sandbox\w*|secrets?|auth(entication|orization|n|z)?|oauth|supply chain)\b/i,
  TESTING: /\b(test\w*|unit tests?|e2e|playwright|evals?|evaluation|qa)\b/i,
  DEPLOYMENT: /\b(deploy\w*|release[sd]?|rollout|rollback|serverless|vercel|cloudflare)\b/i,
  PRODUCTION: /\b(production|incident|outage|scal\w+|latency|reliability|sla|postmortem)\b/i,
  RAG: /\b(rag|retrieval[- ]augmented|embeddings?|vector (db|database|search)|semantic search|rerank\w*)\b/i,
  AI_GATEWAY: /\b(ai gateway|llm router|openrouter|litellm|semantic cache|model routing|fallback|rate limits?|pricing|token optimi[sz]ation|cost)\b/i,
  OBSERVABILITY: /\b(observability|opentelemetry|otel|prometheus|grafana|tracing|logging|monitoring|langfuse|langsmith)\b/i,
};

/** Categories that matter most for AI-assisted software engineering. */
const CORE = new Set<Category>(["CODING", "AGENT", "MCP", "CONTEXT", "PROMPT", "MODEL"]);
const EXPERIMENTABLE = new Set<Category>(["CODING", "AGENT", "MCP", "CONTEXT", "PROMPT", "TESTING", "AI_GATEWAY", "RAG"]);

export function classifyText(title: string, content = ""): Category[] {
  const text = `${title}\n${content.slice(0, 3000)}`;
  const titleHits = (Object.keys(RULES) as Exclude<Category, "OTHER">[]).filter((c) => RULES[c].test(title));
  const bodyHits = (Object.keys(RULES) as Exclude<Category, "OTHER">[]).filter(
    (c) => !titleHits.includes(c) && (text.match(new RegExp(RULES[c].source, "gi"))?.length ?? 0) >= 2,
  );
  const cats = [...titleHits, ...bodyHits].slice(0, 5);
  return cats.length ? cats : ["OTHER"];
}

export interface HeuristicScores {
  impact: number;
  novelty: number;
  relevance: number;
  experimentValue: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function heuristicScores(
  input: { title: string; content?: string; publishedAt?: Date | null; categories: Category[]; authorityLevel?: string },
  now = new Date(),
): HeuristicScores {
  const t = input.title.toLowerCase();
  const body = (input.content ?? "").toLowerCase().slice(0, 4000);
  const cats = input.categories;
  const core = cats.filter((c) => CORE.has(c)).length;

  let impact = 35 + core * 8;
  if (/\b(introduc\w*|launch\w*|announc\w*|now available|general availability|\bga\b|release[sd]?|v\d+\.0(\.0)?\b)/.test(t)) impact += 15;
  if (/\b(breaking|deprecat\w*|security|cve-|price|pricing)\b/.test(t)) impact += 10;
  if (input.authorityLevel === "official") impact += 10;
  if (/\b(rc|beta|alpha|nightly|patch|fix(es)?|typo)\b/.test(t) || /v\d+\.\d+\.[1-9]\d*\b/.test(t)) impact -= 10;

  const ageDays = input.publishedAt ? (now.getTime() - input.publishedAt.getTime()) / 86400000 : 1;
  let novelty = ageDays <= 1 ? 85 : ageDays <= 3 ? 70 : ageDays <= 7 ? 55 : ageDays <= 30 ? 35 : 15;
  if (/\b(new|first|introduc\w*|launch\w*|preview|experimental)\b/.test(t)) novelty += 10;

  const relevance = cats.includes("OTHER") ? 20 : Math.min(100, 40 + core * 15 + (cats.length - core) * 7);

  let experimentValue = 20 + cats.filter((c) => EXPERIMENTABLE.has(c)).length * 15;
  if (/\b(how to|guide|tutorial|workflow|best practices?|pattern|technique|cookbook|example)\b/.test(t + " " + body.slice(0, 500))) experimentValue += 15;
  if (/\b(cli|sdk|api|open[- ]source|github)\b/.test(t)) experimentValue += 10;

  return { impact: clamp(impact), novelty: clamp(novelty), relevance: clamp(relevance), experimentValue: clamp(experimentValue) };
}
