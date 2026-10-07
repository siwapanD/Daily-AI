import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getArticle, knowledgeForArticle } from "@/lib/services/knowledge";
import { Badge, Score, fmtDate, PageHeader, Section } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/submit-button";
import { discoveryAction } from "../../actions";
import { WEIGHTS } from "@/lib/pipeline/score";

function Act({ id, action, children, primary }: { id: number; action: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={discoveryAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={`/learn/${id}`} />
      <SubmitButton className={primary ? "btn-primary" : "btn"} pendingText="Working…">{children}</SubmitButton>
    </form>
  );
}

export default async function LearnArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const row = await getArticle(id);
  if (!row) notFound();
  const { article: a, source: s } = row;
  const [knowledge, experiments, tech] = await Promise.all([
    knowledgeForArticle(id),
    db.select().from(schema.experiments).where(eq(schema.experiments.articleId, id)),
    a.technologyId ? db.select().from(schema.technologies).where(eq(schema.technologies.id, a.technologyId)).then((r) => r[0]) : null,
  ]);
  const an = (a.analysis ?? {}) as { categories?: string[]; experimentIdea?: string; workflowImprovement?: string; hype?: boolean; watch?: string[]; aiError?: string };
  const scores = [
    ["Impact", a.impactScore, WEIGHTS.impact], ["Novelty", a.noveltyScore, WEIGHTS.novelty],
    ["Reliability", a.reliabilityScore, WEIGHTS.reliability], ["Relevance", a.relevanceScore, WEIGHTS.relevance],
    ["Experiment value", a.experimentValue, WEIGHTS.experimentValue],
  ] as const;

  return (
    <div>
      <PageHeader title={a.title} subtitle={`${s?.name ?? "manual"} · ${fmtDate(a.publishedAt ?? a.fetchedAt)} · analyzed by ${a.analyzedBy ?? "—"}`}>
        <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="btn">Open source ↗</a>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge value={a.recommendation} />
              {(an.categories ?? []).map((c) => <span key={c} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{c}</span>)}
              {an.hype && <span className="text-xs text-orange-300">possible hype</span>}
              {tech && <Link href={`/technologies/${tech.slug}`} className="link text-xs">{tech.name} timeline →</Link>}
            </div>
            <p className="text-slate-200">{a.summary ?? a.excerpt ?? "No summary yet — run Analyze."}</p>
            {a.whyItMatters && <p className="mt-2 text-indigo-200/90"><b>Why it matters:</b> {a.whyItMatters}</p>}
            {an.experimentIdea && <p className="mt-2 text-violet-200/90"><b>Experiment idea:</b> {an.experimentIdea}</p>}
            {an.workflowImprovement && <p className="mt-2 text-emerald-200/90"><b>Workflow improvement:</b> {an.workflowImprovement}</p>}
            {an.aiError && <p className="mt-2 text-xs text-red-300">AI fell back to heuristic: {an.aiError}</p>}
          </div>

          <Section title="Learn">
            {knowledge ? (
              <div className="card">
                <div className="mb-3 flex items-center justify-between">
                  <Badge value={knowledge.status} />
                  <Link href={`/knowledge/${knowledge.id}`} className="link text-sm">Open in Knowledge →</Link>
                </div>
                <Markdown>{knowledge.contentMd}</Markdown>
              </div>
            ) : (
              <div className="card text-sm text-slate-400">
                <p className="mb-3">No study note yet. LEARN generates: What is it? · Why does it matter? · How does it work? · What&apos;s new? · Advantages · Limitations · Use cases · Risks · Example · How we can use it · Should we test it?</p>
                <Act id={id} action="learn" primary>Generate study note</Act>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="card">
            <div className="mb-2 flex items-baseline justify-between"><span className="h2 mb-0">Daily AI Score</span><Score value={a.dailyScore} /></div>
            <table className="w-full text-sm">
              <tbody>
                {scores.map(([name, v, w]) => (
                  <tr key={name} className="border-t border-white/5">
                    <td className="py-1 text-slate-400">{name} <span className="text-[10px]">×{w}</span></td>
                    <td className="py-1 text-right font-mono">{v ?? "–"}</td>
                  </tr>
                ))}
                {a.watchBoost > 0 && <tr className="border-t border-white/5"><td className="py-1 text-sky-300">Watch boost ({an.watch?.join(", ")})</td><td className="py-1 text-right font-mono text-sky-300">+{a.watchBoost}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card flex flex-wrap gap-2">
            <Act id={id} action="experiment" primary>Create experiment</Act>
            <Act id={id} action="watch">Watch</Act>
            <Act id={id} action="analyze">Re-analyze</Act>
            <Act id={id} action={a.userAction === "ignore" ? "clear" : "ignore"}>{a.userAction === "ignore" ? "Un-ignore" : "Ignore"}</Act>
          </div>
          {experiments.length > 0 && (
            <div className="card">
              <p className="h2">Experiments</p>
              <ul className="space-y-1 text-sm">
                {experiments.map((e) => <li key={e.id}><Link className="link" href={`/experiments/${e.id}`}>{e.code} {e.title}</Link> <Badge value={e.decision} /></li>)}
              </ul>
            </div>
          )}
          {a.content && (
            <details className="card text-sm">
              <summary className="cursor-pointer text-slate-400">Extracted source text</summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-400">{a.content.slice(0, 6000)}</p>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
