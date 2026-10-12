import { describe, expect, test } from "vitest";
import { dot, l2normalize, meanVec, quantile, row, zscore } from "../../core/vec";
import { mulberry32, shuffle } from "../../core/random";

describe("vec", () => {
  test("dot and normalize", () => {
    const v = l2normalize(new Float32Array([3, 4]));
    expect(v[0]).toBeCloseTo(0.6); expect(v[1]).toBeCloseTo(0.8);
    expect(dot(v, v)).toBeCloseTo(1);
  });
  test("normalize zero vector stays zero", () => {
    expect(Array.from(l2normalize(new Float32Array([0, 0])))).toEqual([0, 0]);
  });
  test("meanVec", () => {
    expect(Array.from(meanVec([new Float32Array([1, 3]), new Float32Array([3, 5])]))).toEqual([2, 4]);
  });
  test("row slices a flat matrix", () => {
    const m = new Float32Array([1, 2, 3, 4, 5, 6]);
    expect(Array.from(row(m, 3, 1))).toEqual([4, 5, 6]);
  });
  test("zscore with constant input returns zeros", () => {
    expect(Array.from(zscore([2, 2, 2]))).toEqual([0, 0, 0]);
  });
  test("zscore has mean 0", () => {
    const z = zscore([1, 2, 3, 4]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
  test("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.7)).toBeCloseTo(7);
  });
});

describe("random", () => {
  test("mulberry32 is deterministic", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  test("shuffle is a permutation and does not mutate input", () => {
    const xs = [1, 2, 3, 4, 5];
    const s = shuffle(xs, mulberry32(1));
    expect([...s].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5]);
  });
});
