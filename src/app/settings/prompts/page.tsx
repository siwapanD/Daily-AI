import Link from "next/link";
import { listPromptVersions, promptVersionStats } from "@/lib/services/prompts";
import { PROMPTS, parseTemplate } from "@/lib/prompts";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { activatePromptAction, createPromptVersionAction } from "../../actions";

export default async function PromptsPage() {
  const [versions, stats] = await Promise.all([listPromptVersions(), promptVersionStats()]);
  const keys = Object.keys(PROMPTS);
  return (
    <div>
      <PageHeader title="Prompt versions" subtitle="Every LLM call records the prompt version it used, so you can compare versions on cost, latency and failures before switching.">
        <Link href="/settings" className="btn">← Settings</Link>
      </PageHeader>
      {keys.map((key) => {
        const list = versions.filter((v) => v.key === key);
        const active = list.find((v) => v.isActive) ?? list[list.length - 1];
        const base = active ? parseTemplate(active.template) : { system: "", user: "" };
        return (
          <Section key={key} title={key}>
            <p className="mb-3 text-sm text-slate-400">{PROMPTS[key].description}</p>
            <div className="mb-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
                  <tr><th className="p-2">Version</th><th className="p-2">Created</th><th className="p-2">Calls</th><th className="p-2">Failures</th><th className="p-2">Tokens</th><th className="p-2">Cost</th><th className="p-2">Avg latency</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {list.map((v) => {
                    const s = stats.get(`${key}-v${v.version}`);
                    return (
                      <tr key={v.id} className="border-t border-white/5 align-top">
                        <td className="p-2 font-mono">
                          v{v.version} {v.isActive && <span className="ml-1 text-xs text-emerald-300">active</span>}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-slate-500">template</summary>
                            <pre className="mt-1 max-w-2xl whitespace-pre-wrap rounded bg-black/40 p-2 text-[11px] text-slate-300">{v.template}</pre>
                          </details>
                        </td>
                        <td className="p-2 text-xs text-slate-400">{fmtDate(v.createdAt)}</td>
                        <td className="p-2">{s?.calls ?? 0}</td>
                        <td className="p-2">{s?.failures ?? 0}</td>
                        <td className="p-2">{(s?.tokens ?? 0).toLocaleString()}</td>
                        <td className="p-2">${(s?.cost ?? 0).toFixed(4)}</td>
                        <td className="p-2">{s ? `${s.avgLatency} ms` : "—"}</td>
                        <td className="p-2">
                          {!v.isActive && (
                            <form action={activatePromptAction}>
                              <input type="hidden" name="key" value={key} /><input type="hidden" name="version" value={v.version} />
                              <SubmitButton className="btn btn-sm">Activate</SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium">New version (starts from the active one)</summary>
              <form action={createPromptVersionAction} className="mt-3 space-y-2">
                <input type="hidden" name="key" value={key} />
                <label className="label">System</label>
                <textarea name="system" rows={10} defaultValue={base.system} className="input font-mono text-xs" />
                <label className="label">User (variables: {"{{title}} {{content}} {{source}} {{url}} {{published}} {{reliability}} {{summary}} {{items}}"})</label>
                <textarea name="user" rows={3} defaultValue={base.user} className="input font-mono text-xs" />
                <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" name="activate" /> Activate immediately</label>
                <SubmitButton className="btn-primary">Create version</SubmitButton>
              </form>
            </details>
          </Section>
        );
      })}
    </div>
  );
}
