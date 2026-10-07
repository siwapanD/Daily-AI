import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";

export const PLAYBOOK_V1 = `# AI Engineering Playbook v1.0

The standard workflow for building software with AI. Only practices validated by experiments are added.

## Workflow

1. **IDEA** — State the problem and the outcome in one paragraph.
2. **REQUIREMENT** — Write acceptance criteria before any code.
3. **RESEARCH** — Let the agent read the repository and relevant docs first; produce a project map.
4. **ARCHITECTURE** — Agree on components, data model and interfaces.
5. **PLAN** — Break work into phases with exit criteria.
6. **PHASE** — Work one phase at a time.
7. **TASK** — Each task has goal, files, dependencies, acceptance criteria and verification.
8. **IMPLEMENT** — Small diffs; follow existing conventions.
9. **TEST** — Run lint, typecheck and tests after every task.
10. **REVIEW** — Self-review the diff adversarially; then human review.
11. **SECURITY** — Validate input, never expose secrets, check dependencies.
12. **BUILD** — Production build must pass.
13. **DEPLOY** — Repeatable, scripted deploys with rollback.
14. **VERIFY** — Health check and smoke test in the target environment.
15. **OBSERVE** — Logs, errors and cost are monitored.

## Rules

- Never treat "new" as "adopt": every change to this playbook must come from an experiment.
`;

export async function listPlaybookVersions() {
  return db.select().from(schema.playbookVersions).orderBy(desc(schema.playbookVersions.createdAt));
}

export async function latestPlaybook() {
  const [p] = await db.select().from(schema.playbookVersions).orderBy(desc(schema.playbookVersions.createdAt)).limit(1);
  return p ?? null;
}

export function nextVersion(v: string): string {
  const [major, minor] = v.split(".").map(Number);
  return `${major || 1}.${(minor || 0) + 1}`;
}

/** Add a rule to the playbook as a new version (Experiment → Approved → Update Playbook → Version). */
export async function addPlaybookRule(rule: string, changelog: string, experimentId?: number) {
  const latest = await latestPlaybook();
  const base = latest?.contentMd ?? PLAYBOOK_V1;
  const version = latest ? nextVersion(latest.version) : "1.0";
  const content = base
    .replace(/^# AI Engineering Playbook v[\d.]+/m, `# AI Engineering Playbook v${version}`)
    .trimEnd() + `\n- ${rule.trim()}${experimentId ? ` _(validated by experiment #${experimentId})_` : ""}\n`;
  const [row] = await db.insert(schema.playbookVersions)
    .values({ version, contentMd: content, changelog, experimentId: experimentId ?? null })
    .returning();
  return row;
}

export async function getPlaybookVersion(version: string) {
  const [p] = await db.select().from(schema.playbookVersions).where(eq(schema.playbookVersions.version, version));
  return p ?? null;
}
