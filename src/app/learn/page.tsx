import Link from "next/link";
import { listKnowledge } from "@/lib/services/knowledge";
import { todayData } from "@/lib/services/discoveries";
import { PageHeader, Section, Empty, Badge, fmtDate } from "@/components/ui";
import { DiscoveryCard } from "@/components/discovery-card";

export default async function LearnPage() {
  const [learning, fresh, d] = await Promise.all([
    listKnowledge({ status: "LEARNING" }),
    listKnowledge({ status: "NEW" }),
    todayData(),
  ]);
  const queue = [...fresh, ...learning];
  return (
    <div>
      <PageHeader title="Learn" subtitle="Your learning queue. Click Learn on any discovery to generate a structured study note." />
      <Section title={`Learning queue (${queue.length})`}>
        {queue.length ? (
          <ul className="space-y-2">
            {queue.map((k) => (
              <li key={k.id} className="card flex flex-wrap items-center gap-3 py-3">
                <Badge value={k.status} />
                <Link href={`/knowledge/${k.id}`} className="flex-1 font-medium hover:text-indigo-200">{k.title}</Link>
                <span className="text-xs text-slate-500">{k.area} · {fmtDate(k.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>Queue is empty.</Empty>}
      </Section>
      <Section title="Suggested: Must Learn">
        {d.mustLearn.length ? <div className="space-y-3">{d.mustLearn.map((i) => <DiscoveryCard key={i.id} item={i} back="/learn" />)}</div> : <Empty>No must-learn items this week.</Empty>}
      </Section>
    </div>
  );
}
