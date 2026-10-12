import { expect, test } from "vitest";
import { bm25Scores, buildBm25, stem, tokenize } from "../../core/lexical";

test("stem", () => {
  expect(stem("microtubules")).toBe("microtubule");
  expect(stem("studies")).toBe("study");
  expect(stem("processing")).toBe("process");
  expect(stem("consciousness")).toBe("consciousness");
  expect(stem("iit")).toBe("iit");
});

test("tokenize lowercases, strips accents and stopwords", () => {
  expect(tokenize("The Microtubules and Anesthésia studies, IIT!")).toEqual(["microtubule", "anesthesia", "study", "iit"]);
});

test("BM25 ranks the doc containing a rare query term first", () => {
  const ix = buildBm25([
    "integrated information theory iit and phi",
    "global workspace theory of consciousness",
    "consciousness and the brain",
  ]);
  const s = bm25Scores(ix, "IIT");
  expect(s[0]).toBeGreaterThan(0);
  expect(s[1]).toBe(0);
  expect(s[2]).toBe(0);
});

test("BM25: rarer term outweighs common term", () => {
  const ix = buildBm25(["consciousness psilocybin", "consciousness brain", "consciousness mind"]);
  const s = bm25Scores(ix, "consciousness psilocybin");
  expect(s[0]).toBeGreaterThan(s[1]);
  expect(s[1]).toBeCloseTo(s[2]);
});

test("BM25 empty query gives zeros; index is JSON-serializable", () => {
  const ix = buildBm25(["a b c"]);
  expect(Array.from(bm25Scores(ix, ""))).toEqual([0]);
  const round = JSON.parse(JSON.stringify(ix));
  expect(Array.from(bm25Scores(round, "c"))).toEqual(Array.from(bm25Scores(ix, "c")));
});

import { hashIndex } from "../../core/lexical";
test("a hashed index ranks identically and contains no readable words (minor: lex.json)", () => {
  const ix = buildBm25(["integrated information theory iit", "global workspace broadcast", "microtubule quantum"]);
  const hx = hashIndex(ix);
  for (const q of ["IIT", "global workspace", "quantum microtubules", "nothing here"])
    expect(Array.from(bm25Scores(hx, q))).toEqual(Array.from(bm25Scores(ix, q)));
  const json = JSON.stringify(hx);
  for (const w of ["integrated", "workspace", "microtubule"]) expect(json).not.toContain(w);
});
