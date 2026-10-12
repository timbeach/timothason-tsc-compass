import { expect, test } from "vitest";
import { bootstrapCI, mean, mrr, ndcgAtK, recallAtK } from "../../eval/metrics";

test("mrr and recall", () => {
  expect(mrr(["x", "a", "b"], new Set(["a"]))).toBeCloseTo(0.5);
  expect(mrr(["x"], new Set(["a"]))).toBe(0);
  expect(recallAtK(["a", "x", "b"], new Set(["a", "b", "c"]), 2)).toBeCloseTo(1 / 3);
});

test("ndcg: perfect order is 1, reversed is lower, no relevant is 0", () => {
  const g = new Map([["a", 2], ["b", 1]]);
  expect(ndcgAtK(["a", "b", "c"], g, 3)).toBeCloseTo(1);
  expect(ndcgAtK(["c", "b", "a"], g, 3)).toBeLessThan(1);
  expect(ndcgAtK(["c"], new Map(), 3)).toBe(0);
});

test("bootstrapCI brackets the mean and is deterministic", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i % 10);
  const [lo, hi] = bootstrapCI(xs, 500, 1);
  expect(lo).toBeLessThan(mean(xs)); expect(hi).toBeGreaterThan(mean(xs));
  expect(bootstrapCI(xs, 500, 1)).toEqual([lo, hi]);
});

import { formatCI } from "../../eval/metrics";
test("formatCI reports n/a for empty input instead of NaN (codex #6)", () => {
  expect(formatCI([])).toBe("n/a");
  expect(formatCI([1, 1, 1])).toBe("1.000 [1.000, 1.000]");
});
