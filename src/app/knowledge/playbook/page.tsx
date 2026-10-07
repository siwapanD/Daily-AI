import { listPlaybookVersions } from "@/lib/services/playbook";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/submit-button";
import { addPlaybookRuleAction } from "../../actions";

export default async function PlaybookPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const versions = await listPlaybookVersions();
  const v = (await searchParams).v;
  const current = versions.find((p) => p.version === v) ?? versions[0];
  return (
    <div>
      <PageHeader title="AI Engineering Playbook" subtitle="Evolves only through validated experiments (ADOPT → new version).">
        {current && <a className="btn" href={`/api/playbook/export?v=${current.version}`}>Export .md</a>}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="card lg:col-span-3">{current ? <Markdown>{current.contentMd}</Markdown> : <p>No playbook yet.</p>}</div>
        <aside className="space-y-4">
          <Section title="Versions">
            <ul className="space-y-2 text-sm">
              {versions.map((p) => (
                <li key={p.id}>
                  <a href={`?v=${p.version}`} className={p.version === current?.version ? "font-bold text-white" : "link"}>v{p.version}</a>
                  <span className="text-xs text-slate-500"> · {fmtDate(p.createdAt)}</span>
                  <p className="text-xs text-slate-400">{p.changelog}</p>
                </li>
              ))}
            </ul>
          </Section>
          <form action={addPlaybookRuleAction} className="card space-y-2">
            <p className="h2">Add rule manually</p>
            <textarea name="rule" required rows={3} placeholder="e.g. Every task must include acceptance criteria." className="input" />
            <input name="changelog" placeholder="Changelog note" className="input" />
            <SubmitButton className="btn btn-sm">Create new version</SubmitButton>
            <p className="text-xs text-slate-500">Prefer adding rules from an ADOPTED experiment.</p>
          </form>
        </aside>
      </div>
    </div>
  );
}
