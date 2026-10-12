import { expect, test } from "vitest";
import type { Enrichment, RawRecord } from "../../core/types";
import { findLeaks, toDoc } from "../../pipeline/export";

const r = { id: "a", name: "N", affiliation: "A", title: "T", url: "u", day: "2026-10-12", sessionCode: "MON-1",
  sessionName: "S", room: "R", types: ["Concurrent"], workshops: [],
  abstract: "the quick brown fox jumps over the lazy dog near the riverbank today", bio: "bio text here" } as RawRecord;
const e = { core_claim: "c", discipline: "biology", methods: [], axes: { ontology: 1, mechanism: null, evidence: null, scope: null },
  concepts: ["x"], ask_question: "q1", challenge_question: "q2" } as Enrichment;

test("toDoc carries no abstract or bio", () => {
  const d = toDoc(r, e, [0.1, 0.2]);
  expect(JSON.stringify(d)).not.toContain("quick brown");
  expect(JSON.stringify(d)).not.toContain("bio text");
  expect(d).toMatchObject({ id: "a", coreClaim: "c", askQuestion: "q1", challengeQuestion: "q2", xy: [0.1, 0.2] });
});

test("findLeaks flags any 8-word run of abstract text in public JSON", () => {
  expect(findLeaks(['{"x":"nothing here"}'], [r])).toEqual([]);
  expect(findLeaks(['{"x":"... quick brown fox jumps over the lazy dog near ..."}'], [r])).toEqual(["a"]);
});

test("findLeaks ignores abstract runs that are just the public title repeated", () => {
  const titled = { ...r, title: "The Quick Brown Fox Jumps Over The Lazy Dog", abstract: "the quick brown fox jumps over the lazy dog is our title and more words follow here" } as RawRecord;
  expect(findLeaks(['{"title":"The Quick Brown Fox Jumps Over The Lazy Dog"}'], [titled])).toEqual([]);
  expect(findLeaks(['{"x":"is our title and more words follow here"}'], [titled])).toEqual(["a"]);
});

test("findLeaks treats a quoted copy of the title as the title", () => {
  const titled = { ...r, title: "Awareness As The Ground Of Reality: A Speculative Inquiry", abstract: "\"Awareness as the ground of reality: a speculative inquiry\" proposes something" } as RawRecord;
  expect(findLeaks(['{"title":"\\"awareness as the ground of reality: a speculative inquiry\\""}'], [titled])).toEqual([]);
});

import { lexText, assertFresh } from "../../pipeline/export";
test("the keyword index covers presenter names and concepts (final review)", () => {
  const t = lexText({ ...r, name: "Stuart Hameroff" } as RawRecord, { ...e, concepts: ["Orch OR", "microtubules"] } as Enrichment);
  expect(t).toContain("Stuart Hameroff");
  expect(t).toContain("Orch OR");
  expect(t).toContain(r.abstract);
});

test("assertFresh rejects stale embeddings or layout (final review #6)", () => {
  expect(() => assertFresh(3, 384, 3 * 384, 3)).not.toThrow();
  expect(() => assertFresh(3, 384, 4 * 384, 3)).toThrow(/embeddings/);
  expect(() => assertFresh(3, 384, 3 * 384, 2)).toThrow(/layout/);
});
