"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/", "Today"], ["/discover", "Discover"], ["/learn", "Learn"], ["/experiments", "Experiments"],
  ["/knowledge", "Knowledge"], ["/radar", "Radar"], ["/watch", "Watch"], ["/digest", "Digest"], ["/settings", "Settings"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0d12]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-3">
        <Link href="/" className="shrink-0 text-sm font-black tracking-[0.2em] text-indigo-300">DAILY AI</Link>
        <nav className="flex gap-1">
          {ITEMS.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`shrink-0 rounded-md px-2.5 py-1 text-sm ${active ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-100"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <form action="/search" className="ml-auto hidden md:block">
          <input name="q" placeholder="Search…" className="input w-44" aria-label="Search" />
        </form>
      </div>
    </header>
  );
}
