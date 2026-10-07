import { z } from "zod";
import { CATEGORIES, type Category } from "../constants";

/** Extract the first JSON object from model output (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const src = fenced ?? text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(src.slice(start, end + 1));
}

const score = z.coerce.number().catch(50).transform((n) => Math.max(0, Math.min(100, Math.round(n))));

export const categoriesSchema = z
  .array(z.string())
  .catch([])
  .transform((arr) => {
    const valid = arr.map((c) => c.toUpperCase().replace(/[\s-]+/g, "_")).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
    return valid.length ? [...new Set(valid)].slice(0, 5) : (["OTHER"] as Category[]);
  });

export const classifySchema = z.object({
  categories: categoriesSchema,
  impact: score,
  novelty: score,
  relevance: score,
  experimentValue: score,
  technology: z.string().nullish().catch(null).transform((v) => v || null),
});

export const analyzeSchema = classifySchema.extend({
  summary: z.string().catch(""),
  whyItMatters: z.string().catch(""),
  technology: z
    .object({ name: z.string(), vendor: z.string().nullish(), category: z.string().nullish() })
    .nullish()
    .catch(null),
  experimentIdea: z.string().nullish().catch(null),
  workflowImprovement: z.string().nullish().catch(null),
  hype: z.coerce.boolean().catch(false),
});

export const experimentSchema = z.object({
  title: z.string().min(1),
  technology: z.string().catch(""),
  problem: z.string().catch(""),
  hypothesis: z.string().catch(""),
  baseline: z.string().catch(""),
  newApproach: z.string().catch(""),
  setup: z.string().catch(""),
  steps: z.union([z.string(), z.array(z.string()).transform((a) => a.map((s, i) => `${i + 1}. ${s}`).join("\n"))]).catch(""),
  metrics: z.array(z.string()).catch([]),
});
