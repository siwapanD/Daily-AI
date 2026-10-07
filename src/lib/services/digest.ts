import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getAI, withFallback } from "../llm";
import { renderPrompt } from "../prompts";
import { getActivePrompt } from "./prompts";
import { listDiscoveries, type DiscoveryRow } from "./discoveries";
import { env } from "../env";

const cats = (r: DiscoveryRow) => ((r.analysis as { categories?: string[] } | null)?.categories ?? []);

function line(r: DiscoveryRow, withWhy = false) {
  const why = withWhy && r.whyItMatters ? ` — ${r.whyItMatters}` : "";
  return `- [${r.title}](${r.url}) · ${r.sourceName ?? "manual"} · score ${r.dailyScore ?? "–"}${why}`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Build (or rebuild) the digest for a date from the last 24-48h of analyzed discoveries. */
export async function generateDigest(date = new Date()) {
  const { rows } = await listDiscoveries({ days: 2, pageSize: 100 });
  const items = rows.filter((r) => r.dailyScore != null && r.recommendation !== "IGNORE");
  const by = (pred: (r: DiscoveryRow) => boolean, n = 5) => items.filter(pred).slice(0, n);

  const top = items.slice(0, 3);
  const mustLearn = by((r) => r.recommendation === "MUST_LEARN");
  const testing = by((r) => r.recommendation === "EXPERIMENT" || (r.experimentValue ?? 0) >= 70);
  const production = by((r) => cats(r).some((c) => ["PRODUCTION", "SECURITY", "DEPLOYMENT", "DEVOPS", "OBSERVABILITY"].includes(c)) && (r.dailyScore ?? 0) >= 45);
  const tools = by((r) => cats(r).includes("CODING") || cats(r).includes("AGENT"));
  const github = by((r) => r.sourceType === "github" || /github\.com/.test(r.url));
  const watch = by((r) => r.recommendation === "WATCH" || ((r.analysis as { watch?: string[] } | null)?.watch?.length ?? 0) > 0);
  const exp = testing[0] ?? top[0];
  const expIdea = exp ? ((exp.analysis as { experimentIdea?: string } | null)?.experimentIdea ?? `Try "${exp.title}" on one real task against your current workflow.`) : null;

  let intro = "";
  let generatedBy = "heuristic";
  const ai = await getAI();
  if (!ai.isHeuristic && items.length) {
    const list = items.slice(0, 12).map((r) => `- ${r.title} (score ${r.dailyScore}, ${r.recommendation}): ${r.summary ?? r.excerpt ?? ""}`).join("\n");
    const p = renderPrompt("digest-summary", { items: list }, await getActivePrompt("digest-summary"));
    const res = await withFallback("digest", async (prov) => {
      const r = await prov.chat([{ role: "system", content: p.system }, { role: "user", content: p.user }],
        { ...ai.strong, task: "digest", promptVersion: p.version });
      return r.text.trim();
    }, ai);
    if (res.by !== "heuristic") {
      intro = res.value;
      generatedBy = `${res.by}:${ai.strong.model}`;
    }
  }
  if (!intro) {
    intro = items.length
      ? `${items.length} relevant discoveries in the last 48 hours. ${mustLearn.length} must-learn, ${testing.length} worth testing.`
      : "No new analyzed discoveries in the last 48 hours. Run Fetch Now and Analyze Now.";
  }

  const section = (title: string, list: DiscoveryRow[], withWhy = false) =>
    `## ${title}\n\n${list.length ? list.map((r) => line(r, withWhy)).join("\n") : "_Nothing today._"}\n`;
  const title = `DAILY AI — ${formatDate(date)}`;
  const md = [
    `# ${title}`,
    "",
    intro,
    "",
    `## Top Findings\n\n${top.length ? top.map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.summary ?? r.excerpt ?? ""}`).join("\n") : "_Nothing today._"}\n`,
    section("Must Learn", mustLearn, true),
    section("Worth Testing", testing),
    section("Production Impact", production, true),
    section("Tool Updates", tools),
    section("Interesting GitHub Projects", github),
    section("Watch", watch),
    `## Recommended Experiment Today\n\n${exp ? `**${exp.title}**\n\n${expIdea}\n\nCreate it: ${env.appUrl}/learn/${exp.id}` : "_None._"}\n`,
  ].join("\n");

  const digestDate = date.toISOString().slice(0, 10);
  const data = { counts: { items: items.length, mustLearn: mustLearn.length, testing: testing.length }, topIds: top.map((t) => t.id) };
  const [row] = await db.insert(schema.dailyDigests)
    .values({ digestDate, title, contentMd: md, data, generatedBy })
    .onConflictDoUpdate({ target: schema.dailyDigests.digestDate, set: { title, contentMd: md, data, generatedBy, createdAt: new Date() } })
    .returning();
  return row;
}

export async function listDigests(limit = 30) {
  return db.select({ id: schema.dailyDigests.id, digestDate: schema.dailyDigests.digestDate, title: schema.dailyDigests.title })
    .from(schema.dailyDigests).orderBy(desc(schema.dailyDigests.digestDate)).limit(limit);
}

export async function getDigest(date?: string) {
  const [row] = date
    ? await db.select().from(schema.dailyDigests).where(eq(schema.dailyDigests.digestDate, date))
    : await db.select().from(schema.dailyDigests).orderBy(desc(schema.dailyDigests.digestDate)).limit(1);
  return row ?? null;
}
