import { expect, test } from "vitest";
import { buildBm25 } from "../../core/lexical";
import { denseScores, rankOrder, relevance, relevanceMulti, type Corpus } from "../../core/retrieval";

const texts = ["integrated information theory iit phi", "global workspace broadcast", "microtubule quantum orch"];
// Dense vectors: doc 1 is closest to the query vector [0,1,0]; doc 0 is orthogonal.
const corpus: Corpus = {
  ids: ["a", "b", "c"], dim: 3,
  vectors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0.6, 0.8]),
  lex: buildBm25(texts),
};
const q = new Float32Array([0, 1, 0]);

test("denseScores and rankOrder", () => {
  const d = denseScores(corpus, q);
  expect(Array.from(d)).toEqual([0, 1, expect.closeTo(0.6)]);
  expect(rankOrder(d)).toEqual([1, 2, 0]);
});

test("rankOrder breaks ties by index", () => {
  expect(rankOrder([1, 1, 2])).toEqual([2, 0, 1]);
});

test("hybrid lets an exact acronym win when dense is flat (Review Focus 1)", () => {
  const flat = new Float32Array([0.707, 0.707, 0]); // a and b tie on dense, c is lower
  const { r } = relevance(corpus, flat, "IIT", { mode: "hybrid", alpha: 0.5, rrfK: 60 });
  expect(rankOrder(r)[0]).toBe(0);
});

test("dense mode follows dense", () => {
  const { r } = relevance(corpus, q, "IIT", { mode: "dense", alpha: 0.5, rrfK: 60 });
  expect(rankOrder(r)[0]).toBe(1);
});

test("rrf fuses ranks", () => {
  const { r } = relevance(corpus, q, "iit", { mode: "rrf", alpha: 0.5, rrfK: 60 });
  // doc0: dense rank 3, lex rank 1. doc1: dense rank 1, lex rank 2 (tie at 0, index order). Equal sums.
  expect(r[0]).toBeCloseTo(1 / 63 + 1 / 61);
  expect(r[1]).toBeCloseTo(1 / 61 + 1 / 62);
});

test("null query vector falls back to lexical in every mode (Review Focus 4)", () => {
  for (const mode of ["dense", "hybrid", "rrf", "lexical"] as const) {
    const out = relevance(corpus, null, "microtubule", { mode, alpha: 0.5, rrfK: 60 });
    expect(out.dense).toBeNull();
    expect(rankOrder(out.r)[0]).toBe(2);
  }
});

test("short queries lean on keywords even at the deployed alpha (final review #1)", () => {
  // dense is noisy and slightly favours doc 1, the only literal hit is doc 0
  const noisy = new Float32Array([0.2, 0.35, 0.3]);
  const cfg = { mode: "hybrid" as const, alpha: 0.85, rrfK: 60, shortQueryAlpha: 0.4, shortQueryTokens: 2 };
  expect(rankOrder(relevance(corpus, noisy, "IIT", cfg).r)[0]).toBe(0);
  // long query keeps the configured alpha: dense wins
  const long = "the global workspace broadcast of information across cortex";
  expect(rankOrder(relevance(corpus, new Float32Array([0, 1, 0]), long, cfg).r)[0]).toBe(1);
});

test("relevanceMulti: one topic is plain relevance, two topics give each doc its best topic", () => {
  const cfg = { mode: "hybrid" as const, alpha: 0.85, rrfK: 60 };
  const one = relevanceMulti(corpus, [{ text: "IIT", qVec: q }], cfg);
  expect(Array.from(one.r)).toEqual(Array.from(relevance(corpus, q, "IIT", cfg).r));
  // Topic A points at doc b (dense), topic B at doc c (dense + keyword). Alone, each topic ranks the other's doc last-ish.
  const a = { text: "global workspace", qVec: new Float32Array([0, 1, 0]) };
  const b = { text: "microtubule", qVec: new Float32Array([0, 0, 1]) };
  const both = relevanceMulti(corpus, [a, b], cfg);
  const order = rankOrder(both.r);
  expect(order.slice(0, 2).sort()).toEqual([1, 2]);
  expect(both.dense).not.toBeNull();
  expect(both.lex[2]).toBeGreaterThan(0);
});

test("relevanceMulti: a topic that fell back to keywords still counts, on the same scale", () => {
  const cfg = { mode: "hybrid" as const, alpha: 0.85, rrfK: 60 };
  const a = { text: "global workspace", qVec: new Float32Array([0, 1, 0]) };
  const b = { text: "microtubule", qVec: null };
  const both = relevanceMulti(corpus, [a, b], cfg);
  expect(rankOrder(both.r).slice(0, 2).sort()).toEqual([1, 2]);
  expect(both.dense).not.toBeNull(); // the topic with a vector keeps dense for the weak-match check
});

test("relevanceMulti ignores blank topics", () => {
  const cfg = { mode: "hybrid" as const, alpha: 0.85, rrfK: 60 };
  const out = relevanceMulti(corpus, [{ text: "  ", qVec: null }, { text: "IIT", qVec: q }], cfg);
  expect(Array.from(out.r)).toEqual(Array.from(relevance(corpus, q, "IIT", cfg).r));
});
