import Link from "next/link";
import { listKnowledge } from "@/lib/services/knowledge";
import { KNOWLEDGE_AREAS, KNOWLEDGE_STATUSES, label } from "@/lib/constants";
import { PageHeader, Badge, Empty, fmtDate } from "@/components/ui";

type SP = Promise<Record<string, string | undefined>>;

export default async function KnowledgePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const items = await listKnowledge({ q: sp.q, area: sp.area, status: sp.status, tag: sp.tag });
  const counts = new Map<string, number>();
  for (const k of await listKnowledge()) counts.set(k.area, (counts.get(k.area) ?? 0) + 1);

  return (
    <div>
      <PageHeader title="Knowledge" subtitle="Everything learned, validated or rejected.">
        <Link href="/knowledge/playbook" className="btn">AI Engineering Playbook</Link>
        <Link href="/knowledge/new" className="btn-primary">New item</Link>
      </PageHeader>
      <div className="grid gap-6 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          <Link href="/knowledge" className={`block rounded px-2 py-1 ${!sp.area ? "bg-white/10" : "text-slate-400 hover:text-white"}`}>All areas</Link>
          {KNOWLEDGE_AREAS.map((a) => (
            <Link key={a} href={`/knowledge?area=${encodeURIComponent(a)}`}
              className={`flex justify-between rounded px-2 py-1 ${sp.area === a ? "bg-white/10" : "text-slate-400 hover:text-white"}`}>
              <span>{a}</span><span className="text-slate-500">{counts.get(a) ?? 0}</span>
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          <form className="mb-4 flex gap-2">
            {sp.area && <input type="hidden" name="area" value={sp.area} />}
            <input name="q" defaultValue={sp.q} placeholder="Search knowledge…" className="input flex-1" />
            <select name="status" defaultValue={sp.status ?? ""} className="input w-40">
              <option value="">Any status</option>
              {KNOWLEDGE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <button className="btn">Search</button>
          </form>
          {items.length ? (
            <ul className="space-y-2">
              {items.map((k) => (
                <li key={k.id} className="card py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={k.status} />
                    <Link href={`/knowledge/${k.id}`} className="flex-1 font-medium hover:text-indigo-200">{k.title}</Link>
                    <span className="text-xs text-slate-500">{k.area} · {fmtDate(k.updatedAt)}</span>
                  </div>
                  {k.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{k.summary}</p>}
                  {k.tags.length > 0 && <p className="mt-1 flex gap-1">{k.tags.map((t) => <Link key={t} href={`/knowledge?tag=${t}`} className="rounded bg-white/5 px-1.5 text-[10px] text-slate-400">{t}</Link>)}</p>}
                </li>
              ))}
            </ul>
          ) : <Empty>No knowledge items yet. Use Learn on a discovery, or create one manually.</Empty>}
        </div>
      </div>
    </div>
  );
}
