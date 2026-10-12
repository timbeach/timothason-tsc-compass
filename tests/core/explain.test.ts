import { expect, test } from "vitest";
import { explain, poleLabel } from "../../core/explain";
import type { Doc } from "../../core/types";

const doc = { id: "x", concepts: ["microtubules", "anesthesia", "Orch OR"], methods: ["anesthesia"],
  axes: { ontology: 2, mechanism: 2, evidence: null, scope: null } } as unknown as Doc;
const base = { doc, qVec: null, conceptVec: () => undefined, theta: 0.6 };

test("poleLabel", () => {
  expect(poleLabel("mechanism", 2)).toBe("quantum or field accounts");
  expect(poleLabel("mechanism", -1)).toBe("classical neural accounts");
});

test("literal concept overlap, agreement, method overlap; max 3 reasons", () => {
  const out = explain({ ...base, qText: "anesthesia and microtubules", shared: ["ontology", "mechanism"],
    u: { ontology: 2, mechanism: 1, evidence: null, scope: null }, methods: ["anesthesia"] });
  expect(out).toEqual([
    "Shared interest: microtubules, anesthesia",
    "You both lean toward consciousness as fundamental",
    "Same method: anesthesia",
  ]);
});

test("disagreement reason names both sides", () => {
  const out = explain({ ...base, qText: "global workspace", shared: ["mechanism"],
    u: { ontology: null, mechanism: -2, evidence: null, scope: null } });
  expect(out).toEqual(["They lean toward quantum or field accounts; you lean toward classical neural accounts"]);
});

test("semantic concept match via concept vectors", () => {
  const out = explain({ ...base, qText: "tubulin", shared: [], u: { ontology: null, mechanism: null, evidence: null, scope: null },
    qVec: new Float32Array([1, 0]),
    conceptVec: (_id, c) => (c === "microtubules" ? new Float32Array([0.9, 0.1]) : new Float32Array([0, 1])) });
  expect(out).toEqual(["Shared interest: microtubules"]);
});
