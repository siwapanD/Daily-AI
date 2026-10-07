import Link from "next/link";
import { listExperiments } from "@/lib/services/experiments";
import { PageHeader, Badge, Empty, fmtDate } from "@/components/ui";

export default async function ExperimentsPage() {
  const exps = await listExperiments();
  const groups = [
    ["Running", exps.filter((e) => e.status === "running")],
    ["Planned", exps.filter((e) => e.status === "planned")],
    ["Completed", exps.filter((e) => e.status === "completed")],
  ] as const;
  return (
    <div>
      <PageHeader title="Experiments" subtitle="Nothing enters the workflow without evidence. Baseline vs new approach, measured.">
        <Link href="/experiments/new" className="btn-primary">New experiment</Link>
      </PageHeader>
      {exps.length === 0 && <Empty>No experiments yet. Click Experiment on a discovery to draft one, or create one manually.</Empty>}
      {groups.map(([title, list]) => list.length > 0 && (
        <section key={title} className="mb-6">
          <h2 className="h2">{title} ({list.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                <tr><th className="p-2">ID</th><th className="p-2">Title</th><th className="p-2">Technology</th><th className="p-2">Decision</th><th className="p-2">Updated</th></tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="p-2 font-mono text-xs text-slate-400">{e.code}</td>
                    <td className="p-2"><Link href={`/experiments/${e.id}`} className="hover:text-indigo-200">{e.title}</Link></td>
                    <td className="p-2 text-slate-400">{e.technology ?? "—"}</td>
                    <td className="p-2"><Badge value={e.decision} /></td>
                    <td className="p-2 text-xs text-slate-500">{fmtDate(e.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
