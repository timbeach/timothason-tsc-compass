import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { Enrichment, RawRecord } from "../../core/types";
import { buildPrompt, contentHash, enrichAll, loadEnrichments, validateEnrichment, type CallModel } from "../../pipeline/enrich";

const rec = (id: string, abstract = "Quantum processes in microtubules.") =>
  ({ id, title: `T ${id}`, abstract, name: "N", affiliation: "A" } as RawRecord);
const good: Enrichment = {
  core_claim: "Microtubules host quantum processes that anesthetics disrupt.",
  discipline: "biology", methods: ["anesthesia"], concepts: ["microtubules", "anesthesia", "quantum biology"],
  axes: { ontology: null, mechanism: 2, evidence: -1, scope: null },
  ask_question: "What result would surprise you most?", challenge_question: "How do you rule out classical explanations?",
};

test("buildPrompt includes title and abstract but not the bio", () => {
  const p = buildPrompt({ ...rec("a"), bio: "SECRET BIO" });
  expect(p).toContain("T a"); expect(p).toContain("microtubules"); expect(p).not.toContain("SECRET BIO");
});

test("validateEnrichment catches out-of-range axes and overlong claims", () => {
  expect(validateEnrichment(good)).toEqual([]);
  const bad = { ...good, core_claim: Array(30).fill("word").join(" "), axes: { ...good.axes, ontology: 3 } };
  expect(validateEnrichment(bad)).toEqual(["core_claim has 30 words (max 25)", "axis ontology=3 out of range"]);
});

test("enrichAll caches by content hash and re-runs when the abstract changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  const call: CallModel = vi.fn(async () => ({ ok: true as const, value: good }));
  expect(await enrichAll([rec("a"), rec("b")], dir, call, 2)).toMatchObject({ done: 2, cached: 0, failed: [] });
  expect(await enrichAll([rec("a"), rec("b")], dir, call, 2)).toMatchObject({ done: 0, cached: 2 });
  expect(await enrichAll([rec("a", "Changed abstract."), rec("b")], dir, call, 2)).toMatchObject({ done: 1, cached: 1 });
  expect(call).toHaveBeenCalledTimes(3);
  const saved = JSON.parse(readFileSync(join(dir, "a.json"), "utf8"));
  expect(saved.hash).toBe(contentHash(rec("a", "Changed abstract.")));
});

test("refusals and invalid output are reported, not cached", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  const call: CallModel = async (p) => (p.includes("Title: T a\n") ? { ok: false, reason: "refusal" } : { ok: true, value: { ...good, axes: { ...good.axes, scope: 9 } } });
  const res = await enrichAll([rec("a"), rec("b")], dir, call, 1);
  expect(res.failed).toEqual([{ id: "a", reason: "refusal" }, { id: "b", reason: "axis scope=9 out of range" }]);
});

test("loadEnrichments throws listing records with missing or stale cache (Review Focus 5)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  await enrichAll([rec("a")], dir, async () => ({ ok: true, value: good }), 1);
  writeFileSync(join(dir, "b.json"), JSON.stringify({ hash: "stale", enrichment: good }));
  expect(() => loadEnrichments([rec("a"), rec("b"), rec("c")], dir)).toThrow(/b, c/);
  expect(loadEnrichments([rec("a")], dir).get("a")).toEqual(good);
});
