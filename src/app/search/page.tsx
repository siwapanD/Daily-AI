import Link from "next/link";
import { searchAll } from "@/lib/services/search";
import { semanticSearch, type SemanticHit } from "@/lib/services/embeddings";
import { errMsg } from "@/lib/logger";
import { PageHeader, Badge, Empty, Section, fmtDate } from "@/components/ui";

type SP = Promise<{ q?: string; mode?: string }>;

function SemanticResults({ hits, q }: { hits: SemanticHit[]; q: string }) {
  if (!hits.length) return <Empty>No semantically similar items for “{q}”. Run the embed job (Settings → Run daily job, or POST /api/jobs/embed) if you just added content.</Empty>;
  return (
    <ul className="space-y-2">
      {hits.map((h) => (
        <li key={`${h.type}-${h.id}`} className="card flex items-center gap-3 py-2 text-sm">
          <span className="w-10 text-right font-mono text-slate-400" title="Cosine similarity">{Math.round(h.score * 100)}%</span>
          <span className="w-20 text-[10px] uppercase tracking-wide text-slate-500">{h.type === "article" ? "discovery" : "knowledge"}</span>
          <Link href={h.type === "article" ? `/learn/${h.id}` : `/knowledge/${h.id}`} className="flex-1 hover:text-indigo-200">{h.title}</Link>
          <Badge value={h.meta} />
        </li>
      ))}
    </ul>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  const semantic = sp.mode === "semantic";
  let hits: SemanticHit[] = [];
  let semanticError: string | null = null;
  if (semantic && q) hits = await semanticSearch(q, 30).catch((e) => { semanticError = errMsg(e); return []; });
  const r = semantic ? null : await searchAll(q);
  const total = r ? r.articles.length + r.knowledge.length + r.experiments.length + r.technologies.length : hits.length;

  return (
    <div>
      <PageHeader title="Search" subtitle="Keyword search ranks exact terms; semantic search finds items with similar meaning." />
      <form className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} autoFocus className="input flex-1" placeholder="e.g. MCP, Claude Code, planning before coding" />
        <select name="mode" defaultValue={semantic ? "semantic" : "keyword"} className="input w-36" aria-label="Search mode">
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>
      {semantic ? (
        q && (semanticError ? <Empty>Semantic search failed: {semanticError}</Empty> : <SemanticResults hits={hits} q={q} />)
      ) : (
        r && (
          <>
            {q && total === 0 && <Empty>No results for “{q}”. Try <Link className="link" href={`/search?mode=semantic&q=${encodeURIComponent(q)}`}>semantic search</Link>.</Empty>}
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
          </>
        )
      )}
    </div>
  );
}
