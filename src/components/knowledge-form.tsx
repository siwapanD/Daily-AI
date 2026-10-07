import { KNOWLEDGE_AREAS, KNOWLEDGE_STATUSES, label } from "@/lib/constants";
import type { KnowledgeItem } from "@/lib/db/schema";
import { saveKnowledgeAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";

export function KnowledgeForm({ item }: { item?: KnowledgeItem }) {
  return (
    <form action={saveKnowledgeAction} className="card space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div><label className="label">Title</label><input name="title" required defaultValue={item?.title} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Area</label>
          <select name="area" defaultValue={item?.area ?? "Coding"} className="input">{KNOWLEDGE_AREAS.map((a) => <option key={a}>{a}</option>)}</select></div>
        <div><label className="label">Status</label>
          <select name="status" defaultValue={item?.status ?? "NEW"} className="input">{KNOWLEDGE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <div><label className="label">Tags (comma separated)</label><input name="tags" defaultValue={item?.tags.join(", ")} className="input" /></div>
      </div>
      <div><label className="label">Summary</label><input name="summary" defaultValue={item?.summary ?? ""} className="input" /></div>
      <div><label className="label">Content (Markdown)</label>
        <textarea name="contentMd" rows={20} defaultValue={item?.contentMd} className="input font-mono text-xs" /></div>
      <SubmitButton className="btn-primary">Save</SubmitButton>
    </form>
  );
}
