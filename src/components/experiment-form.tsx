import { EXPERIMENT_STATUSES, DEFAULT_METRICS } from "@/lib/constants";
import type { Experiment } from "@/lib/db/schema";
import { saveExperimentAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";

function Area({ name, label, value, rows = 3, placeholder }: { name: string; label: string; value?: string | null; rows?: number; placeholder?: string }) {
  return (
    <div><label className="label">{label}</label><textarea name={name} rows={rows} defaultValue={value ?? ""} placeholder={placeholder} className="input" /></div>
  );
}

export function ExperimentForm({ exp }: { exp?: Experiment }) {
  return (
    <form action={saveExperimentAction} className="card space-y-3">
      {exp && <input type="hidden" name="id" value={exp.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className="label">Title</label><input name="title" required defaultValue={exp?.title} className="input" placeholder="Claude Code Planning Workflow" /></div>
        <div><label className="label">Technology</label><input name="technology" defaultValue={exp?.technology ?? ""} className="input" placeholder="Claude Code" /></div>
      </div>
      <Area name="problem" label="Problem" value={exp?.problem} placeholder="AI starts coding before understanding the architecture" />
      <Area name="hypothesis" label="Hypothesis" value={exp?.hypothesis} placeholder="A planning-first workflow reduces rework" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Area name="baseline" label="Baseline" value={exp?.baseline} placeholder="Direct coding prompt" />
        <Area name="newApproach" label="New approach" value={exp?.newApproach} placeholder="Research → Plan → Phase → Task → Code" />
      </div>
      <Area name="setup" label="Setup" value={exp?.setup} />
      <Area name="steps" label="Steps (Markdown)" value={exp?.steps} rows={5} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className="label">Metrics (comma separated)</label>
          <input name="metrics" defaultValue={(exp?.metrics.length ? exp.metrics : DEFAULT_METRICS).join(", ")} className="input" /></div>
        <div><label className="label">Status</label>
          <select name="status" defaultValue={exp?.status ?? "planned"} className="input">{EXPERIMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      {exp && (
        <>
          <Area name="executionNotes" label="Execution notes (Markdown)" value={exp.executionNotes} rows={5} />
          <Area name="problems" label="Problems encountered" value={exp.problems} />
        </>
      )}
      <SubmitButton className="btn-primary">Save experiment</SubmitButton>
    </form>
  );
}
