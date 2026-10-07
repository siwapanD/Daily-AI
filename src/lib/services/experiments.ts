import { asc, desc, eq, like } from "drizzle-orm";
import { db, schema } from "../db";
import type { Experiment, ExperimentResult } from "../db/schema";
import { getAI, withFallback } from "../llm";
import { DEFAULT_METRICS, type ExperimentDecision } from "../constants";
import { getArticle } from "./knowledge";
import { upsertRadarItem, ringForDecision } from "./radar";
import { upsertTechnology } from "./technologies";
import { addPlaybookRule } from "./playbook";

export async function nextExperimentCode(year = new Date().getFullYear()): Promise<string> {
  const rows = await db.select({ code: schema.experiments.code }).from(schema.experiments)
    .where(like(schema.experiments.code, `EXP-${year}-%`));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.split("-")[2]) || 0), 0);
  return `EXP-${year}-${String(max + 1).padStart(3, "0")}`;
}

export interface ExperimentInput {
  title: string;
  technology?: string | null;
  problem?: string;
  hypothesis?: string;
  baseline?: string;
  newApproach?: string;
  setup?: string;
  steps?: string;
  metrics?: string[];
  status?: string;
  executionNotes?: string;
  problems?: string;
  conclusion?: string;
  articleId?: number | null;
  knowledgeItemId?: number | null;
}

export async function createExperiment(input: ExperimentInput): Promise<Experiment> {
  const techId = input.technology ? await upsertTechnology(input.technology) : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextExperimentCode();
    const [row] = await db.insert(schema.experiments)
      .values({ ...input, code, technologyId: techId, metrics: input.metrics?.length ? input.metrics : DEFAULT_METRICS })
      .onConflictDoNothing({ target: schema.experiments.code })
      .returning();
    if (row) return row;
  }
  throw new Error("Could not allocate experiment code");
}

/** "Experiment" action on a discovery: AI drafts the experiment design, user edits it afterwards. */
export async function createExperimentFromArticle(articleId: number): Promise<Experiment> {
  const row = await getArticle(articleId);
  if (!row) throw new Error("Article not found");
  const a = row.article;
  const ai = await getAI();
  const { value: d } = await withFallback(
    "experiment",
    (p) => p.draftExperiment(
      { title: a.title, content: a.content ?? a.excerpt ?? "", url: a.url, summary: a.summary },
      { ...ai.strong, task: "experiment" },
    ),
    ai,
  );
  const [k] = await db.select({ id: schema.knowledgeItems.id }).from(schema.knowledgeItems)
    .where(eq(schema.knowledgeItems.articleId, a.id)).limit(1);
  const exp = await createExperiment({ ...d, articleId: a.id, knowledgeItemId: k?.id ?? null });
  await db.update(schema.articles).set({ userAction: "experiment" }).where(eq(schema.articles.id, a.id));
  return exp;
}

export async function getExperiment(id: number) {
  const [e] = await db.select().from(schema.experiments).where(eq(schema.experiments.id, id));
  if (!e) return null;
  const results = await db.select().from(schema.experimentResults)
    .where(eq(schema.experimentResults.experimentId, id)).orderBy(asc(schema.experimentResults.createdAt));
  return { ...e, results };
}

export async function listExperiments() {
  return db.select().from(schema.experiments).orderBy(desc(schema.experiments.createdAt));
}

export async function updateExperiment(id: number, patch: Partial<ExperimentInput>) {
  const techId = patch.technology ? await upsertTechnology(patch.technology) : undefined;
  await db.update(schema.experiments)
    .set({ ...patch, ...(techId ? { technologyId: techId } : {}), updatedAt: new Date() })
    .where(eq(schema.experiments.id, id));
}

export async function deleteExperiment(id: number) {
  await db.delete(schema.experiments).where(eq(schema.experiments.id, id));
}

export type ResultInput = Omit<typeof schema.experimentResults.$inferInsert, "id" | "createdAt">;

export async function addResult(input: ResultInput) {
  const [r] = await db.insert(schema.experimentResults).values(input).returning();
  await db.update(schema.experiments).set({ status: "running", updatedAt: new Date() })
    .where(eq(schema.experiments.id, input.experimentId));
  return r;
}

export async function deleteResult(id: number) {
  await db.delete(schema.experimentResults).where(eq(schema.experimentResults.id, id));
}

