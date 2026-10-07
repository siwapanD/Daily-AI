# Experiments

The Experiment Engine is how DAILY AI turns news into evidence.

## Lifecycle
1. **Create**: click *Experiment* on a discovery (the AI drafts it) or go to **Experiments → New**. Each experiment gets an ID like `EXP-2026-001`.
2. **Design**: problem, hypothesis, baseline, new approach, setup, steps, metrics.
3. **Run**: record one or more runs per variant (`baseline`, `new`, or any other label) with time, tokens, cost, quality (0-10), accuracy %, test pass %, human interventions and retries. Status becomes `running`.
4. **Benchmark**: the results table shows the mean per variant and the % change against `baseline`. Green means better (lower time/tokens/cost/interventions/retries, higher quality/accuracy/pass rate).
5. **Decide**: ADOPT, WATCH, REJECT or RETEST, plus a conclusion.

## Decision side effects
| Decision | Radar ring for the experiment's technology | Linked knowledge status |
|---|---|---|
| ADOPT | ADOPT | ADOPTED |
| WATCH | ASSESS | WATCHING |
| REJECT | HOLD | REJECTED |
| RETEST | TRIAL (experiment goes back to `planned`) | TESTING |

ADOPT with a **playbook rule** creates a new AI Engineering Playbook version (for example v1.0 → v1.1) that links back to the experiment.

## Example
```
EXP-2026-001  Claude Code Planning Workflow
Problem:     AI starts coding before understanding the architecture
Hypothesis:  A planning-first workflow reduces rework
Baseline:    Direct coding prompt
New method:  Research → Plan → Phase → Task → Code
Metrics:     Completion Time, Token Usage, Code Quality, Test Pass Rate, Human Intervention, Number of Fixes
Decision:    ADOPT → Playbook v1.1 "Added Planning-First Rule"
```

## Export
**Export .md** on an experiment (or `GET /api/experiments/:id/export`) produces Markdown you can commit to a repo, paste into `AGENTS.md`, or hand to Claude Code or Codex.
