import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  date,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").$type<"rss" | "github" | "web" | "manual">().notNull(),
  url: text("url").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
  tier: integer("tier").notNull().default(2),
  authorityLevel: text("authority_level").notNull().default("technical"),
  reliabilityScore: integer("reliability_score").notNull().default(70),
  enabled: boolean("enabled").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("sources_type_url_idx").on(t.type, t.url)]);

export const technologies = pgTable("technologies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull().default("OTHER"),
  vendor: text("vendor"),
  description: text("description"),
  url: text("url"),
  createdAt: createdAt(),
});

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sources.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title").notNull(),
  titleHash: text("title_hash").notNull(),
  contentHash: text("content_hash"),
  author: text("author"),
  excerpt: text("excerpt"),
  content: text("content"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").$type<"new" | "classified" | "analyzed" | "error">().notNull().default("new"),
  impactScore: integer("impact_score"),
  noveltyScore: integer("novelty_score"),
  reliabilityScore: integer("reliability_score"),
  relevanceScore: integer("relevance_score"),
  experimentValue: integer("experiment_value"),
  watchBoost: integer("watch_boost").notNull().default(0),
  dailyScore: integer("daily_score"),
  recommendation: text("recommendation"),
  summary: text("summary"),
  whyItMatters: text("why_it_matters"),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  analyzedBy: text("analyzed_by"),
  technologyId: integer("technology_id").references(() => technologies.id, { onDelete: "set null" }),
  userAction: text("user_action"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("articles_canonical_url_idx").on(t.canonicalUrl),
  index("articles_title_hash_idx").on(t.titleHash),
  index("articles_score_idx").on(t.dailyScore),
  index("articles_published_idx").on(t.publishedAt),
  index("articles_status_idx").on(t.status),
]);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const articleTags = pgTable("article_tags", {
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.articleId, t.tagId] })]);

export const knowledgeItems = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  area: text("area").notNull().default("Models"),
  status: text("status").notNull().default("NEW"),
  summary: text("summary"),
  contentMd: text("content_md").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  articleId: integer("article_id").references(() => articles.id, { onDelete: "set null" }),
  technologyId: integer("technology_id").references(() => technologies.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("knowledge_area_idx").on(t.area)]);

export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  technology: text("technology"),
  technologyId: integer("technology_id").references(() => technologies.id, { onDelete: "set null" }),
  articleId: integer("article_id").references(() => articles.id, { onDelete: "set null" }),
  knowledgeItemId: integer("knowledge_item_id").references(() => knowledgeItems.id, { onDelete: "set null" }),
  problem: text("problem").notNull().default(""),
  hypothesis: text("hypothesis").notNull().default(""),
  baseline: text("baseline").notNull().default(""),
  newApproach: text("new_approach").notNull().default(""),
  setup: text("setup").notNull().default(""),
  steps: text("steps").notNull().default(""),
  metrics: text("metrics").array().notNull().default(sql`'{}'::text[]`),
  status: text("status").notNull().default("planned"),
  executionNotes: text("execution_notes").notNull().default(""),
  problems: text("problems").notNull().default(""),
  conclusion: text("conclusion").notNull().default(""),
  decision: text("decision"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experimentResults = pgTable("experiment_results", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
  variant: text("variant").notNull(),
  timeMinutes: real("time_minutes"),
  tokens: integer("tokens"),
  costUsd: real("cost_usd"),
  quality: real("quality"),
  accuracy: real("accuracy"),
  testPassRate: real("test_pass_rate"),
  humanInterventions: integer("human_interventions"),
  retries: integer("retries"),
  notes: text("notes"),
  extra: jsonb("extra").$type<Record<string, number>>().notNull().default({}),
  createdAt: createdAt(),
});

export const radarItems = pgTable("radar_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  ring: text("ring").notNull().default("ASSESS"),
  quadrant: text("quadrant").notNull().default("Tools"),
  rationale: text("rationale").notNull().default(""),
  technologyId: integer("technology_id").references(() => technologies.id, { onDelete: "set null" }),
  experimentId: integer("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const watchItems = pgTable("watch_items", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("technology"),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  boost: integer("boost").notNull().default(15),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const dailyDigests = pgTable("daily_digests", {
  id: serial("id").primaryKey(),
  digestDate: date("digest_date").notNull().unique(),
  title: text("title").notNull(),
  contentMd: text("content_md").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  generatedBy: text("generated_by"),
  createdAt: createdAt(),
});

export const prompts = pgTable("prompts", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: createdAt(),
});

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  promptId: integer("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  template: text("template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("prompt_versions_unique").on(t.promptId, t.version)]);

export const llmRuns = pgTable("llm_runs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  task: text("task").notNull(),
  promptVersion: text("prompt_version"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  success: boolean("success").notNull(),
  cached: boolean("cached").notNull().default(false),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("llm_runs_created_idx").on(t.createdAt)]);

export const llmCache = pgTable("llm_cache", {
  key: text("key").primaryKey(),
  response: jsonb("response").$type<{ text: string; inputTokens: number; outputTokens: number }>().notNull(),
  createdAt: createdAt(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: updatedAt(),
});

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
});

export const fetchLogs = pgTable("fetch_logs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => sources.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  itemsFound: integer("items_found").notNull().default(0),
  itemsNew: integer("items_new").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
});

export const playbookVersions = pgTable("playbook_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(),
  contentMd: text("content_md").notNull(),
  changelog: text("changelog").notNull().default(""),
  experimentId: integer("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export type Source = typeof sources.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type ExperimentResult = typeof experimentResults.$inferSelect;
export type RadarItem = typeof radarItems.$inferSelect;
export type WatchItem = typeof watchItems.$inferSelect;
export type DailyDigest = typeof dailyDigests.$inferSelect;
export type Technology = typeof technologies.$inferSelect;
