"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import {
  AUTHORITY_LEVELS, EXPERIMENT_DECISIONS, EXPERIMENT_STATUSES, KNOWLEDGE_AREAS, KNOWLEDGE_STATUSES,
  RADAR_QUADRANTS, RADAR_RINGS, SOURCE_TYPES, USER_ACTIONS, WATCH_KINDS,
} from "@/lib/constants";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { errMsg } from "@/lib/logger";
import { createSource, updateSource, deleteSource, addManualUrl, fetchSource, getSource } from "@/lib/services/discovery";
import { analyzeOne } from "@/lib/services/analysis";
import { setUserAction } from "@/lib/services/discoveries";
import { fetchJob, analyzeJob, digestJob, notifyJob, dailyJob } from "@/lib/services/jobs";
import { sendNotification } from "@/lib/services/notify";
import { learnArticle, createKnowledge, updateKnowledge, deleteKnowledge } from "@/lib/services/knowledge";
import {
  createExperiment, createExperimentFromArticle, updateExperiment, deleteExperiment, addResult, deleteResult, decideExperiment,
} from "@/lib/services/experiments";
import { upsertRadarItem, deleteRadarItem } from "@/lib/services/radar";
import { addWatchItem, updateWatchItem, deleteWatchItem } from "@/lib/services/watch";
import { setSecret, SECRET_KEYS } from "@/lib/services/settings";
import { addPlaybookRule } from "@/lib/services/playbook";
import { activatePromptVersion, createPromptVersion } from "@/lib/services/prompts";
import { getArticle } from "@/lib/services/knowledge";

// ---------- helpers ----------

function safeBack(fd: FormData, fallback: string): string {
  const b = String(fd.get("back") ?? "");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const sp = new URLSearchParams(query);
  sp.delete("msg");
  sp.delete("err");
  sp.set(key, value.slice(0, 300));
  return `${base}?${sp}`;
}

async function limit(bucket: string, max = 20) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  enforceRateLimit(`${bucket}:${ip}`, max, 60_000);
}

/** Run a mutation, then redirect back with a flash message (redirect must happen outside try/catch). */
async function run(back: string, fn: () => Promise<string | void>, revalidate: string[] = ["/"]): Promise<never> {
  let target: string;
  try {
    const msg = await fn();
    for (const p of revalidate) revalidatePath(p);
    target = msg ? withParam(back, "msg", msg) : back;
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : errMsg(e);
    target = withParam(back, "err", message);
  }
  redirect(target);
}

const str = (max = 5000) => z.string().trim().max(max);
const optStr = (max = 5000) => z.string().trim().max(max).optional().default("");
const id = z.coerce.number().int().positive();
const optNum = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().finite().nullable());
const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().nullable());
const form = (fd: FormData) => Object.fromEntries(fd.entries());
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

// ---------- jobs (manual triggers) ----------

export async function fetchNowAction(fd: FormData) {
  await run(safeBack(fd, "/"), async () => {
    await limit("job", 6);
    const r = await fetchJob();
    return `Fetched ${r.sources} sources: ${r.inserted} new items${r.failed ? `, ${r.failed} sources failed (see Settings)` : ""}.`;
  });
}

export async function analyzeNowAction(fd: FormData) {
  await run(safeBack(fd, "/"), async () => {
    await limit("job", 6);
    const r = await analyzeJob();
    return `Analysis (${r.provider}): ${r.classified} classified, ${r.analyzed} analyzed${r.failed ? `, ${r.failed} failed` : ""}.`;
  });
}

export async function digestNowAction(fd: FormData) {
  await run(safeBack(fd, "/digest"), async () => {
    await limit("job", 6);
    const r = await digestJob();
    return `Digest generated for ${r.digestDate}.`;
  }, ["/", "/digest"]);
}

export async function dailyNowAction(fd: FormData) {
  await run(safeBack(fd, "/"), async () => {
    await limit("job", 3);
    await dailyJob();
    return "Daily job finished.";
  }, ["/", "/digest", "/discover"]);
}

// ---------- sources ----------

const sourceSchema = z.object({
  name: str(200).min(1),
  type: z.enum(SOURCE_TYPES),
  url: str(2048).min(1),
  tier: z.coerce.number().int().min(1).max(3),
  authorityLevel: z.enum(AUTHORITY_LEVELS),
  reliabilityScore: z.coerce.number().int().min(0).max(100),
});

