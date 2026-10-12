import { expect, test } from "vitest";
import { DEFAULT_RANK } from "../../core/rank";
import { affinity, goalPreset, isStreamed, remainingDays } from "../../core/survey";
import type { Doc } from "../../core/types";

const doc = (discipline: Doc["discipline"]): Doc => ({
  id: "x", name: "", affiliation: "", title: "", url: "", day: null, sessionCode: null, sessionName: null, room: null,
  types: ["Concurrent"], workshops: [], coreClaim: "", discipline, methods: [], concepts: [],
  axes: { ontology: null, mechanism: null, evidence: null, scope: null }, askQuestion: "", challengeQuestion: "", xy: [0, 0],
});

test("goal presets only move existing knobs, and balance leaves the config alone", () => {
  expect(goalPreset("balance", DEFAULT_RANK)).toEqual(DEFAULT_RANK);
  expect(goalPreset(undefined, DEFAULT_RANK)).toEqual(DEFAULT_RANK);
  const k = goalPreset("kindred", DEFAULT_RANK);
  expect(k.nKindred).toBeGreaterThan(DEFAULT_RANK.nKindred);
  expect(k.beta).toBeGreaterThan(DEFAULT_RANK.beta);
  const a = goalPreset("argue", DEFAULT_RANK);
  expect(a.nOpponents).toBeGreaterThan(DEFAULT_RANK.nOpponents);
  expect(a.oppFloor).toBeLessThan(DEFAULT_RANK.oppFloor);
  expect(a.oppFloor).toBeGreaterThanOrEqual(0.25);
  const e = goalPreset("explore", DEFAULT_RANK);
  expect(e.mmrLambda).toBeLessThan(DEFAULT_RANK.mmrLambda);
  expect(e.serendipityQuantile).toBeLessThan(DEFAULT_RANK.serendipityQuantile);
  for (const g of ["kindred", "argue", "explore"] as const) expect(Object.keys(goalPreset(g, DEFAULT_RANK)).sort()).toEqual(Object.keys(DEFAULT_RANK).sort());
});

test("affinity: own field 1, curious field 0.5, otherwise 0, and nothing without prefs", () => {
  const prefs = { mine: ["physics" as const], curious: ["philosophy" as const] };
  expect(affinity(prefs, doc("physics"))).toBe(1);
  expect(affinity(prefs, doc("philosophy"))).toBe(0.5);
  expect(affinity(prefs, doc("biology"))).toBe(0);
  expect(affinity(undefined, doc("physics"))).toBe(0);
});

test("streamed rooms are the ones the program lists as a Zoom link", () => {
  expect(isStreamed("Zoom link")).toBe(true);
  expect(isStreamed("Dockside Room")).toBe(false);
  expect(isStreamed(null)).toBe(false);
});

test("remainingDays drops days that have passed, and offers every day once the week is over", () => {
  const all = ["2026-10-11", "2026-10-12", "2026-10-13"];
  expect(remainingDays(all, "2026-10-12")).toEqual(["2026-10-12", "2026-10-13"]);
  expect(remainingDays(all, "2026-10-01")).toEqual(all);
  expect(remainingDays(all, "2026-10-20")).toEqual(all);
});
