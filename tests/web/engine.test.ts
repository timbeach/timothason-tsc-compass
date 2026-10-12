import { expect, test } from "vitest";
import { buildBm25 } from "../../core/lexical";
import { DEFAULT_RANK } from "../../core/rank";
import type { Doc } from "../../core/types";
import type { Bundle } from "../../web/src/data";
import { answer } from "../../web/src/engine";

const doc = (id: string, title: string, sessionCode: string): Doc => ({
  id, name: id, affiliation: "", title, url: "", day: "2026-10-12", sessionCode, sessionName: null, room: null,
  types: ["Concurrent"], workshops: [], coreClaim: "", discipline: "neuroscience", methods: [], concepts: [title],
  axes: { ontology: null, mechanism: null, evidence: null, scope: null }, askQuestion: "", challengeQuestion: "", xy: [0, 0],
});
const docs = [doc("a", "microtubule anesthesia", "MON-1"), doc("b", "global workspace", "MON-2"), doc("c", "dreams and myth", "MON-2")];
const bundle: Bundle = {
  docs,
  corpus: { ids: docs.map((d) => d.id), dim: 2, vectors: new Float32Array([1, 0, 0, 1, 0.7, 0.7]), lex: buildBm25(docs.map((d) => d.title)) },
  axes: [], conceptVec: () => undefined,
  slots: [{ id: "conc-2026-10-12", day: "2026-10-12", start: "17:00", end: "19:05", kind: "concurrent",
    options: [{ id: "MON-1", label: "One", room: null, docIds: ["a"] }, { id: "MON-2", label: "Two", room: null, docIds: ["b", "c"] }] }],
  meta: { dataDate: "2026-10-05", model: "m", dim: 2, chunking: "chunk",
    config: { model: "m", chunking: "chunk", retrieval: { mode: "hybrid", alpha: 0.7, rrfK: 60 }, rank: { ...DEFAULT_RANK, weakDense: 0.2 }, theta: 0.6 } },
};
const q = { text: "microtubule anesthesia", qVec: new Float32Array([1, 0]), sliders: {}, days: null, types: null, methods: [], pins: {} };

test("answer ranks, explains and plans", () => {
  const a = answer(bundle, q);
  expect(a.results.kindred[0].id).toBe("a");
  expect(a.reasons.get("a")).toContain("Shared interest: microtubule anesthesia");
  expect(a.plan[0].chosen.id).toBe("MON-1");
  expect(a.lexicalOnly).toBe(false);
});

test("lexical-only when the model is unavailable (Review Focus 4)", () => {
  const a = answer(bundle, { ...q, qVec: null });
  expect(a.lexicalOnly).toBe(true);
  expect(a.results.kindred[0].id).toBe("a");
});

test("type filter", () => {
  const a = answer(bundle, { ...q, types: new Set(["Poster"]) });
  expect(a.results.kindred).toEqual([]);
  expect(a.results.weak).toBe(true);
});