export async function createSourceAction(fd: FormData) {
  await run("/settings", async () => {
    const s = await createSource(sourceSchema.parse(form(fd)));
    return `Source "${s.name}" added.`;
  }, ["/settings"]);
}

export async function updateSourceAction(fd: FormData) {
  await run("/settings", async () => {
    const data = z.object({
      id, reliabilityScore: z.coerce.number().int().min(0).max(100), tier: z.coerce.number().int().min(1).max(3),
      enabled: z.string().optional(),
    }).parse(form(fd));
    await updateSource(data.id, { reliabilityScore: data.reliabilityScore, tier: data.tier, enabled: data.enabled === "on" });
    return "Source updated.";
  }, ["/settings"]);
}

export async function deleteSourceAction(fd: FormData) {
  await run("/settings", async () => {
    await deleteSource(id.parse(fd.get("id")));
    return "Source deleted.";
  }, ["/settings"]);
}

export async function fetchSourceAction(fd: FormData) {
  await run("/settings", async () => {
    await limit("job", 10);
    const s = await getSource(id.parse(fd.get("id")));
    if (!s) throw new Error("Source not found");
    const r = await fetchSource(s);
    return r.ok ? `${s.name}: ${r.found} found, ${r.inserted} new.` : `${s.name} failed: ${r.error}`;
  }, ["/settings"]);
}

export async function addManualUrlAction(fd: FormData) {
  let target = safeBack(fd, "/discover");
  try {
    await limit("manual", 10);
    const url = str(2048).min(1).parse(fd.get("url"));
    const r = await addManualUrl(url);
    await analyzeOne(r.id);
    revalidatePath("/");
    target = withParam(`/learn/${r.id}`, "msg", r.created ? "URL added and analyzed." : "Already in DAILY AI — re-analyzed.");
  } catch (e) {
    target = withParam(target, "err", errMsg(e));
  }
  redirect(target);
}

// ---------- discoveries ----------

export async function discoveryAction(fd: FormData) {
  const back = safeBack(fd, "/");
  const articleId = id.parse(fd.get("id"));
  const action = z.enum([...USER_ACTIONS, "analyze", "clear"]).parse(fd.get("action"));
  if (action === "learn") {
    let target = back;
    try {
      await limit("llm", 15);
      await learnArticle(articleId);
      revalidatePath("/learn");
      target = withParam(`/learn/${articleId}`, "msg", "Study note saved to Knowledge (status LEARNING).");
    } catch (e) {
      target = withParam(back, "err", errMsg(e));
    }
    redirect(target);
  }
  if (action === "experiment") {
    let target = back;
    try {
      await limit("llm", 15);
      const exp = await createExperimentFromArticle(articleId);
      revalidatePath("/experiments");
      target = withParam(`/experiments/${exp.id}`, "msg", `${exp.code} drafted — review and edit before running.`);
    } catch (e) {
      target = withParam(back, "err", errMsg(e));
    }
    redirect(target);
  }
  if (action === "watch") {
    await run(back, async () => {
      const row = await getArticle(articleId);
      if (!row) throw new Error("Article not found");
      await setUserAction(articleId, "watch");
      const tech = (row.article.analysis as { technology?: string } | null)?.technology;
      if (tech) {
        await addWatchItem({ kind: "technology", name: tech, pattern: tech });
        return `Watching "${tech}" — related items get a score boost.`;
      }
      return "Marked as watched.";
    }, ["/", "/watch", "/discover"]);
  }
  if (action === "analyze") {
    await run(back, async () => {
      await limit("llm", 15);
      await analyzeOne(articleId);
      return "Re-analyzed.";
    }, ["/", "/discover"]);
  }
  await run(back, async () => {
    await setUserAction(articleId, action === "clear" ? null : action);
    return action === "ignore" ? "Ignored." : "Cleared.";
  }, ["/", "/discover"]);
}

// ---------- knowledge ----------

const knowledgeSchema = z.object({
  title: str(300).min(1),
  area: z.enum(KNOWLEDGE_AREAS),
  status: z.enum(KNOWLEDGE_STATUSES),
  summary: optStr(2000),
  contentMd: str(100_000),
  tags: optStr(500),
});

