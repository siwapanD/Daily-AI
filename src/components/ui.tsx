import Link from "next/link";
import { label } from "@/lib/constants";

const REC_STYLE: Record<string, string> = {
  MUST_LEARN: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  SHOULD_LEARN: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  EXPERIMENT: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  WATCH: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  LOW_PRIORITY: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  IGNORE: "bg-slate-800 text-slate-500 border-slate-700",
  ADOPT: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  ADOPTED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  VALIDATED: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  TRIAL: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  TESTING: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  RETEST: "bg-violet-500/20 text-violet-200 border-violet-500/40",
  ASSESS: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  LEARNING: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  WATCHING: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  HOLD: "bg-red-500/15 text-red-200 border-red-500/40",
  REJECT: "bg-red-500/15 text-red-200 border-red-500/40",
  REJECTED: "bg-red-500/15 text-red-200 border-red-500/40",
  OUTDATED: "bg-slate-800 text-slate-500 border-slate-700",
};

export function Badge({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${REC_STYLE[value] ?? "border-white/15 bg-white/5 text-slate-300"} ${className}`}>
      {label(value)}
    </span>
  );
}

export function Score({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-slate-500">unscored</span>;
  const color = value >= 80 ? "text-rose-300" : value >= 65 ? "text-amber-300" : value >= 50 ? "text-sky-300" : "text-slate-400";
  return <span className={`font-mono text-lg font-bold ${color}`} title="DAILY AI score (0-100)">{value}</span>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-slate-500">{children}</p>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Pager({ page, total, pageSize, params }: { page: number; total: number; pageSize: number; params: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <div className="mt-4 flex items-center gap-3 text-sm text-slate-400">
      {page > 1 && <Link className="btn btn-sm" href={href(page - 1)}>← Prev</Link>}
      <span>Page {page} / {pages} · {total} items</span>
      {page < pages && <Link className="btn btn-sm" href={href(page + 1)}>Next →</Link>}
    </div>
  );
}
