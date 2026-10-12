import { expect, test } from "vitest";
import { buildBm25 } from "../../core/lexical";
import { denseScores, rankOrder, relevance, type Corpus } from "../../core/retrieval";

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
