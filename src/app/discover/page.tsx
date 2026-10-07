import { listDiscoveries } from "@/lib/services/discoveries";
import { listSources } from "@/lib/services/discovery";
import { CATEGORIES, RECOMMENDATIONS, label } from "@/lib/constants";
import { DiscoveryCard, JobButtons } from "@/components/discovery-card";
import { PageHeader, Empty, Pager } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addManualUrlAction } from "../actions";

type SP = Promise<Record<string, string | undefined>>;

export default async function DiscoverPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filter = {
    q: sp.q || undefined,
    category: sp.category || undefined,
    recommendation: sp.recommendation || undefined,
    minScore: sp.minScore ? Number(sp.minScore) : undefined,
    sourceId: sp.sourceId ? Number(sp.sourceId) : undefined,
    days: sp.days ? Number(sp.days) : undefined,
    showIgnored: sp.showIgnored === "1",
    page: sp.page ? Number(sp.page) : 1,
  };
  const [{ rows, total, page, pageSize }, sources] = await Promise.all([listDiscoveries(filter), listSources()]);
  const params = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && k !== "msg" && k !== "err" && v)) as Record<string, string>;
  const back = `/discover?${new URLSearchParams({ ...params, page: String(page) })}`;

  return (
    <div>
      <PageHeader title="Discover" subtitle="Everything collected, scored and classified."><JobButtons back={back} /></PageHeader>

      <form action={addManualUrlAction} className="card mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="back" value={back} />
        <input name="url" type="url" required placeholder="Paste a URL to add & analyze (blog post, release, doc page)…" className="input flex-1" />
        <SubmitButton className="btn-primary" pendingText="Adding…">Add URL</SubmitButton>
      </form>

      <form className="mb-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <input name="q" defaultValue={sp.q} placeholder="Search title…" className="input lg:col-span-2" />
        <select name="category" defaultValue={sp.category ?? ""} className="input">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select name="recommendation" defaultValue={sp.recommendation ?? ""} className="input">
          <option value="">All levels</option>
          {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
        <select name="sourceId" defaultValue={sp.sourceId ?? ""} className="input">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="days" defaultValue={sp.days ?? ""} className="input">
          <option value="">Any date</option>
          <option value="1">Last 24h</option><option value="3">Last 3 days</option>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
        </select>
        <div className="flex gap-2">
          <input name="minScore" type="number" min={0} max={100} defaultValue={sp.minScore} placeholder="Min score" className="input" />
          <button className="btn" type="submit">Filter</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 sm:col-span-3 lg:col-span-7">
          <input type="checkbox" name="showIgnored" value="1" defaultChecked={filter.showIgnored} /> Show ignored
        </label>
      </form>

      {rows.length ? (
        <div className="space-y-3">{rows.map((r) => <DiscoveryCard key={r.id} item={r} back={back} />)}</div>
      ) : (
        <Empty>No discoveries match. Try Fetch Now or loosen the filters.</Empty>
      )}
      <Pager page={page} total={total} pageSize={pageSize} params={params} />
    </div>
  );
}
