import Link from "next/link";
import { notFound } from "next/navigation";
import { getExperiment, compareResults, RESULT_METRICS } from "@/lib/services/experiments";
import { EXPERIMENT_DECISIONS } from "@/lib/constants";
import { PageHeader, Badge, Section, Empty, fmtDate } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ExperimentForm } from "@/components/experiment-form";
import { SubmitButton } from "@/components/submit-button";
import { addResultAction, deleteResultAction, decideExperimentAction, deleteExperimentAction } from "../../actions";

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="card">
      <p className="h2">{title}</p>
      {text.trim() ? <Markdown>{text}</Markdown> : <p className="text-sm text-slate-500">—</p>}
    </div>
  );
}

export default async function ExperimentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const id = Number((await params).id);
  const e = Number.isInteger(id) ? await getExperiment(id) : null;
  if (!e) notFound();
  const edit = (await searchParams).edit === "1";
  const cmp = compareResults(e.results);
  const variants = [...new Set(e.results.map((r) => r.variant))];

  return (
    <div>
      <PageHeader title={`${e.code} — ${e.title}`} subtitle={`${e.technology ?? "No technology"} · ${e.status} · created ${fmtDate(e.createdAt)}`}>
        <Badge value={e.decision} className="self-center text-xs" />
        <a href={`/api/experiments/${e.id}/export`} className="btn">Export .md</a>
        {edit ? <Link href={`/experiments/${e.id}`} className="btn">Cancel</Link> : <Link href={`/experiments/${e.id}?edit=1`} className="btn">Edit</Link>}
        {e.articleId && <Link href={`/learn/${e.articleId}`} className="btn">Source</Link>}
      </PageHeader>

      {edit ? <ExperimentForm exp={e} /> : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Block title="Problem" text={e.problem} />
            <Block title="Hypothesis" text={e.hypothesis} />
            <Block title="Baseline" text={e.baseline} />
            <Block title="New approach (method)" text={e.newApproach} />
            <Block title="Setup" text={e.setup} />
            <Block title="Steps" text={e.steps} />
          </div>
          <div className="card mb-6"><p className="h2">Metrics</p><p className="text-sm">{e.metrics.join(" · ")}</p></div>

          <Section title="Results (benchmark)">
            {cmp.length ? (
              <div className="mb-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                    <tr><th className="p-2">Metric</th>{variants.map((v) => <th key={v} className="p-2">{v}</th>)}</tr>
                  </thead>
                  <tbody>
                    {cmp.map((m) => (
                      <tr key={m.key} className="border-t border-white/5">
                        <td className="p-2 text-slate-400">{m.label} <span className="text-[10px]">({m.better} is better)</span></td>
                        {variants.map((v) => {
                          const val = m.values[v];
                          const d = m.deltas[v];
                          return (
                            <td key={v} className="p-2 font-mono">
                              {val == null ? "—" : +val.toFixed(2)}
                              {d && <span className={`ml-1 text-xs ${d.better ? "text-emerald-300" : "text-red-300"}`}>({d.pct > 0 ? "+" : ""}{d.pct.toFixed(0)}%)</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No results yet. Record a run for the baseline and for the new approach.</Empty>}

            {e.results.length > 0 && (
              <details className="mb-4 text-sm">
                <summary className="cursor-pointer text-slate-400">Individual runs ({e.results.length})</summary>
                <ul className="mt-2 space-y-1">
                  {e.results.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="font-medium">{r.variant}</span>
                      <span className="text-xs text-slate-500">{fmtDate(r.createdAt)} {r.notes}</span>
                      <form action={deleteResultAction}>
                        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="experimentId" value={e.id} />
                        <button className="text-xs text-red-300 hover:underline">remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <form action={addResultAction} className="card grid gap-2 sm:grid-cols-5">
              <input type="hidden" name="experimentId" value={e.id} />
              <div className="sm:col-span-1"><label className="label">Variant</label>
                <input name="variant" required list="variants" defaultValue={variants.includes("baseline") ? "new" : "baseline"} className="input" />
                <datalist id="variants"><option value="baseline" /><option value="new" /></datalist></div>
              {RESULT_METRICS.map((m) => (
                <div key={m.key}><label className="label">{m.label}</label><input name={m.key} type="number" step="any" className="input" /></div>
              ))}
              <div className="sm:col-span-4"><label className="label">Notes</label><input name="notes" className="input" /></div>
              <div className="self-end"><SubmitButton className="btn-primary w-full justify-center">Record run</SubmitButton></div>
            </form>
          </Section>

          {(e.executionNotes || e.problems) && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <Block title="Execution notes" text={e.executionNotes} />
              <Block title="Problems" text={e.problems} />
            </div>
          )}

          <Section title="Decision">
            {e.decision && (
              <div className="card mb-4">
                <p><Badge value={e.decision} /> <span className="text-xs text-slate-500">decided {fmtDate(e.decidedAt)}</span></p>
                {e.conclusion && <div className="mt-2"><Markdown>{e.conclusion}</Markdown></div>}
              </div>
            )}
            <form action={decideExperimentAction} className="card space-y-3">
              <input type="hidden" name="id" value={e.id} />
              <div className="flex flex-wrap gap-3">
                {EXPERIMENT_DECISIONS.map((d) => (
                  <label key={d} className="flex items-center gap-1 text-sm">
                    <input type="radio" name="decision" value={d} defaultChecked={e.decision === d || (!e.decision && d === "WATCH")} /> {d}
                  </label>
                ))}
              </div>
              <div><label className="label">Conclusion</label><textarea name="conclusion" rows={3} defaultValue={e.conclusion} className="input" placeholder="What did the evidence show?" /></div>
              <div><label className="label">Playbook rule (ADOPT only, optional)</label>
                <input name="playbookRule" className="input" placeholder="e.g. Always plan before coding: Research → Plan → Phase → Task → Code" /></div>
              <SubmitButton className="btn-primary">Save decision</SubmitButton>
              <p className="text-xs text-slate-500">Decision updates the Technology Radar (ADOPT→ADOPT, WATCH→ASSESS, REJECT→HOLD, RETEST→TRIAL) and the linked knowledge status.</p>
            </form>
          </Section>

          <form action={deleteExperimentAction}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton className="btn btn-sm text-red-300">Delete experiment</SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
