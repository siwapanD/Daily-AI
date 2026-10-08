import type { Category } from "../constants";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  maxTokens: number;
  task: string;
  promptVersion?: string;
  /** Benchmarks: measure the real call (no response cache, no fallback model). */
  noCache?: boolean;
  noFallback?: boolean;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cached?: boolean;
}

export interface ItemInput {
  title: string;
  content: string;
  url?: string;
  source?: string;
  reliability?: number;
  publishedAt?: Date | null;
  authorityLevel?: string;
  summary?: string | null;
}

export interface ClassifyResult {
  categories: Category[];
  impact: number;
  novelty: number;
  relevance: number;
  experimentValue: number;
  technology: string | null;
}

export interface AnalyzeResult extends ClassifyResult {
  summary: string;
  whyItMatters: string;
  technologyInfo: { name: string; vendor: string | null; category: Category } | null;
  experimentIdea: string | null;
  workflowImprovement: string | null;
  hype: boolean;
}

export interface ExperimentDraft {
  title: string;
  technology: string;
  problem: string;
  hypothesis: string;
  baseline: string;
  newApproach: string;
  setup: string;
  steps: string;
  metrics: string[];
}

/** Provider abstraction: swap OpenAI-compatible / Anthropic / local / heuristic without touching services. */
export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult>;
  summarize(item: ItemInput, opts: ChatOptions): Promise<string>;
  classify(item: ItemInput, opts: ChatOptions): Promise<ClassifyResult>;
  analyze(item: ItemInput, opts: ChatOptions): Promise<AnalyzeResult>;
  draftExperiment(item: ItemInput, opts: ChatOptions): Promise<ExperimentDraft>;
}
