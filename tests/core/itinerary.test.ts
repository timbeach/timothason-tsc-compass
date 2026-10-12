import { expect, test } from "vitest";
import { buildItinerary, sessionScore, toIcs } from "../../core/itinerary";
import type { Doc, Slot } from "../../core/types";

const slots: Slot[] = [
  { id: "conc-2026-10-12", day: "2026-10-12", start: "17:00", end: "19:05", kind: "concurrent", options: [
    { id: "MON-1", label: "Quantum, Theories; etc", room: "Ballroom", docIds: ["a", "b"] },
    { id: "MON-2", label: "Neuro", room: "Garden", docIds: ["c"] },
    { id: "MON-3", label: "Empty", room: null, docIds: [] } ] },
  { id: "poster-PS-1", day: "2026-10-13", start: "19:30", end: null, kind: "poster",
    options: [{ id: "PS-1", label: "Poster Session 1", room: "Mission Bay", docIds: ["p1", "p2", "p3"] }] },
];
const scores: Record<string, number> = { a: 0.2, b: 0.1, c: 0.9, p1: 0.1, p2: 0.8, p3: 0.5 };
const scoreOf = (id: string) => scores[id] ?? -Infinity;

test("sessionScore = max + 0.5 * mean(top 3); empty is -Infinity", () => {
  expect(sessionScore([0.2, 0.1])).toBeCloseTo(0.2 + 0.5 * 0.15);
  expect(sessionScore([])).toBe(-Infinity);
  expect(sessionScore([-Infinity, 0.5])).toBeCloseTo(0.5 + 0.5 * 0.5);
});

test("picks the best option per slot and ranks posters", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: {}, posterN: 2 });
  expect(plan.map((p) => p.chosen.id)).toEqual(["MON-2", "PS-1"]);
  expect(plan[1].posters).toEqual(["p2", "p3"]);
});

test("pins override; stale pins are ignored (Review Focus 5)", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: { "conc-2026-10-12": "MON-1", "gone-slot": "X", "poster-PS-1": "NOPE" }, posterN: 2 });
  expect(plan[0]).toMatchObject({ pinned: true });
  expect(plan[0].chosen.id).toBe("MON-1");
  expect(plan[1].pinned).toBe(false);
});

test("day filter", () => {
  expect(buildItinerary(slots, scoreOf, { days: new Set(["2026-10-13"]), pins: {}, posterN: 1 }).map((p) => p.slot.id)).toEqual(["poster-PS-1"]);
});

test("toIcs emits escaped events in Pacific time with CRLF", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: { "conc-2026-10-12": "MON-1" }, posterN: 1 });
  const ics = toIcs(plan, new Map([["p2", { title: "Poster Two" } as Doc]]));
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20261012T170000");
  expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20261012T190500");
  expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20261013T203000");
  expect(ics).toContain("SUMMARY:MON-1: Quantum\\, Theories\\; etc");
  expect(ics).toContain("Poster Two");
  expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
});

test("a slot where nothing scored is not a confident pick (final review #3)", () => {
  const none = () => -Infinity;
  const plan = buildItinerary(slots, none, { days: null, pins: {}, posterN: 3 });
  expect(plan.map((p) => p.confident)).toEqual([false, false]);
  expect(plan[1].posters).toEqual([]);
  const scored = buildItinerary(slots, scoreOf, { days: null, pins: {}, posterN: 3 });
  expect(scored.map((p) => p.confident)).toEqual([true, true]);
});

test("ICS skips unconfident unpinned slots, has DTSTAMP and folds long lines (final review)", () => {
  const plan = buildItinerary(slots, (id) => (id === "c" ? 1 : -Infinity), { days: null, pins: {}, posterN: 3 });
  const longTitle = "A".repeat(200);
  const ics = toIcs(plan, new Map([["c", { title: longTitle } as Doc]]));
  expect(ics).toContain("SUMMARY:MON-2: Neuro");
  expect(ics).not.toContain("Poster Session 1");
  expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
});
