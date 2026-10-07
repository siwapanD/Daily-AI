import Link from "next/link";
import { searchAll } from "@/lib/services/search";
import { PageHeader, Badge, Empty, Section, fmtDate } from "@/components/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const r = await searchAll(q);
  const total = r.articles.length + r.knowledge.length + r.experiments.length + r.technologies.length;
  return (
    <div>
      <PageHeader title="Search" subtitle="Technologies, models, tools, experiments, knowledge and discoveries." />
      <form className="mb-6 flex gap-2"><input name="q" defaultValue={q} autoFocus className="input flex-1" placeholder="e.g. MCP, Claude Code, planning" /><button className="btn-primary">Search</button></form>
      {q && total === 0 && <Empty>No results for “{q}”.</Empty>}
      {r.technologies.length > 0 && (
        <Section title="Technologies">
          <div className="flex flex-wrap gap-2">{r.technologies.map((t) => <Link key={t.id} href={`/technologies/${t.slug}`} className="btn btn-sm">{t.name}</Link>)}</div>
        </Section>
      )}
      {r.experiments.length > 0 && (
        <Section title="Experiments">
          <ul className="space-y-1 text-sm">{r.experiments.map((e) => <li key={e.id}><Link className="link" href={`/experiments/${e.id}`}>{e.code} {e.title}</Link> <Badge value={e.decision} /></li>)}</ul>
        </Section>
      )}
      {r.knowledge.length > 0 && (
        <Section title="Knowledge">
          <ul className="space-y-1 text-sm">{r.knowledge.map((k) => <li key={k.id}><Badge value={k.status} /> <Link className="link" href={`/knowledge/${k.id}`}>{k.title}</Link> <span className="text-xs text-slate-500">{k.area}</span></li>)}</ul>
        </Section>
      )}
      {r.articles.length > 0 && (
        <Section title="Discoveries">
          <ul className="space-y-1 text-sm">{r.articles.map((a) => <li key={a.id}><span className="mr-2 font-mono text-slate-400">{a.score ?? "–"}</span><Link className="link" href={`/learn/${a.id}`}>{a.title}</Link> <span className="text-xs text-slate-500">{fmtDate(a.date)}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
