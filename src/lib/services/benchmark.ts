import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { getAI, estimateCost, type AIConfig, type LLMProvider } from "../llm";
import { errMsg } from "../logger";
import { UserError } from "../errors";
import { truncate } from "../pipeline/normalize";
import { addResult, getExperiment } from "./experiments";

/**
 * Automated benchmark runner: every variant (model + optional system prompt) answers every case.
 * Answers are scored automatically, and one experiment_results row is written per variant
 * (time, tokens, cost, accuracy, failures), so the normal comparison table and decision flow apply.
 */
export const benchmarkConfigSchema = z.object({
  variants: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(120),
    system: z.string().max(10000).optional(),
  })).min(1).max(6),
  cases: z.array(z.object({
    name: z.string().max(120).optional(),
    input: z.string().min(1).max(20000),
    expected: z.string().max(5000).optional(),
    match: z.enum(["contains", "exact", "regex", "judge"]).default("contains"),
  })).min(1).max(30),
  maxTokens: z.number().int().min(16).max(8000).default(800),
}).refine((c) => c.variants.length * c.cases.length <= 120, { message: "At most 120 calls per run (variants × cases)" })
  .refine((c) => new Set(c.variants.map((v) => v.label)).size === c.variants.length, { message: "Variant labels must be unique" })
  .refine((c) => c.cases.every((k) => k.expected || k.match === "judge"), { message: "Every case needs `expected` (judge cases may describe the expectation instead)" });

export type BenchmarkConfig = z.infer<typeof benchmarkConfigSchema>;
type Case = BenchmarkConfig["cases"][number];

export function exampleBenchmark(cheap: string, strong: string): BenchmarkConfig {
  return {
    variants: [
      { label: "baseline", model: cheap || "your-cheap-model" },
      { label: "new", model: strong || "your-strong-model", system: "Think step by step, then answer concisely." },
    ],
    cases: [
      { name: "regex", input: "Write a JavaScript regex that matches a 4-digit year. Reply with the regex only.", expected: "\\d{4}", match: "contains" },
      { name: "sql", input: "In PostgreSQL, which keyword returns rows inserted by an INSERT? Reply with one word.", expected: "RETURNING", match: "contains" },
      { name: "review", input: "Find the bug: `for (let i = 0; i <= arr.length; i++) sum += arr[i];`", expected: "Identifies the off-by-one error (<= should be <).", match: "judge" },
    ],
    maxTokens: 800,
  };
}

/** Deterministic scoring for contains / exact / regex. */
export function scoreAnswer(answer: string, c: Pick<Case, "expected" | "match">): boolean {
  const a = answer.trim();
  const e = (c.expected ?? "").trim();
  if (c.match === "exact") return a.replace(/^["'`]+|["'`.]+$/g, "").toLowerCase() === e.toLowerCase();
  if (c.match === "regex") {
    try {
      return new RegExp(e, "i").test(a);
    } catch {
      return false;
    }
  }
  return a.toLowerCase().includes(e.toLowerCase());
}

async function judge(provider: LLMProvider, ai: AIConfig, c: Case, answer: string): Promise<boolean> {
  const res = await provider.chat([
    { role: "system", content: "You grade answers. Reply with exactly PASS or FAIL." },
    { role: "user", content: `Task:\n${c.input}\n\nExpectation:\n${c.expected ?? "A correct, complete answer."}\n\nAnswer to grade:\n${truncate(answer, 6000)}\n\nDoes the answer meet the expectation? Reply PASS or FAIL.` },
  ], { ...ai.strong, maxTokens: 10, task: "benchmark-judge", noCache: true, noFallback: true });
  return /\bPASS\b/i.test(res.text) && !/\bFAIL\b/i.test(res.text);
}

export interface CaseResult {
  variant: string;
  case: string;
  passed: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
  answer: string;
}

export async function saveBenchmarkConfig(experimentId: number, config: unknown) {
  const parsed = benchmarkConfigSchema.parse(config);
  await db.update(schema.experiments).set({ benchmark: parsed, updatedAt: new Date() }).where(eq(schema.experiments.id, experimentId));
  return parsed;
}

export async function runBenchmark(experimentId: number) {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new UserError("Experiment not found");
  if (!exp.benchmark) throw new UserError("No benchmark configured for this experiment");
  const config = benchmarkConfigSchema.parse(exp.benchmark);
  const ai = await getAI();
  if (ai.isHeuristic) throw new UserError("Automated benchmarks need an LLM provider (set LLM_PROVIDER and LLM_API_KEY)");

  const results: CaseResult[] = [];
  for (const v of config.variants) {
    for (const [i, c] of config.cases.entries()) {
      const name = c.name ?? `case ${i + 1}`;
      const t0 = Date.now();
      try {
        const res = await ai.provider.chat(
          [...(v.system ? [{ role: "system" as const, content: v.system }] : []), { role: "user" as const, content: c.input }],
          { model: v.model, maxTokens: config.maxTokens, task: "benchmark", promptVersion: `benchmark:${exp.code}:${v.label}`, noCache: true, noFallback: true },
        );
        const latencyMs = Date.now() - t0;
        const passed = c.match === "judge" ? await judge(ai.provider, ai, c, res.text) : scoreAnswer(res.text, c);
        results.push({ variant: v.label, case: name, passed, latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens, answer: res.text });
      } catch (e) {
        results.push({ variant: v.label, case: name, passed: false, latencyMs: Date.now() - t0, inputTokens: 0, outputTokens: 0, error: errMsg(e).slice(0, 200), answer: "" });
      }
    }
  }

  const runAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const summary = [];
  for (const v of config.variants) {
    const rs = results.filter((r) => r.variant === v.label);
    const passed = rs.filter((r) => r.passed).length;
    const input = rs.reduce((s, r) => s + r.inputTokens, 0);
    const output = rs.reduce((s, r) => s + r.outputTokens, 0);
    const tokens = input + output;
    const latency = rs.reduce((s, r) => s + r.latencyMs, 0);
    const cost = estimateCost(v.model, input, output);
    const errors = rs.filter((r) => r.error).length;
    await addResult({
      experimentId, variant: v.label, timeMinutes: +(latency / 60000).toFixed(3), tokens, costUsd: +cost.toFixed(5),
      accuracy: +((passed / rs.length) * 100).toFixed(1), retries: errors,
      notes: `auto benchmark ${runAt}: ${passed}/${rs.length} passed · ${v.model}`,
      extra: { cases: rs.length, passed, avgLatencyMs: Math.round(latency / rs.length) },
    });
    summary.push({ variant: v.label, model: v.model, passed, total: rs.length, tokens, latencyMs: latency, errors });
  }

  const table = [
    `### Automated benchmark — ${runAt} UTC`,
    "",
    `| Case | ${config.variants.map((v) => `${v.label} (${v.model})`).join(" | ")} |`,
    `|---|${config.variants.map(() => "---").join("|")}|`,
    ...config.cases.map((c, i) => {
      const name = c.name ?? `case ${i + 1}`;
      return `| ${name} | ${config.variants.map((v) => {
        const r = results.find((x) => x.variant === v.label && x.case === name)!;
        return r.error ? `⚠️ error` : `${r.passed ? "✅" : "❌"} ${r.latencyMs} ms`;
      }).join(" | ")} |`;
    }),
    "",
  ].join("\n");
  await db.update(schema.experiments)
    .set({ executionNotes: `${exp.executionNotes ? `${exp.executionNotes.trimEnd()}\n\n` : ""}${table}`, updatedAt: new Date() })
    .where(eq(schema.experiments.id, experimentId));

  return { summary, results };
}
