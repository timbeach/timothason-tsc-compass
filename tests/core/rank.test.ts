import { expect, test } from "vitest";
import { DEFAULT_RANK, rankAll, type RankInput } from "../../core/rank";
import type { AxisScores, Doc } from "../../core/types";

const ax = (o: number | null): AxisScores => ({ ontology: o, mechanism: null, evidence: null, scope: null });
const doc = (id: string, discipline: Doc["discipline"], o: number | null): Doc => ({
  id, name: id, affiliation: "", title: id, url: "", day: null, sessionCode: null, sessionName: null, room: null,
  types: ["Concurrent"], workshops: [], coreClaim: "", discipline, methods: [], axes: ax(o), concepts: [],
  askQuestion: "", challengeQuestion: "", xy: [0, 0],
});

function input(over: Partial<RankInput> = {}): RankInput {
  // 6 docs; 0,1 are near-duplicates (same vector). 2 has the opposite stance. 5 is another discipline.
  const docs = [doc("a", "philosophy", 2), doc("b", "philosophy", 2), doc("c", "philosophy", -2),
    doc("d", "philosophy", 1), doc("e", "philosophy", null), doc("f", "biology", null)];
  const vectors = new Float32Array([1, 0, 1, 0, 0.9, 0.1, 0, 1, 0.5, 0.5, 0.6, 0.4]); // d is orthogonal to a
  return {
    docs, vectors, dim: 2,
    r: new Float64Array([0.9, 0.89, 0.85, 0.8, 0.5, 0.6]),
    dense: new Float64Array([0.9, 0.89, 0.85, 0.8, 0.5, 0.6]),
    u: ax(2), oppAxes: () => true, ...over,
  };
}
const cfg = { ...DEFAULT_RANK, nKindred: 3, nOpponents: 2, tauRank: 4, serendipityQuantile: 0.1 };

test("kindred favours same stance and MMR avoids the duplicate", () => {
  const r = rankAll(input(), cfg);
  const ids = r.kindred.map((m) => m.id);
  expect(ids[0]).toBe("a");
  expect(ids).not.toContain("c");
  expect(ids.indexOf("b") === -1 || ids.indexOf("b") > 1).toBe(true);
});

test("opponents are on-topic, disagree beyond the floor, and exclude kindred", () => {
  const r = rankAll(input(), cfg);
  expect(r.opponents.map((m) => m.id)).toEqual(["c"]);
  expect(r.opponents[0].s).toBeCloseTo(1);
});

test("no opponents when the user has no stance", () => {
  expect(rankAll(input({ u: ax(null) }), cfg).opponents).toEqual([]);
});

test("opponents ignore axes that are not eligible", () => {
  expect(rankAll(input({ oppAxes: () => false }), cfg).opponents).toEqual([]);
});

test("serendipity comes from another discipline", () => {
  expect(rankAll(input(), cfg).serendipity?.id).toBe("f");
});

test("weak flag when dense similarity is low everywhere (Review Focus 3)", () => {
  const low = new Float64Array([0.1, 0.1, 0.05, 0.02, 0.01, 0.0]);
  expect(rankAll(input({ dense: low, r: low }), cfg).weak).toBe(true);
  expect(rankAll(input(), cfg).weak).toBe(false);
});

test("weak flag in lexical-only mode when nothing matched", () => {
  const zero = new Float64Array(6);
  expect(rankAll(input({ dense: null, r: zero }), cfg).weak).toBe(true);
});

test("allow filter removes docs everywhere and docScores is -Infinity for them", () => {
  const r = rankAll(input({ allow: (d) => d.id !== "a" }), cfg);
  expect(r.kindred.map((m) => m.id)).not.toContain("a");
  expect(r.docScores[0]).toBe(-Infinity);
  expect(Number.isFinite(r.docScores[1])).toBe(true);
});

test("everything filtered out gives empty weak results", () => {
  const r = rankAll(input({ allow: () => false }), cfg);
  expect(r).toMatchObject({ kindred: [], opponents: [], serendipity: null, weak: true });
});

test("no relevance signal at all gives empty, weak results (codex #1-3)", () => {
  const zero = new Float64Array(6);
  const r = rankAll(input({ dense: null, r: zero }), cfg);
  expect(r).toMatchObject({ kindred: [], opponents: [], serendipity: null, weak: true });
});

test("lexical-only mode never pads lists with zero-relevance docs (codex #2)", () => {
  const r = rankAll(input({ dense: null, r: new Float64Array([2, 1, 0, 0, 0, 0]) }), cfg);
  expect(r.kindred.map((m) => m.id).sort()).toEqual(["a", "b"]);
  expect(r.opponents).toEqual([]);
  expect(r.serendipity).toBeNull();
});

test("a single lexical hit is still returned", () => {
  const r = rankAll(input({ dense: null, r: new Float64Array([0, 0, 0, 0, 0, 1.5]) }), cfg);
  expect(r.kindred.map((m) => m.id)).toEqual(["f"]);
  expect(r.weak).toBe(false);
});
