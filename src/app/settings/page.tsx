import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listSources } from "@/lib/services/discovery";
import { recentJobs } from "@/lib/services/jobs";
import { secretStatus, SECRET_KEYS } from "@/lib/services/settings";
import { tokensUsedToday } from "@/lib/llm";
import { env } from "@/lib/env";
import { AUTHORITY_LEVELS, SOURCE_TYPES } from "@/lib/constants";
import { PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import {
  createSourceAction, updateSourceAction, deleteSourceAction, fetchSourceAction, saveSecretAction, dailyNowAction,
} from "../actions";

const time = (d: Date | null) => (d ? d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

export default async function SettingsPage() {
  const [sources, jobs, secrets, usage, runs, fetches, prompts] = await Promise.all([
    listSources(),
    recentJobs(15),
    secretStatus(),
    tokensUsedToday(),
    db.select().from(schema.llmRuns).orderBy(desc(schema.llmRuns.createdAt)).limit(15),
    db.select({ log: schema.fetchLogs, name: schema.sources.name }).from(schema.fetchLogs)
      .leftJoin(schema.sources, eq(schema.fetchLogs.sourceId, schema.sources.id))
      .orderBy(desc(schema.fetchLogs.createdAt)).limit(20),
    db.select({ key: schema.prompts.key, version: schema.promptVersions.version, active: schema.promptVersions.isActive, description: schema.prompts.description })
      .from(schema.promptVersions).innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId)),
  ]);
  const llm = env.llm;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Sources, AI provider, secrets and system health.">
        <form action={dailyNowAction}><input type="hidden" name="back" value="/settings" /><SubmitButton className="btn-primary" pendingText="Running…">Run daily job now</SubmitButton></form>
      </PageHeader>

      <Section title={`Sources (${sources.length})`}>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
              <tr><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Authority</th><th className="p-2">Last fetch</th><th className="p-2">Tier / Reliability / Enabled</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-white/5 align-top">
                  <td className="p-2"><p className="font-medium">{s.name}</p><p className="max-w-xs truncate font-mono text-[11px] text-slate-500">{s.url}</p></td>
                  <td className="p-2 text-slate-400">{s.type}</td>
                  <td className="p-2 text-slate-400">{s.authorityLevel}</td>
                  <td className="p-2 text-xs">
                    <span className={s.lastStatus === "error" ? "text-red-300" : "text-slate-400"}>{s.lastStatus ?? "never"} · {time(s.lastFetchedAt)}</span>
                    {s.lastError && <p className="max-w-xs text-[11px] text-red-300/80">{s.lastError}</p>}
                  </td>
                  <td className="p-2">
                    <form action={updateSourceAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={s.id} />
                      <select name="tier" defaultValue={s.tier} className="input w-14 px-1"><option>1</option><option>2</option><option>3</option></select>
                      <input name="reliabilityScore" type="number" min={0} max={100} defaultValue={s.reliabilityScore} className="input w-16 px-1" aria-label="Reliability score" />
                      <input type="checkbox" name="enabled" defaultChecked={s.enabled} aria-label="Enabled" />
                      <SubmitButton className="btn btn-sm">Save</SubmitButton>
                    </form>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {s.type !== "manual" && <form action={fetchSourceAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className="btn btn-sm" pendingText="…">Fetch</SubmitButton></form>}
                      <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className="btn btn-sm text-red-300">Delete</SubmitButton></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={createSourceAction} className="card mt-3 grid gap-2 sm:grid-cols-7">
          <div className="sm:col-span-2"><label className="label">Name</label><input name="name" required className="input" /></div>
          <div className="sm:col-span-2"><label className="label">URL / owner/repo</label><input name="url" required className="input" placeholder="https://… or owner/repo" /></div>
          <div><label className="label">Type</label><select name="type" className="input">{SOURCE_TYPES.filter((t) => t !== "manual").map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">Authority</label><select name="authorityLevel" className="input">{AUTHORITY_LEVELS.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-1">
            <div><label className="label">Tier</label><select name="tier" defaultValue="2" className="input px-1"><option>1</option><option>2</option><option>3</option></select></div>
            <div><label className="label">Rel.</label><input name="reliabilityScore" type="number" min={0} max={100} defaultValue={70} className="input px-1" /></div>
          </div>
          <div className="sm:col-span-7 flex items-center gap-3">
            <SubmitButton className="btn-primary">Add source</SubmitButton>
            <span className="text-xs text-slate-500">Reliability guide: Official docs 100 · Official GitHub/Blog 95 · Engineering blog 85 · Hacker News 70 · Reddit 55 · Random blog 40</span>
          </div>
        </form>
      </Section>

      <div className="grid gap-x-8 md:grid-cols-2">
        <Section title="AI provider">
          <dl className="card grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-400">Provider</dt><dd>{llm.provider}</dd>
            <dt className="text-slate-400">Base URL</dt><dd className="truncate">{llm.baseUrl || "—"}</dd>
            <dt className="text-slate-400">Cheap model</dt><dd>{llm.cheapModel || "—"}</dd>
            <dt className="text-slate-400">Strong model</dt><dd>{llm.strongModel || "—"}</dd>
            <dt className="text-slate-400">Fallback model</dt><dd>{llm.fallbackModel || "—"}</dd>
            <dt className="text-slate-400">Tokens today</dt><dd>{usage.tokens.toLocaleString()} / {llm.dailyTokenLimit.toLocaleString()}</dd>
            <dt className="text-slate-400">Cost today</dt><dd>${usage.cost.toFixed(4)} ({usage.calls} calls)</dd>
            <dt className="text-slate-400">Per-task max tokens</dt><dd>{llm.maxTokensPerTask}</dd>
            <dt className="text-slate-400">Strong-model threshold</dt><dd>score ≥ {llm.analyzeThreshold}, max {llm.maxStrongPerRun}/run</dd>
          </dl>
          <p className="mt-2 text-xs text-slate-500">Provider and models are configured via environment variables (see docs/configuration.md).</p>
        </Section>

        <Section title="Secrets">
          <div className="space-y-2">
            {SECRET_KEYS.map((k) => (
              <form key={k} action={saveSecretAction} className="card flex items-center gap-2 py-2">
                <input type="hidden" name="name" value={k} />
                <span className="w-32 font-mono text-xs">{k}</span>
                <span className={`text-xs ${secrets[k] === "missing" ? "text-slate-500" : "text-emerald-300"}`}>{secrets[k]}</span>
                <input name="value" type="password" autoComplete="off" placeholder={secrets[k] === "env" ? "set in env (env wins)" : "new value (empty = remove)"} className="input flex-1" />
                <SubmitButton className="btn btn-sm">Save</SubmitButton>
              </form>
            ))}
            <p className="text-xs text-slate-500">Stored AES-256-GCM encrypted with APP_SECRET_KEY. Values are never sent back to the browser.</p>
          </div>
        </Section>
      </div>

      <Section title="Job history">
        <table className="w-full text-sm">
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-xs">{j.job}</td>
                <td className={`p-1.5 text-xs ${j.status === "error" ? "text-red-300" : j.status === "ok" ? "text-emerald-300" : "text-amber-300"}`}>{j.status}</td>
                <td className="p-1.5 text-xs text-slate-400">{time(j.startedAt)}</td>
                <td className="p-1.5 text-xs text-slate-400">{j.finishedAt ? `${((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000).toFixed(1)}s` : "…"}</td>
                <td className="max-w-md truncate p-1.5 font-mono text-[11px] text-slate-500" title={JSON.stringify(j.stats)}>{j.error ?? JSON.stringify(j.stats)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="grid gap-x-8 md:grid-cols-2">
        <Section title="LLM usage (recent)">
          <table className="w-full text-xs">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-1">{time(r.createdAt)}</td><td className="p-1">{r.task}</td><td className="p-1 truncate">{r.model}</td>
                  <td className="p-1">{r.inputTokens}/{r.outputTokens}</td><td className="p-1">${r.estimatedCost.toFixed(4)}</td>
                  <td className={`p-1 ${r.success ? "text-emerald-300" : "text-red-300"}`} title={r.error ?? ""}>{r.cached ? "cache" : r.success ? "ok" : "err"}</td>
                </tr>
              ))}
              {!runs.length && <tr><td className="p-1 text-slate-500">No LLM calls yet.</td></tr>}
            </tbody>
          </table>
        </Section>
        <Section title="Fetch history">
          <table className="w-full text-xs">
            <tbody>
              {fetches.map(({ log, name }) => (
                <tr key={log.id} className="border-t border-white/5">
                  <td className="p-1">{time(log.createdAt)}</td><td className="p-1">{name}</td>
                  <td className={`p-1 ${log.status === "ok" ? "text-emerald-300" : "text-red-300"}`} title={log.error ?? ""}>{log.status}</td>
                  <td className="p-1">{log.itemsNew}/{log.itemsFound} new</td><td className="p-1">{log.durationMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Prompt versions">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {prompts.map((p) => (
            <li key={`${p.key}-${p.version}`}><span className="font-mono text-xs">{p.key}-v{p.version}</span>{p.active && <span className="ml-1 text-xs text-emerald-300">active</span>} <span className="text-xs text-slate-500">— {p.description}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Prompts are defined in src/lib/prompts.ts and mirrored here for traceability.</p>
      </Section>
    </div>
  );
}
