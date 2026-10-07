import Anthropic from "@anthropic-ai/sdk";
import { PromptedProvider } from "./base";
import type { ChatMessage, ChatOptions, ChatResult } from "./types";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;
/** Haiku 4.5 has no `effort` parameter and no adaptive thinking. */
const NO_EFFORT = /haiku/;

export class AnthropicProvider extends PromptedProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string, baseURL?: string, private effort: "low" | "medium" | "high" = "low") {
    super();
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}), maxRetries: 2, timeout: 120_000 });
  }

  protected async complete(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const thinking = !NO_EFFORT.test(opts.model);
    // Thinking models spend part of max_tokens on (adaptive) thinking, so give them headroom.
    const maxTokens = thinking ? Math.max(opts.maxTokens * 3, 4000) : opts.maxTokens;

    const msg = await this.client.beta.messages.create({
      model: opts.model,
      max_tokens: maxTokens,
      system,
      messages: turns,
      ...(thinking ? { output_config: { effort: this.effort } } : {}),
      ...(FALLBACK_MODELS.test(opts.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    if (msg.stop_reason === "refusal") throw new Error("Model declined the request (refusal)");
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new Error(`Empty response (stop_reason: ${msg.stop_reason})`);
    return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, model: msg.model };
  }
}
