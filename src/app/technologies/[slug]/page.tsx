import Link from "next/link";
import { notFound } from "next/navigation";
import { getTechnologyBySlug, technologyTimeline } from "@/lib/services/technologies";
import { PageHeader, Empty, fmtDate } from "@/components/ui";

const KIND_STYLE: Record<string, string> = { discovery: "bg-indigo-400", experiment: "bg-violet-400", radar: "bg-emerald-400" };

export default async function TechnologyPage({ params }: { params: Promise<{ slug: string }> }) {
  const tech = await getTechnologyBySlug((await params).slug);
  if (!tech) notFound();
  const events = await technologyTimeline(tech.id);
  return (
    <div>
      <PageHeader title={tech.name} subtitle={`${tech.vendor ?? "—"} · ${tech.category} · timeline of discoveries, experiments and radar changes`} />
      {events.length ? (
        <ol className="relative ml-3 border-l border-white/10">
          {events.map((e, i) => (
            <li key={i} className="mb-5 ml-5">
              <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${KIND_STYLE[e.kind]}`} />
              <p className="font-mono text-xs text-slate-500">{fmtDate(e.date)} · {e.kind}</p>
              <Link href={e.href} className="font-medium hover:text-indigo-200">{e.title}</Link>
              {e.meta && <p className="text-xs text-slate-400">{e.meta}</p>}
            </li>
          ))}
        </ol>
      ) : <Empty>No events yet.</Empty>}
    </div>
  );
}
