import { listWatchItems } from "@/lib/services/watch";
import { WATCH_KINDS } from "@/lib/constants";
import { PageHeader, Empty } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addWatchAction, toggleWatchAction, deleteWatchAction } from "../actions";

export default async function WatchPage() {
  const items = await listWatchItems();
  return (
    <div>
      <PageHeader title="Watch List" subtitle="Matching discoveries get a score boost. Repository patterns: owner/repo or owner/*. Everything else matches as a keyword." />
      <form action={addWatchAction} className="card mb-6 grid gap-2 sm:grid-cols-6">
        <div><label className="label">Kind</label><select name="kind" className="input">{WATCH_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Name</label><input name="name" required className="input" placeholder="Claude Code / openai/codex" /></div>
        <div><label className="label">Pattern (optional)</label><input name="pattern" className="input" placeholder="defaults to name" /></div>
        <div><label className="label">Boost</label><input name="boost" type="number" min={1} max={30} defaultValue={15} className="input" /></div>
        <div className="self-end"><SubmitButton className="btn-primary w-full justify-center">Watch</SubmitButton></div>
        <label className="flex items-center gap-2 text-xs text-slate-400 sm:col-span-6">
          <input type="checkbox" name="createSource" defaultChecked /> For repositories (owner/repo): also add a GitHub release source
        </label>
      </form>
      {items.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="p-2">Kind</th><th className="p-2">Name</th><th className="p-2">Pattern</th><th className="p-2">Boost</th><th className="p-2"></th></tr></thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className={`border-t border-white/5 ${w.active ? "" : "opacity-50"}`}>
                <td className="p-2 text-slate-400">{w.kind}</td>
                <td className="p-2 font-medium">{w.name}</td>
                <td className="p-2 font-mono text-xs">{w.pattern}</td>
                <td className="p-2">+{w.boost}</td>
                <td className="flex justify-end gap-2 p-2">
                  <form action={toggleWatchAction}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="active" value={String(!w.active)} /><button className="btn btn-sm">{w.active ? "Pause" : "Resume"}</button></form>
                  <form action={deleteWatchAction}><input type="hidden" name="id" value={w.id} /><button className="btn btn-sm text-red-300">Remove</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>Nothing watched yet.</Empty>}
    </div>
  );
}