export async function saveKnowledgeAction(fd: FormData) {
  const kid = fd.get("id") ? id.parse(fd.get("id")) : null;
  let target = "/knowledge";
  try {
    const d = knowledgeSchema.parse(form(fd));
    const input = { ...d, tags: lines(d.tags).map((t) => t.toUpperCase()) };
    if (kid) {
      await updateKnowledge(kid, input);
      target = withParam(`/knowledge/${kid}`, "msg", "Saved.");
    } else {
      const k = await createKnowledge(input);
      target = withParam(`/knowledge/${k.id}`, "msg", "Knowledge item created.");
    }
    revalidatePath("/knowledge");
  } catch (e) {
    target = withParam(kid ? `/knowledge/${kid}?edit=1` : "/knowledge/new", "err", errMsg(e));
  }
  redirect(target);
}

export async function knowledgeStatusAction(fd: FormData) {
  const kid = id.parse(fd.get("id"));
  await run(safeBack(fd, `/knowledge/${kid}`), async () => {
    await updateKnowledge(kid, { status: z.enum(KNOWLEDGE_STATUSES).parse(fd.get("status")) });
    return "Status updated.";
  }, ["/knowledge", "/learn"]);
}

export async function deleteKnowledgeAction(fd: FormData) {
  await run("/knowledge", async () => {
    await deleteKnowledge(id.parse(fd.get("id")));
    return "Deleted.";
  }, ["/knowledge"]);
}

// ---------- experiments ----------

const experimentSchema = z.object({
  title: str(300).min(1),
  technology: optStr(120),
  problem: optStr(), hypothesis: optStr(), baseline: optStr(), newApproach: optStr(), setup: optStr(), steps: optStr(10000),
  metrics: optStr(1000),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  executionNotes: optStr(20000), problems: optStr(10000),
});

export async function saveExperimentAction(fd: FormData) {
  const eid = fd.get("id") ? id.parse(fd.get("id")) : null;
  let target = "/experiments";
  try {
    const d = experimentSchema.parse(form(fd));
    const input = { ...d, technology: d.technology || null, metrics: lines(d.metrics) };
    if (eid) {
      await updateExperiment(eid, input);
      target = withParam(`/experiments/${eid}`, "msg", "Saved.");
    } else {
      const e = await createExperiment(input);
      target = withParam(`/experiments/${e.id}`, "msg", `${e.code} created.`);
    }
    revalidatePath("/experiments");
  } catch (e) {
    target = withParam(eid ? `/experiments/${eid}?edit=1` : "/experiments/new", "err", errMsg(e));
  }
  redirect(target);
}

export async function addResultAction(fd: FormData) {
  const eid = id.parse(fd.get("experimentId"));
  await run(`/experiments/${eid}`, async () => {
    const d = z.object({
      variant: str(60).min(1),
      timeMinutes: optNum, tokens: optInt, costUsd: optNum, quality: optNum, accuracy: optNum,
      testPassRate: optNum, humanInterventions: optInt, retries: optInt, notes: optStr(2000),
    }).parse(form(fd));
    await addResult({ ...d, experimentId: eid });
    return `Result for "${d.variant}" recorded.`;
  }, ["/experiments"]);
}

export async function deleteResultAction(fd: FormData) {
  const eid = id.parse(fd.get("experimentId"));
  await run(`/experiments/${eid}`, async () => {
    await deleteResult(id.parse(fd.get("id")));
    return "Result removed.";
  }, ["/experiments"]);
}

export async function decideExperimentAction(fd: FormData) {
  const eid = id.parse(fd.get("id"));
  await run(`/experiments/${eid}`, async () => {
    const d = z.object({
      decision: z.enum(EXPERIMENT_DECISIONS), conclusion: optStr(5000), playbookRule: optStr(500),
    }).parse(form(fd));
    const r = await decideExperiment(eid, d.decision, d.conclusion, d.playbookRule);
    return `Decision: ${d.decision}.${r.playbookVersion ? ` Playbook updated to v${r.playbookVersion}.` : ""}`;
  }, ["/experiments", "/radar", "/knowledge", "/"]);
}

export async function deleteExperimentAction(fd: FormData) {
  await run("/experiments", async () => {
    await deleteExperiment(id.parse(fd.get("id")));
    return "Experiment deleted.";
  }, ["/experiments"]);
}

// ---------- playbook ----------

