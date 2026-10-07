import Link from "next/link";
import { Badge, Score, fmtDate } from "./ui";
import { SubmitButton } from "./submit-button";
import { discoveryAction, fetchNowAction, analyzeNowAction, digestNowAction } from "@/app/actions";
import type { DiscoveryRow } from "@/lib/services/discoveries";

function ActionButton({ id, action, back, children, primary }: { id: number; action: string; back: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={discoveryAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton className={`${primary ? "btn-primary" : "btn"} btn-sm`}>{children}</SubmitButton>
    </form>
  );
}

export function DiscoveryCard({ item, back = "/", compact = false }: { item: DiscoveryRow; back?: string; compact?: boolean }) {
  const a = (item.analysis ?? {}) as { categories?: string[]; watch?: string[]; hype?: boolean; technology?: string };
  return (
    <article className="card flex gap-4">
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5">
        <Score value={item.dailyScore} />
        {item.watchBoost > 0 && <span className="text-[10px] text-sky-300" title="Watch list boost">+{item.watchBoost}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge value={item.recommendation} />
          {(a.categories ?? []).filter((c) => c !== "OTHER").map((c) => (
            <span key={c} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{c}</span>
          ))}
          {a.hype && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-300">HYPE?</span>}
          {(a.watch ?? []).length > 0 && <span className="text-[10px] text-sky-300">👁 {a.watch!.join(", ")}</span>}
        </div>
        <h3 className="font-semibold leading-snug">
          <Link href={`/learn/${item.id}`} className="hover:text-indigo-200">{item.title}</Link>
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {item.sourceName ?? "manual"} · {fmtDate(item.publishedAt ?? item.fetchedAt)}
          {a.technology && <> · {a.technology}</>}
          {" · "}<a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="link">source ↗</a>
        </p>
        {!compact && (item.summary || item.excerpt) && (
          <p className="mt-2 line-clamp-3 text-sm text-slate-300">{item.summary ?? item.excerpt}</p>
        )}
        {!compact && item.whyItMatters && (
          <p className="mt-1 text-sm text-indigo-200/80"><span className="font-semibold">Why it matters: </span>{item.whyItMatters}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ActionButton id={item.id} action="learn" back={back} primary>Learn</ActionButton>
          <ActionButton id={item.id} action="experiment" back={back}>Experiment</ActionButton>
          <ActionButton id={item.id} action="watch" back={back}>Watch</ActionButton>
          <ActionButton id={item.id} action="ignore" back={back}>Ignore</ActionButton>
          {item.userAction && <span className="self-center text-xs text-slate-500">· {item.userAction}</span>}
        </div>
      </div>
    </article>
  );
}

export function JobButtons({ back = "/" }: { back?: string }) {
  return (
    <>
      <form action={fetchNowAction}>
        <input type="hidden" name="back" value={back} />
        <SubmitButton pendingText="Fetching…">Fetch Now</SubmitButton>
      </form>
      <form action={analyzeNowAction}>
        <input type="hidden" name="back" value={back} />
        <SubmitButton pendingText="Analyzing…">Analyze Now</SubmitButton>
      </form>
      <form action={digestNowAction}>
        <input type="hidden" name="back" value="/digest" />
        <SubmitButton pendingText="Generating…">Generate Digest</SubmitButton>
      </form>
    </>
  );
}
