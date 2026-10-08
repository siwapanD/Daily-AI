import { createHash } from "node:crypto";

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  tokens: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

export function l2normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the this to was we will with you your new how what why".split(" "));
const DIMS = 512;

function features(text: string): string[] {
  const t = text.toLowerCase().normalize("NFKC");
  const out: string[] = [];
  // Latin/number words: unigrams + bigrams.
  const words = (t.match(/[a-z0-9][a-z0-9.+#-]*[a-z0-9+#]|[a-z0-9]/g) ?? []).filter((w) => !STOP.has(w));
  words.forEach((w, i) => {
    out.push(w);
    if (i > 0) out.push(`${words[i - 1]}_${w}`);
  });
  // Scripts without spaces (Thai, CJK…): character trigrams.
  for (const run of t.match(/[฀-๿぀-ヿ一-鿿]+/g) ?? []) {
    for (let i = 0; i + 3 <= run.length; i++) out.push(run.slice(i, i + 3));
  }
  return out;
}

/**
 * Offline lexical embedding (signed feature hashing, sublinear TF). Not as smart as a model,
 * but finds items sharing vocabulary/phrases and needs no API key. Deterministic.
 */
export class LocalHashEmbedding implements EmbeddingProvider {
  readonly name = "local";
  readonly model = `local-hash-${DIMS}`;
  async embed(texts: string[]): Promise<EmbeddingResult> {
    const vectors = texts.map((text) => {
      const counts = new Map<string, number>();
      for (const f of features(text)) counts.set(f, (counts.get(f) ?? 0) + 1);
      const v = new Array<number>(DIMS).fill(0);
      for (const [f, c] of counts) {
        const h = createHash("md5").update(f).digest();
        const idx = h.readUInt32LE(0) % DIMS;
        const sign = h[4] & 1 ? 1 : -1;
        v[idx] += sign * (1 + Math.log(c)) * (f.includes("_") ? 1.5 : 1);
      }
      return l2normalize(v);
    });
    return { vectors, model: this.model, tokens: 0 };
  }
}

/** OpenAI-compatible POST /embeddings (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio, vLLM). */
export class OpenAICompatibleEmbedding implements EmbeddingProvider {
  readonly name = "openai-compatible";
  constructor(private baseUrl: string, private apiKey: string, readonly model: string) {}

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: texts }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
      const json = JSON.parse(body) as { data?: { index?: number; embedding: number[] }[]; usage?: { prompt_tokens?: number; total_tokens?: number } };
      const data = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (data.length !== texts.length) throw new Error(`Embeddings returned ${data.length} vectors for ${texts.length} inputs`);
      return {
        vectors: data.map((d) => l2normalize(d.embedding)),
        model: this.model,
        tokens: json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