export async function addPlaybookRuleAction(fd: FormData) {
  await run("/knowledge/playbook", async () => {
    const d = z.object({ rule: str(500).min(3), changelog: optStr(300) }).parse(form(fd));
    const p = await addPlaybookRule(d.rule, d.changelog || d.rule);
    return `Playbook v${p.version} created.`;
  }, ["/knowledge/playbook"]);
}

// ---------- radar ----------

export async function saveRadarAction(fd: FormData) {
  await run("/radar", async () => {
    const d = z.object({
      name: str(120).min(1), ring: z.enum(RADAR_RINGS), quadrant: z.enum(RADAR_QUADRANTS), rationale: optStr(1000),
    }).parse(form(fd));
    await upsertRadarItem(d);
    return `${d.name} → ${d.ring}.`;
  }, ["/radar"]);
}

export async function deleteRadarAction(fd: FormData) {
  await run("/radar", async () => {
    await deleteRadarItem(id.parse(fd.get("id")));
    return "Removed from radar.";
  }, ["/radar"]);
}

// ---------- watch ----------

export async function addWatchAction(fd: FormData) {
  await run("/watch", async () => {
    const d = z.object({
      kind: z.enum(WATCH_KINDS), name: str(120).min(1), pattern: optStr(200),
      boost: z.coerce.number().int().min(1).max(30).default(15), createSource: z.string().optional(),
    }).parse(form(fd));
    await addWatchItem({ ...d, pattern: d.pattern || d.name, createSource: d.createSource === "on" });
    return `Watching ${d.name}.`;
  }, ["/watch", "/settings"]);
}

export async function toggleWatchAction(fd: FormData) {
  await run("/watch", async () => {
    await updateWatchItem(id.parse(fd.get("id")), { active: fd.get("active") === "true" });
  }, ["/watch"]);
}

export async function deleteWatchAction(fd: FormData) {
  await run("/watch", async () => {
    await deleteWatchItem(id.parse(fd.get("id")));
    return "Removed from watch list.";
  }, ["/watch"]);
}

// ---------- settings ----------

export async function saveSecretAction(fd: FormData) {
  await run("/settings", async () => {
    const d = z.object({ name: z.enum(SECRET_KEYS), value: optStr(500) }).parse(form(fd));
    await setSecret(d.name, d.value);
    return d.value ? `${d.name} saved (encrypted).` : `${d.name} removed.`;
  }, ["/settings"]);
}

// ---------- prompts ----------

const promptKey = z.string().regex(/^[a-z0-9-]{1,60}$/);

export async function activatePromptAction(fd: FormData) {
  await run("/settings/prompts", async () => {
    const d = z.object({ key: promptKey, version: z.coerce.number().int().positive() }).parse(form(fd));
    await activatePromptVersion(d.key, d.version);
    return `${d.key}-v${d.version} is now active.`;
  }, ["/settings/prompts", "/settings"]);
}

export async function createPromptVersionAction(fd: FormData) {
  await run("/settings/prompts", async () => {
    const d = z.object({
      key: promptKey, system: str(20000).min(1), user: str(5000).min(1), activate: z.string().optional(),
    }).parse(form(fd));
    const v = await createPromptVersion(d.key, d.system, d.user, d.activate === "on");
    return `${d.key}-v${v} created${d.activate === "on" ? " and activated" : ""}.`;
  }, ["/settings/prompts", "/settings"]);
}

// ---------- notifications ----------

export async function sendTestNotificationAction() {
  await run("/settings", async () => {
    await limit("notify", 5);
    const results = await sendNotification("✅ DAILY AI test message: notifications are working.");
    if (!results.length) throw new Error("No notification channel configured. Add Telegram, LINE or webhook secrets first.");
    return results.map((r) => `${r.channel}: ${r.ok ? "sent" : `failed (${r.error})`}`).join(" · ");
  }, ["/settings"]);
}

export async function notifyDigestAction(fd: FormData) {
  await run(safeBack(fd, "/digest"), async () => {
    await limit("notify", 5);
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(fd.get("date") || undefined);
    const r = await notifyJob(date);
    if ("skipped" in r) throw new Error(`Not sent: ${r.skipped}`);
    return `Digest ${r.digestDate} sent to ${r.sent.join(", ") || "no channel"}${r.failed.length ? `; failed: ${r.failed.map((f) => f.channel).join(", ")}` : ""}.`;
  }, ["/settings"]);
}
