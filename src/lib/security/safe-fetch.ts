import { assertPublicUrl } from "./url";
import { env } from "../env";

const MAX_BYTES = 2 * 1024 * 1024;
const UA = "DailyAI/0.1 (+https://github.com/siwapanD/Daily-AI)";

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  text: string;
}

async function once(input: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  let current = input;
  for (let hop = 0; hop <= 5; hop++) {
    await assertPublicUrl(current, env.allowPrivateFetch);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? env.fetchTimeoutMs);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "*/*", ...opts.headers },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        await res.body?.cancel();
        continue;
      }
      const text = await readLimited(res, opts.maxBytes ?? MAX_BYTES);
      return { url: current, status: res.status, headers: res.headers, text };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Fetch with SSRF protection, manual redirect validation, timeout, size cap and retry on network/5xx errors. */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await once(url, opts);
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.name === "UnsafeUrlError") throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
