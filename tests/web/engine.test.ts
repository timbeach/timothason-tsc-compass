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

test("keyword hits keep a low-dense query from being called weak (final review #1)", () => {
  const a = answer(bundle, { ...q, text: "microtubule", qVec: new Float32Array([0.1, 0.1]) });
  expect(a.results.weak).toBe(false);
});

test("reports that opponents are unavailable while no stance axis is validated (final review #2)", () => {
  expect(answer(bundle, q).opponentsAvailable).toBe(false);
  const withAxis = { ...bundle, axes: [{ axis: "ontology", w: [0, 0], b: 0, lambda: 1, n: 50, cvSpearman: 0.8, cvR2: 0.5, humanSpearman: 0.8, auto: true }] } as Bundle;
  expect(answer(withAxis, q).opponentsAvailable).toBe(true);
});

test("two topics: each is covered, and each match is explained against the topic it fits (survey)", () => {
  const a = answer(bundle, { ...q, topics: [{ text: "microtubule anesthesia", qVec: new Float32Array([1, 0]) }, { text: "global workspace", qVec: new Float32Array([0, 1]) }] });
  const ids = a.results.kindred.map((m) => m.id);
  expect(ids.slice(0, 2).sort()).toEqual(["a", "b"]);
  expect(a.reasons.get("a")).toContain("Shared interest: microtubule anesthesia");
  expect(a.reasons.get("b")).toContain("Shared interest: global workspace");
  expect(a.lexicalOnly).toBe(false);
});

test("topics replace text, and blank topics are ignored", () => {
  const a = answer(bundle, { ...q, text: "", qVec: null, topics: [{ text: " ", qVec: null }, { text: "global workspace", qVec: new Float32Array([0, 1]) }] });
  expect(a.results.kindred[0].id).toBe("b");
});

test("Zoom only keeps streamed talks and streamed sessions (survey)", () => {
  // The stream belongs to the session: talks keep their real room, the session carries streamed + zoomUrl.
  const streamed = { ...bundle, docs: docs.map((d) => ({ ...d, room: d.id === "a" ? "Paradise Ballroom" : "Garden Room" })),
    slots: [{ ...bundle.slots[0], options: [{ id: "MON-1", label: "One", room: "Paradise Ballroom", streamed: true, zoomUrl: "https://zoom.example/j/1", docIds: ["a"] }, { id: "MON-2", label: "Two", room: "Garden Room", streamed: false, docIds: ["b", "c"] }] }] } as Bundle;
  const a = answer(streamed, { ...q, text: "global workspace", qVec: new Float32Array([0, 1]), zoomOnly: true });
  expect(a.results.kindred.map((m) => m.id)).not.toContain("b");
  expect(a.plan[0].slot.options.map((o) => o.id)).toEqual(["MON-1", "MON-2"]); // the slot keeps its full option list for the UI
  expect(a.plan[0].chosen.id).toBe("MON-1");
});

test("goal and fields change the ranking knobs without breaking the default path (survey)", () => {
  const base = answer(bundle, q);
  const argue = answer(bundle, { ...q, goal: "argue" });
  expect(argue.results.kindred[0].id).toBe(base.results.kindred[0].id);
  const fields = answer(bundle, { ...q, text: "consciousness", qVec: new Float32Array([0.7, 0.7]), disciplines: { mine: [], curious: ["philosophy"] } });
  expect(fields.results.kindred.length).toBeGreaterThan(0);
  const posters = answer(bundle, { ...q, posterN: 3 });
  expect(posters.plan.length).toBe(1);
});

test("Zoom only keeps the streamed sessions' talks in results and plan (survey fix)", () => {
  const streamed = { ...bundle, slots: [{ ...bundle.slots[0], options: [
    { ...bundle.slots[0].options[0], streamed: true, zoomUrl: "https://zoom.example/j/1" },
    { ...bundle.slots[0].options[1], streamed: false },
  ] }] } as Bundle;
  const a = answer(streamed, { ...q, zoomOnly: true });
  expect(a.results.kindred.map((m) => m.id)).toEqual(["a"]);
  expect(a.plan[0].chosen.id).toBe("MON-1");
});