export const RESULT_METRICS = [
  { key: "timeMinutes", label: "Time (min)", better: "lower" },
  { key: "tokens", label: "Tokens", better: "lower" },
  { key: "costUsd", label: "Cost ($)", better: "lower" },
  { key: "quality", label: "Quality (0-10)", better: "higher" },
  { key: "accuracy", label: "Accuracy (%)", better: "higher" },
  { key: "testPassRate", label: "Test pass (%)", better: "higher" },
  { key: "humanInterventions", label: "Human interventions", better: "lower" },
  { key: "retries", label: "Retries", better: "lower" },
] as const;

/** Benchmark comparison: mean per variant and delta of each variant vs the "baseline" variant. */
export function compareResults(results: ExperimentResult[]) {
  const variants = [...new Set(results.map((r) => r.variant))];
  const mean = (variant: string, key: (typeof RESULT_METRICS)[number]["key"]) => {
    const vals = results.filter((r) => r.variant === variant).map((r) => r[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const baseline = variants.find((v) => v.toLowerCase() === "baseline") ?? variants[0];
  return RESULT_METRICS.map((m) => {
    const values = Object.fromEntries(variants.map((v) => [v, mean(v, m.key)]));
    const base = baseline ? values[baseline] : null;
    const deltas = Object.fromEntries(
      variants.map((v) => {
        const val = values[v];
        if (v === baseline || base == null || val == null || base === 0) return [v, null];
        const pct = ((val - base) / Math.abs(base)) * 100;
        return [v, { pct, better: m.better === "lower" ? pct < 0 : pct > 0 }];
      }),
    );
    return { ...m, values, deltas };
  }).filter((row) => Object.values(row.values).some((v) => v != null));
}

const KNOWLEDGE_STATUS: Record<ExperimentDecision, string> = {
  ADOPT: "ADOPTED", WATCH: "WATCHING", REJECT: "REJECTED", RETEST: "TESTING",
};

/**
 * Decide an experiment. Side effects: radar ring for its technology, linked knowledge status,
 * and (ADOPT + playbookRule) a new playbook version.
 */
export async function decideExperiment(id: number, decision: ExperimentDecision, conclusion: string, playbookRule?: string) {
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  await db.update(schema.experiments).set({
    decision, conclusion, status: decision === "RETEST" ? "planned" : "completed",
    decidedAt: new Date(), updatedAt: new Date(),
  }).where(eq(schema.experiments.id, id));

  if (exp.technology) {
    await upsertRadarItem({
      name: exp.technology, ring: ringForDecision(decision), quadrant: "Tools",
      rationale: `${exp.code}: ${conclusion || decision}`.slice(0, 500), technologyId: exp.technologyId, experimentId: id,
    });
  }
  if (exp.knowledgeItemId) {
    await db.update(schema.knowledgeItems).set({ status: KNOWLEDGE_STATUS[decision], updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, exp.knowledgeItemId));
  }
  let playbookVersion: string | null = null;
  if (decision === "ADOPT" && playbookRule?.trim()) {
    const p = await addPlaybookRule(playbookRule, `${exp.code}: ${exp.title}`, id);
    playbookVersion = p.version;
  }
  return { playbookVersion };
}

export function experimentToMarkdown(e: Experiment & { results: ExperimentResult[] }): string {
  const cmp = compareResults(e.results);
  const variants = [...new Set(e.results.map((r) => r.variant))];
  const table = cmp.length
    ? [
        `| Metric | ${variants.join(" | ")} |`,
        `|---|${variants.map(() => "---").join("|")}|`,
        ...cmp.map((m) => `| ${m.label} | ${variants.map((v) => {
          const val = m.values[v];
          const d = m.deltas[v];
          return val == null ? "—" : `${+val.toFixed(2)}${d ? ` (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(0)}%)` : ""}`;
        }).join(" | ")} |`),
      ].join("\n")
    : "_No results recorded._";
  const sec = (h: string, v: string | null | undefined) => `## ${h}\n\n${v?.trim() || "_—_"}\n`;
  return [
    `# ${e.code} — ${e.title}`,
    "",
    `- **Technology:** ${e.technology ?? "—"}`,
    `- **Status:** ${e.status}`,
    `- **Decision:** ${e.decision ?? "pending"}`,
    `- **Metrics:** ${e.metrics.join(", ")}`,
    "",
    sec("Problem", e.problem), sec("Hypothesis", e.hypothesis), sec("Baseline", e.baseline),
    sec("New Approach", e.newApproach), sec("Setup", e.setup), sec("Steps", e.steps),
    `## Results\n\n${table}\n`,
    sec("Execution Notes", e.executionNotes), sec("Problems", e.problems), sec("Conclusion", e.conclusion),
  ].join("\n");
}
