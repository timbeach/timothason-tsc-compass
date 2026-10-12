import { expect, test } from "vitest";
import { mulberry32 } from "../../core/random";
import { fitAxisModels } from "../../pipeline/axes";
import { computeLayout } from "../../pipeline/layout";

function data(n: number) {
  const rnd = mulberry32(5);
  const vecs = Array.from({ length: n }, () => new Float32Array([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
  const labels = vecs.map((v) => [Math.round(v[0] * 4), Math.round((rnd() - 0.5) * 4), null, Math.round(v[2] * 4)]);
  return { vecs, labels };
}

test("fitAxisModels applies CV and human gates", () => {
  const { vecs, labels } = data(120);
  const models = fitAxisModels(vecs, labels, { ontology: 0.8, mechanism: 0.9, evidence: 0.9, scope: 0.4 });
  const by = Object.fromEntries(models.map((m) => [m.axis, m]));
  expect(by.ontology.auto).toBe(true);           // signal + human ok
  expect(by.mechanism.auto).toBe(false);         // noise fails CV
  expect(by.evidence.auto).toBe(false);          // no labels at all
  expect(by.evidence.n).toBe(0);
  expect(by.scope.auto).toBe(false);             // signal but human agreement 0.4 < 0.6
  expect(by.scope.cvSpearman).toBeGreaterThan(0.5);
});

test("computeLayout is deterministic and normalized", () => {
  const { vecs } = data(40);
  const a = computeLayout(vecs, 1), b = computeLayout(vecs, 1);
  expect(a).toEqual(b);
  for (const [x, y] of a) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1); }
});
