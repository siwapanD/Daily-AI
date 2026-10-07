import Link from "next/link";
import { relatedTo } from "@/lib/services/embeddings";

/** "Related" box from semantic similarity (renders nothing until embeddings exist). */
export async function Related({ type, id }: { type: "article" | "knowledge"; id: number }) {
  const hits = await relatedTo(type, id, 6).catch(() => []);
  if (!hits.length) return null;
  return (
    <div className="card">
      <p className="h2">Related</p>
      <ul className="space-y-1.5 text-sm">
        {hits.map((h) => (
          <li key={`${h.type}-${h.id}`} className="flex gap-2">
            <span className="w-9 shrink-0 text-right font-mono text-xs text-slate-500" title="Similarity">{Math.round(h.score * 100)}%</span>
            <Link href={h.type === "article" ? `/learn/${h.id}` : `/knowledge/${h.id}`} className="line-clamp-2 hover:text-indigo-200">
              {h.type === "knowledge" && <span className="mr-1 text-[10px] text-emerald-300">KNOWLEDGE</span>}{h.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
