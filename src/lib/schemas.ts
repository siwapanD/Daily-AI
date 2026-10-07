import { z } from "zod";
import { AUTHORITY_LEVELS, SOURCE_TYPES, KNOWLEDGE_AREAS, KNOWLEDGE_STATUSES, EXPERIMENT_STATUSES } from "./constants";

export const sourceBody = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(SOURCE_TYPES),
  url: z.string().trim().min(1).max(2048),
  tier: z.number().int().min(1).max(3).optional(),
  authorityLevel: z.enum(AUTHORITY_LEVELS).optional(),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const knowledgeBody = z.object({
  title: z.string().trim().min(1).max(300),
  area: z.enum(KNOWLEDGE_AREAS),
  status: z.enum(KNOWLEDGE_STATUSES).default("NEW"),
  summary: z.string().max(2000).nullish(),
  contentMd: z.string().max(100_000).default(""),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const experimentBody = z.object({
  title: z.string().trim().min(1).max(300),
  technology: z.string().max(120).nullish(),
  problem: z.string().max(5000).optional(),
  hypothesis: z.string().max(5000).optional(),
  baseline: z.string().max(5000).optional(),
  newApproach: z.string().max(5000).optional(),
  setup: z.string().max(5000).optional(),
  steps: z.string().max(10000).optional(),
  metrics: z.array(z.string().max(60)).max(20).optional(),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  executionNotes: z.string().max(20000).optional(),
  problems: z.string().max(10000).optional(),
});
