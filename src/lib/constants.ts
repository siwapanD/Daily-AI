export const CATEGORIES = [
  "MODEL", "CODING", "AGENT", "PROMPT", "CONTEXT", "MCP", "DEVOPS", "DATABASE", "SECURITY",
  "TESTING", "DEPLOYMENT", "PRODUCTION", "RAG", "AI_GATEWAY", "OBSERVABILITY", "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RECOMMENDATIONS = [
  "MUST_LEARN", "SHOULD_LEARN", "EXPERIMENT", "WATCH", "LOW_PRIORITY", "IGNORE",
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const KNOWLEDGE_STATUSES = [
  "NEW", "LEARNING", "TESTING", "VALIDATED", "ADOPTED", "WATCHING", "REJECTED", "OUTDATED",
] as const;

export const KNOWLEDGE_AREAS = [
  "Prompt Engineering", "Context Engineering", "Planning", "Task Decomposition", "Coding",
  "Agents", "Multi-Agent", "MCP", "Testing", "Security", "Database", "DevOps", "Deployment",
  "Production", "AI Gateway", "RAG", "Models", "Experiments",
] as const;

export const EXPERIMENT_DECISIONS = ["ADOPT", "WATCH", "REJECT", "RETEST"] as const;
export type ExperimentDecision = (typeof EXPERIMENT_DECISIONS)[number];
export const EXPERIMENT_STATUSES = ["planned", "running", "completed"] as const;

export const RADAR_RINGS = ["ADOPT", "TRIAL", "ASSESS", "WATCH", "HOLD"] as const;
export type RadarRing = (typeof RADAR_RINGS)[number];
export const RADAR_QUADRANTS = ["Models", "Tools", "Techniques", "Platforms"] as const;

export const WATCH_KINDS = ["technology", "repository", "model", "company", "framework", "feature"] as const;
export const SOURCE_TYPES = ["rss", "github", "web", "reddit", "youtube", "manual"] as const;
export const AUTHORITY_LEVELS = ["official", "technical", "community"] as const;
export const USER_ACTIONS = ["learn", "experiment", "watch", "ignore"] as const;

export const DEFAULT_METRICS = [
  "Completion Time", "Token Usage", "Cost", "Code Quality", "Test Pass Rate",
  "Human Intervention", "Retry Count",
];

/** Maps article categories to the most likely knowledge area. */
export const CATEGORY_TO_AREA: Record<Category, (typeof KNOWLEDGE_AREAS)[number]> = {
  MODEL: "Models", CODING: "Coding", AGENT: "Agents", PROMPT: "Prompt Engineering",
  CONTEXT: "Context Engineering", MCP: "MCP", DEVOPS: "DevOps", DATABASE: "Database",
  SECURITY: "Security", TESTING: "Testing", DEPLOYMENT: "Deployment", PRODUCTION: "Production",
  RAG: "RAG", AI_GATEWAY: "AI Gateway", OBSERVABILITY: "Production", OTHER: "Models",
};

export function label(value: string): string {
  return value.replace(/_/g, " ");
}
