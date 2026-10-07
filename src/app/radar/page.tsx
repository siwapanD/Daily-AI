import Link from "next/link";
import { listRadar } from "@/lib/services/radar";
import { db, schema } from "@/lib/db";
import { RADAR_QUADRANTS, RADAR_RINGS } from "@/lib/constants";
import { PageHeader, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveRadarAction, deleteRadarAction } from "../actions";

const RING_STYLE: Record<string, string> = {
  ADOPT: "border-emerald-500/40", TRIAL: "border-violet-500/40", ASSESS: "border-amber-500/40",
  WATCH: "border-sky-500/40", HOLD: "border-red-500/40",
};

export default async function RadarPage() {
  const [items, techs] = await Promise.all([listRadar(), db.select({ id: schema.technologies.id, slug: schema.technologies.slug }).from(schema.technologies)]);
  const slugOf = new Map(techs.map((t) => [t.id, t.slug]));
  return (
    <div>
      <PageHeader title="Technology Radar" subtitle="ADOPT · TRIAL · ASSESS · WATCH · HOLD — updated automatically by experiment decisions." />
      <div className="mb-8 grid gap-3 md:grid-cols-5">
        {RADAR_RINGS.map((ring) => (
          <div key={ring} className={`rounded-lg border-t-4 bg-white/[0.03] p-3 ${RING_STYLE[ring]}`}>
            <h2 className="mb-2 text-sm font-bold tracking-widest">{ring}</h2>
            <ul className="space-y-2">
              {items.filter((i) => i.ring === ring).map((i) => (
                <li key={i.id} className="rounded bg-black/20 p-2 text-sm">
                  <div className="flex items-start justify-between gap-1">
                    {i.technologyId && slugOf.get(i.technologyId)
                      ? <Link href={`/technologies/${slugOf.get(i.technologyId)}`} className="font-medium hover:text-indigo-200">{i.name}</Link>
                      : <span className="font-medium">{i.name}</span>}
                    <form action={deleteRadarAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-slate-500 hover:text-red-300" aria-label={`Remove ${i.name}`}>×</button></form>
                  </div>
                  <p className="text-[11px] text-slate-500">{i.quadrant} · {fmtDate(i.updatedAt)}</p>
                  {i.rationale && <p className="mt-1 text-xs text-slate-400">{i.rationale}</p>}
                  {i.experimentId && <Link href={`/experiments/${i.experimentId}`} className="link text-xs">evidence →</Link>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <form action={saveRadarAction} className="card grid gap-2 sm:grid-cols-5">
        <div><label className="label">Name</label><input name="name" required className="input" /></div>
        <div><label className="label">Ring</label><select name="ring" className="input">{RADAR_RINGS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><label className="label">Quadrant</label><select name="quadrant" className="input">{RADAR_QUADRANTS.map((q) => <option key={q}>{q}</option>)}</select></div>
        <div><label className="label">Rationale</label><input name="rationale" className="input" /></div>
        <div className="self-end"><SubmitButton className="btn-primary w-full justify-center">Add / move</SubmitButton></div>
      </form>
    </div>
  );
}
