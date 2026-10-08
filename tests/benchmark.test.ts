import { describe, it, expect } from "vitest";
import { scoreAnswer, benchmarkConfigSchema, exampleBenchmark } from "@/lib/services/benchmark";

describe("scoreAnswer", () => {
  it("contains / exact / regex", () => {
    expect(scoreAnswer("Use RETURNING *", { expected: "returning", match: "contains" })).toBe(true);
    expect(scoreAnswer("`RETURNING`.", { expected: "returning", match: "exact" })).toBe(true);
    expect(scoreAnswer("RETURNING id", { expected: "returning", match: "exact" })).toBe(false);
    expect(scoreAnswer("year: 2026", { expected: "\\b\\d{4}\\b", match: "regex" })).toBe(true);
    expect(scoreAnswer("anything", { expected: "(", match: "regex" })).toBe(false); // invalid regex never passes
  });
});

describe("benchmark config", () => {
  it("accepts the example and applies defaults", () => {
    const c = benchmarkConfigSchema.parse(exampleBenchmark("cheap", "strong"));
    expect(c.variants.map((v) => v.model)).toEqual(["cheap", "strong"]);
    expect(benchmarkConfigSchema.parse({ variants: [{ label: "a", model: "m" }], cases: [{ input: "x", expected: "y" }] }).cases[0].match).toBe("contains");
  });
  it("rejects bad configs", () => {
    const v = [{ label: "a", model: "m" }];
    expect(() => benchmarkConfigSchema.parse({ variants: [...v, ...v], cases: [{ input: "x", expected: "y" }] })).toThrow(/unique/);
    expect(() => benchmarkConfigSchema.parse({ variants: v, cases: [{ input: "x" }] })).toThrow(/expected/);
    expect(() => benchmarkConfigSchema.parse({
      variants: Array.from({ length: 6 }, (_, i) => ({ label: `v${i}`, model: "m" })),
      cases: Array.from({ length: 21 }, () => ({ input: "x", expected: "y" })),
    })).toThrow(/120 calls/);
  });
});
