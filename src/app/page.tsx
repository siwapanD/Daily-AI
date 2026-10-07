import Link from "next/link";
import { todayData } from "@/lib/services/discoveries";
import { latestPlaybook } from "@/lib/services/playbook";
import { tokensUsedToday } from "@/lib/llm";
import { env } from "@/lib/env";
import { DiscoveryCard, JobButtons } from "@/components/discovery-card";
import { Section, Empty, Badge, Score, PageHeader } from "@/components/ui";
import type { DiscoveryRow } from "@/lib/services/discoveries";

function MiniList({ items }: { items: DiscoveryRow[] }) {
  if (!items.length) return <Empty>Nothing this week.</Empty>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-2 text-sm">
          <span className="w-7 shrink-0 text-right font-mono text-slate-400">{i.dailyScore ?? "–"}</span>
          <Link href={`/learn/${i.id}`} className="line-clamp-2 hover:text-indigo-200">{i.title}</Link>
        </li>
      ))}
    </ul>
  );
}

export default async function TodayPage() {
  const [d, playbook, usage] = await Promise.all([todayData(), latestPlaybook(), tokensUsedToday()]);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const llmMode = env.llm.provider === "heuristic" ? "heuristic (no LLM configured)" : env.llm.provider;

  return (
    <div>
      <PageHeader title="DAILY AI" subtitle={`${today} · ${d.stats.today} new today · ${d.stats.pending} pending analysis · AI: ${llmMode} · ${usage.tokens.toLocaleString()} tokens ($${usage.cost.toFixed(3)}) today`}>
        <JobButtons />
      </PageHeader>

      {d.stats.total === 0 && (
        <div className="card mb-8 border-indigo-500/40">
          <p className="font-semibold">Welcome. Your database is empty.</p>
          <p className="mt-1 text-sm text-slate-400">Click <b>Fetch Now</b> to collect from the default sources, then <b>Analyze Now</b>. Manage sources in <Link className="link" href="/settings">Settings</Link>.</p>
        </div>
      )}

      <Section title="Top Discoveries" action={<Link href="/discover" className="link text-xs">All discoveries →</Link>}>
        {d.top.length ? <div className="space-y-3">{d.top.map((i) => <DiscoveryCard key={i.id} item={i} />)}</div> : <Empty>No analyzed discoveries yet.</Empty>}
      </Section>

      <div className="grid gap-x-8 md:grid-cols-2">
        <Section title="Must Learn">
          {d.mustLearn.length ? <div className="space-y-3">{d.mustLearn.map((i) => <DiscoveryCard key={i.id} item={i} compact />)}</div> : <Empty>Nothing marked must-learn this week.</Empty>}
        </Section>

        <Section title="Experiment Today" action={<Link href="/experiments" className="link text-xs">Experiments →</Link>}>
          {d.experimentsActive.length > 0 && (
            <ul className="mb-3 space-y-2">
              {d.experimentsActive.map((e) => (
                <li key={e.id} className="card flex items-center gap-2 py-2 text-sm">
                  <span className="font-mono text-xs text-slate-400">{e.code}</span>
                  <Link href={`/experiments/${e.id}`} className="flex-1 hover:text-indigo-200">{e.title}</Link>
                  <Badge value={e.status.toUpperCase()} />
                </li>
              ))}
            </ul>
          )}
          {d.experiment.length ? <div className="space-y-3">{d.experiment.map((i) => <DiscoveryCard key={i.id} item={i} compact />)}</div> : <Empty>No experiment candidates this week.</Empty>}
        </Section>
      </div>

      <div className="grid gap-x-8 md:grid-cols-3">
        <Section title="New Models"><MiniList items={d.models} /></Section>
        <Section title="AI Coding Features"><MiniList items={d.coding} /></Section>
        <Section title="Important Releases"><MiniList items={d.releases} /></Section>
      </div>

      <div className="grid gap-x-8 md:grid-cols-2">
        <Section title="Watch" action={<Link href="/watch" className="link text-xs">Watch list →</Link>}>
          <MiniList items={d.watch} />
        </Section>

        <Section title="Workflow Improvement" action={<Link href="/knowledge/playbook" className="link text-xs">Playbook →</Link>}>
          <div className="space-y-2 text-sm">
            {playbook && <p className="text-slate-400">Current playbook: <Link className="link" href="/knowledge/playbook">v{playbook.version}</Link> — {playbook.changelog}</p>}
            {d.adopted.map((e) => (
              <p key={e.id}><Badge value="ADOPT" /> <Link className="link" href={`/experiments/${e.id}`}>{e.code} {e.title}</Link></p>
            ))}
            {d.workflow.map((i) => (
              <div key={i.id} className="card py-2">
                <div className="flex items-center gap-2"><Score value={i.dailyScore} /><Link href={`/learn/${i.id}`} className="font-medium hover:text-indigo-200">{i.title}</Link></div>
                <p className="mt-1 text-slate-300">{(i.analysis as { workflowImprovement?: string }).workflowImprovement}</p>
              </div>
            ))}
            {!d.adopted.length && !d.workflow.length && <Empty>Adopt experiments to improve the workflow. Workflow suggestions appear when an LLM provider is configured.</Empty>}
          </div>
        </Section>
      </div>
    </div>
  );
}
