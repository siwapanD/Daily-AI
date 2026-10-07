import type { Recommendation } from "../constants";

export interface ScoreInput {
  impact: number;
  novelty: number;
  reliability: number;
  relevance: number;
  experimentValue: number;
}

export const WEIGHTS = { impact: 0.25, novelty: 0.2, reliability: 0.2, relevance: 0.25, experimentValue: 0.1 };

export function dailyScore(s: ScoreInput, watchBoost = 0): number {
  const base =
    s.impact * WEIGHTS.impact +
    s.novelty * WEIGHTS.novelty +
    s.reliability * WEIGHTS.reliability +
    s.relevance * WEIGHTS.relevance +
    s.experimentValue * WEIGHTS.experimentValue;
  return Math.max(0, Math.min(100, Math.round(base + watchBoost)));
}

export function recommend(score: number, experimentValue: number): Recommendation {
  if (score >= 80) return "MUST_LEARN";
  if (score >= 65 && experimentValue >= 70) return "EXPERIMENT";
  if (score >= 65) return "SHOULD_LEARN";
  if (score >= 50) return "WATCH";
  if (score >= 30) return "LOW_PRIORITY";
  return "IGNORE";
}
