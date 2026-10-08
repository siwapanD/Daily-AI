import Link from "next/link";
import { notFound } from "next/navigation";
import { getKnowledge } from "@/lib/services/knowledge";
import { KNOWLEDGE_STATUSES, label } from "@/lib/constants";
import { PageHeader, Badge, fmtDate } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { KnowledgeForm } from "@/components/knowledge-form";
import { SubmitButton } from "@/components/submit-button";
import { knowledgeStatusAction, deleteKnowledgeAction } from "../../actions";
import { Related } from "@/components/related";

export default async function KnowledgeItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const id = Number((await params).id);
  const k = Number.isInteger(id) ? await getKnowledge(id) : null;
  if (!k) notFound();
  const edit = (await searchParams).edit === "1";

  return (
    <div>
      <PageHeader title={k.title} subtitle={`${k.area} · updated ${fmtDate(k.updatedAt)}`}>
        <a href={`/api/knowledge/${k.id}/export`} className="btn">Export .md</a>
        {edit ? <Link href={`/knowledge/${k.id}`} className="btn">Cancel</Link> : <Link href={`/knowledge/${k.id}?edit=1`} className="btn">Edit</Link>}
        {k.articleId && <Link href={`/learn/${k.articleId}`} className="btn">Source discovery</Link>}
      </PageHeader>
      {edit ? <KnowledgeForm item={k} /> : (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="card lg:col-span-3"><Markdown>{k.contentMd || "_Empty_"}</Markdown></div>
          <aside className="space-y-4">
            <div className="card space-y-3">
              <div><span className="label">Status</span><Badge value={k.status} /></div>
              <form action={knowledgeStatusAction} className="flex gap-2">
                <input type="hidden" name="id" value={k.id} />
                <select name="status" defaultValue={k.status} className="input">
                  {KNOWLEDGE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </select>
                <SubmitButton className="btn btn-sm">Set</SubmitButton>
              </form>
              {k.tags.length > 0 && <div><span className="label">Tags</span><p className="flex flex-wrap gap-1">{k.tags.map((t) => <span key={t} className="rounded bg-white/5 px-1.5 text-xs text-slate-400">{t}</span>)}</p></div>}
            </div>
            <Related type="knowledge" id={k.id} />
            <form action={deleteKnowledgeAction} className="card">
              <input type="hidden" name="id" value={k.id} />
              <SubmitButton className="btn btn-sm text-red-300">Delete item</SubmitButton>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
