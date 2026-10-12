import { expect, test } from "vitest";
import { choleskySolve, cvRidge, fitRidge, pearson, projectStance, spearman, stanceDistance, type AxisModel } from "../../core/stance";
import { mulberry32 } from "../../core/random";

test("spearman handles ties and monotone transforms", () => {
  expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
  expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  expect(spearman([1, 1, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1);
  expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
});

test("choleskySolve solves a SPD system", () => {
  const A = new Float64Array([4, 2, 2, 3]);
  const x = choleskySolve(A, 2, new Float64Array([2, 1]));
  expect(x[0]).toBeCloseTo(0.5); expect(x[1]).toBeCloseTo(0);
});

function synth(n: number, d: number, seed: number) {
  const rnd = mulberry32(seed);
  const wTrue = Array.from({ length: d }, (_, i) => (i < 3 ? 1 : 0));
  const X = Array.from({ length: n }, () => new Float32Array(Array.from({ length: d }, () => rnd() - 0.5)));
  const y = X.map((x) => x.reduce((s, v, i) => s + v * wTrue[i], 0) * 4 + (rnd() - 0.5) * 0.1);
  return { X, y };
}

test("fitRidge recovers a linear signal", () => {
  const { X, y } = synth(200, 8, 3);
  const { w, b } = fitRidge(X, y, 0.01);
  expect(w[0]).toBeCloseTo(4, 0); expect(w[5]).toBeCloseTo(0, 0); expect(Math.abs(b)).toBeLessThan(0.2);
});

test("cvRidge reports high spearman on signal, near zero on noise", () => {
  const { X, y } = synth(200, 8, 4);
  expect(cvRidge(X, y, [0.01, 1, 10]).spearman).toBeGreaterThan(0.9);
  const rnd = mulberry32(9);
  const noise = y.map(() => rnd());
  expect(Math.abs(cvRidge(X, noise, [0.01, 1, 10]).spearman)).toBeLessThan(0.3);
});

const model = (axis: AxisModel["axis"], auto: boolean): AxisModel =>
  ({ axis, w: [1, 0], b: 0, lambda: 1, n: 50, cvSpearman: 0.8, cvR2: 0.5, humanSpearman: 0.7, auto });

test("projectStance: auto axes project and clamp, sliders override, non-auto axes need a slider", () => {
  const models = [model("ontology", true), model("mechanism", false), model("evidence", true), model("scope", true)];
  const u = projectStance(models, new Float32Array([5, 0]), { evidence: -1, scope: null });
  expect(u).toEqual({ ontology: 2, mechanism: null, evidence: -1, scope: null });
  expect(projectStance(models, new Float32Array([5, 0]), { mechanism: 1 }).mechanism).toBe(1);
});

test("stanceDistance uses only shared non-null axes", () => {
  const u = { ontology: 2, mechanism: null, evidence: 0, scope: -2 };
  const d = { ontology: -2, mechanism: 1, evidence: null, scope: -2 };
  const { s, shared } = stanceDistance(u, d);
  expect(shared).toEqual(["ontology", "scope"]);
  expect(s).toBeCloseTo(Math.sqrt((16 + 0) / 2) / 4);
  expect(stanceDistance(u, { ontology: null, mechanism: null, evidence: null, scope: null }).s).toBeNull();
});

test("stanceDistance respects the eligible filter", () => {
  const u = { ontology: 2, mechanism: 2, evidence: null, scope: null };
  const d = { ontology: -2, mechanism: 2, evidence: null, scope: null };
  const r = stanceDistance(u, d, (a) => a !== "ontology");
  expect(r.shared).toEqual(["mechanism"]);
  expect(r.s).toBe(0);
});
