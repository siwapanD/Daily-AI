/**
 * Versioned prompt registry. The code is the source of truth; prompts are mirrored into the
 * `prompts` / `prompt_versions` tables by the seed so every `llm_runs` row can be traced to a version.
 * To change a prompt: add a new version entry, bump `active`, keep the old one for benchmarking.
 */
export interface PromptDef {
  key: string;
  description: string;
  active: number;
  versions: Record<number, { system: string; user: string }>;
}

const CATS = "MODEL, CODING, AGENT, PROMPT, CONTEXT, MCP, DEVOPS, DATABASE, SECURITY, TESTING, DEPLOYMENT, PRODUCTION, RAG, AI_GATEWAY, OBSERVABILITY, OTHER";

const CONTEXT = `You work for DAILY AI, a personal R&D system that helps a software engineer get better at using AI to build software.
Focus: AI coding tools, agents, MCP, prompt/context engineering, models for coding, AI infrastructure, and AI in the SDLC.
Be skeptical of hype. Prefer concrete, verifiable statements. Never invent facts that are not in the item.`;

export const PROMPTS: Record<string, PromptDef> = {
  "importance-classifier": {
    key: "importance-classifier",
    description: "Cheap model: classify an item and score its importance for AI software engineering.",
    active: 1,
    versions: {
      1: {
        system: `${CONTEXT}
Classify the item and score it. Respond with ONLY a JSON object:
{"categories": string[] (1-4 of: ${CATS}),
 "impact": 0-100, "novelty": 0-100, "relevance": 0-100, "experimentValue": 0-100,
 "technology": string|null (main product/technology name, e.g. "Claude Code", "MCP")}
impact = how much this changes how engineers build software with AI. relevance = relevance to AI-assisted software engineering (unrelated news < 20). experimentValue = how worthwhile a hands-on experiment would be.`,
        user: `Title: {{title}}\nSource: {{source}}\nPublished: {{published}}\n\n{{content}}`,
      },
    },
  },
  "daily-analysis": {
    key: "daily-analysis",
    description: "Strong model: deep analysis of an important item.",
    active: 1,
    versions: {
      1: {
        system: `${CONTEXT}
Analyze the item for a busy senior engineer. Respond with ONLY a JSON object:
{"summary": string (2-3 sentences, what actually changed),
 "whyItMatters": string (1-2 sentences, impact on an AI-assisted engineering workflow),
 "technology": {"name": string, "vendor": string|null, "category": one of ${CATS}} | null,
 "categories": string[],
 "impact": 0-100, "novelty": 0-100, "relevance": 0-100, "experimentValue": 0-100,
 "experimentIdea": string|null (one concrete experiment comparing a baseline to this),
 "workflowImprovement": string|null (one concrete change to adopt if it proves out),
 "hype": boolean (true if mostly marketing with little substance)}`,
        user: `Title: {{title}}\nSource: {{source}} (reliability {{reliability}}/100)\nPublished: {{published}}\nURL: {{url}}\n\n{{content}}`,
      },
    },
  },
  "knowledge-summary": {
    key: "knowledge-summary",
    description: "Learn module: turn an item into a structured study note (markdown).",
    active: 1,
    versions: {
      1: {
        system: `${CONTEXT}
Write a concise study note in GitHub-flavored Markdown with exactly these level-2 headings, in order:
## What is it?
## Why does it matter?
## How does it work?
## What's new?
## What changed?
## Advantages
## Limitations
## Use cases
## Risks
## Example
## How we can use it
## Should we test it?
Use bullet points where natural. If the source does not say something, write "Unknown from source" rather than guessing. End "Should we test it?" with a one-line verdict: YES / MAYBE / NO and why.`,
        user: `Title: {{title}}\nSource: {{source}}\nURL: {{url}}\n\n{{content}}`,
      },
    },
  },
  "experiment-generator": {
    key: "experiment-generator",
    description: "Draft an experiment (baseline vs new approach) from an item.",
    active: 1,
    versions: {
      1: {
        system: `${CONTEXT}
Design a small, cheap (< 2 hours), measurable experiment that tests whether the item improves an AI-assisted software engineering workflow versus a baseline. Respond with ONLY a JSON object:
{"title": string, "technology": string, "problem": string, "hypothesis": string,
 "baseline": string, "newApproach": string, "setup": string, "steps": string (numbered list as markdown),
 "metrics": string[] (pick from: Completion Time, Token Usage, Cost, Code Quality, Test Pass Rate, Human Intervention, Retry Count, Accuracy)}`,
        user: `Title: {{title}}\nSummary: {{summary}}\n\n{{content}}`,
      },
    },
  },
  "digest-summary": {
    key: "digest-summary",
    description: "Write the opening paragraph of the daily digest.",
    active: 1,
    versions: {
      1: {
        system: `${CONTEXT}
Write 3-5 sentences (plain text, no headings) summarizing what matters today for an engineer using AI to build software, and name the single most valuable experiment to run today. Only use the items given.`,
        user: `{{items}}`,
      },
    },
  },
};

export function promptVersionId(key: string): string {
  const p = PROMPTS[key];
  return `${key}-v${p.active}`;
}

/** A concrete prompt version (from code, or created in the UI and stored in the DB). */
export interface ResolvedPrompt {
  version: number;
  system: string;
  user: string;
}

export function renderPrompt(
  key: string,
  vars: Record<string, string | number | null | undefined>,
  override?: ResolvedPrompt | null,
) {
  const p = PROMPTS[key];
  const v = override ?? { version: p.active, ...p.versions[p.active] };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
  return { system: fill(v.system), user: fill(v.user), version: `${key}-v${v.version}` };
}

/** DB templates are stored as "SYSTEM:\n…\n\nUSER:\n…". */
export function formatTemplate(system: string, user: string): string {
  return `SYSTEM:\n${system}\n\nUSER:\n${user}`;
}

export function parseTemplate(template: string): { system: string; user: string } {
  const m = template.match(/^SYSTEM:\n([\s\S]*?)\n\nUSER:\n([\s\S]*)$/);
  return m ? { system: m[1], user: m[2] } : { system: template, user: "{{content}}" };
}
