import { renderPrompt, type ResolvedPrompt } from "../prompts";
import { CATEGORIES, type Category } from "../constants";
import { truncate } from "../pipeline/normalize";
import { extractJson, classifySchema, analyzeSchema, experimentSchema } from "./json";
import type {
  LLMProvider, ChatMessage, ChatOptions, ChatResult, ItemInput, ClassifyResult, AnalyzeResult, ExperimentDraft,
} from "./types";

function vars(item: ItemInput, contentLimit: number) {
  return {
    title: item.title,
    source: item.source ?? "unknown",
    reliability: item.reliability ?? 50,
    published: item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : "unknown",
    url: item.url ?? "",
    summary: item.summary ?? "",
    content: truncate(item.content || "(no content)", contentLimit),
  };
}

/** Implements the high-level operations on top of `complete()` using the versioned prompt registry. */
export abstract class PromptedProvider implements LLMProvider {
  abstract readonly name: string;
  protected abstract complete(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult>;

  /** Resolves the active prompt version (DB-backed in the app; code defaults when null). */
  resolvePrompt: (key: string) => Promise<ResolvedPrompt | null> = async () => null;

  /** Overridden by the gateway wrapper for metering; adapters implement `complete`. */
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    return this.complete(messages, opts);
  }

  private async run(key: string, item: ItemInput, opts: ChatOptions, contentLimit: number) {
    const p = renderPrompt(key, vars(item, contentLimit), await this.resolvePrompt(key));
    return this.chat(
      [{ role: "system", content: p.system }, { role: "user", content: p.user }],
      { ...opts, promptVersion: p.version },
    );
  }

  async summarize(item: ItemInput, opts: ChatOptions): Promise<string> {
    const res = await this.run("knowledge-summary", item, opts, 8000);
    return res.text.trim();
  }

  async classify(item: ItemInput, opts: ChatOptions): Promise<ClassifyResult> {
    const res = await this.run("importance-classifier", item, opts, 1500);
    return classifySchema.parse(extractJson(res.text));
  }

  async analyze(item: ItemInput, opts: ChatOptions): Promise<AnalyzeResult> {
    const res = await this.run("daily-analysis", item, opts, 6000);
    const a = analyzeSchema.parse(extractJson(res.text));
    const t = a.technology;
    const cat = (t?.category ?? "").toUpperCase();
    return {
      ...a,
      technology: t?.name ?? null,
      technologyInfo: t?.name
        ? { name: t.name, vendor: t.vendor ?? null, category: ((CATEGORIES as readonly string[]).includes(cat) ? cat : "OTHER") as Category }
        : null,
      experimentIdea: a.experimentIdea ?? null,
      workflowImprovement: a.workflowImprovement ?? null,
    };
  }

  async draftExperiment(item: ItemInput, opts: ChatOptions): Promise<ExperimentDraft> {
    const res = await this.run("experiment-generator", item, opts, 4000);
    return experimentSchema.parse(extractJson(res.text));
  }
}
