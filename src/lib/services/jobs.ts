import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { logger, errMsg } from "../logger";
import { fetchAllSources } from "./discovery";
import { runAnalysis } from "./analysis";
import { generateDigest } from "./digest";

const running = new Set<string>();

/** Run a job with history recording and a per-job concurrency guard. */
export async function runJob<T extends Record<string, unknown>>(job: string, fn: () => Promise<T>): Promise<T> {
  if (running.has(job)) throw new Error(`Job ${job} is already running`);
  const recent = await db.select({ id: schema.jobRuns.id }).from(schema.jobRuns)
    .where(and(eq(schema.jobRuns.job, job), eq(schema.jobRuns.status, "running"), gte(schema.jobRuns.startedAt, new Date(Date.now() - 30 * 60000))));
  if (recent.length) throw new Error(`Job ${job} is already running`);
  running.add(job);
  const [run] = await db.insert(schema.jobRuns).values({ job }).returning();
  logger.info("job started", { job, runId: run.id });
  try {
    const stats = await fn();
    await db.update(schema.jobRuns).set({ status: "ok", finishedAt: new Date(), stats }).where(eq(schema.jobRuns.id, run.id));
    logger.info("job finished", { job, runId: run.id, stats });
    return stats;
  } catch (e) {
    await db.update(schema.jobRuns).set({ status: "error", finishedAt: new Date(), error: errMsg(e) }).where(eq(schema.jobRuns.id, run.id));
    logger.error("job failed", { job, runId: run.id, error: errMsg(e) });
    throw e;
  } finally {
    running.delete(job);
  }
}

export async function fetchJob() {
  return runJob("fetch", async () => {
    const results = await fetchAllSources();
    return {
      sources: results.length,
      failed: results.filter((r) => !r.ok).length,
      found: results.reduce((s, r) => s + r.found, 0),
      inserted: results.reduce((s, r) => s + r.inserted, 0),
      errors: results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`),
    };
  });
}

export const analyzeJob = () => runJob("analyze", runAnalysis);

export const digestJob = () =>
  runJob("digest", async () => {
    const d = await generateDigest();
    return { digestDate: d.digestDate, generatedBy: d.generatedBy };
  });

/** Daily: fetch → dedupe → classify → score → analyze top → technologies → digest. Each step isolated. */
export async function dailyJob() {
  return runJob("daily", async () => {
    const out: Record<string, unknown> = {};
    for (const [name, step] of [["fetch", fetchJob], ["analyze", analyzeJob], ["digest", digestJob]] as const) {
      try {
        out[name] = await step();
      } catch (e) {
        out[name] = { error: errMsg(e) };
      }
    }
    return out;
  });
}

export async function recentJobs(limit = 20) {
  return db.select().from(schema.jobRuns).orderBy(desc(schema.jobRuns.startedAt)).limit(limit);
}
