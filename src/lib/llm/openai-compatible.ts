import { PromptedProvider } from "./base";
import type { ChatMessage, ChatOptions, ChatResult } from "./types";

/** OpenAI Chat Completions-compatible endpoints: OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio, vLLM. */
export class OpenAICompatibleProvider extends PromptedProvider {
  readonly name = "openai-compatible";
  constructor(private baseUrl: string, private apiKey: string, private appUrl = "") {
    super();
  }

  protected async complete(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          // OpenRouter attribution headers (ignored by other providers).
          "HTTP-Referer": this.appUrl,
          "X-Title": "DAILY AI",
        },
        body: JSON.stringify({ model: opts.model, messages, max_tokens: opts.maxTokens, temperature: 0.2 }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 300)}`);
      const json = JSON.parse(body) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("LLM returned empty content");
      return {
        text,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        model: json.model ?? opts.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
