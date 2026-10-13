import { expect, test } from "vitest";
import type { PlanItem } from "../../core/itinerary";
import { questionList, questionsText } from "../../core/questions";
import type { Match, Results } from "../../core/rank";
import type { Doc, Slot } from "../../core/types";

const doc = (id: string, day: string | null, sessionCode: string | null, types: Doc["types"] = ["Concurrent"]): Doc => ({
  id, name: `Name ${id}`, affiliation: "", title: `Title ${id}`, url: "", day, sessionCode, sessionName: null, room: null,
  types, workshops: [], coreClaim: "", discipline: "physics", methods: [], concepts: [],
  axes: { ontology: null, mechanism: null, evidence: null, scope: null }, askQuestion: `ask ${id}`, challengeQuestion: `push ${id}`, xy: [0, 0],
});
const docs = [doc("a", "2026-10-15", "THU-2"), doc("b", "2026-10-13", "TUE-1"), doc("c", "2026-10-13", "TUE-1"), doc("d", "2026-10-13", "TUE-1"),
  doc("e", "2026-10-14", "WED-3"), doc("p", "2026-10-13", "PS-1", ["Poster"]), doc("z", null, null)];
const slots: Slot[] = [
  { id: "conc-2026-10-13", day: "2026-10-13", start: "17:00", end: "19:05", kind: "concurrent", options: [{ id: "TUE-1", label: "T", room: null, docIds: ["b", "c", "d"] }] },
  { id: "poster-PS-1", day: "2026-10-13", start: "19:30", end: null, kind: "poster", options: [{ id: "PS-1", label: "Posters", room: null, docIds: ["p"] }] },
  { id: "conc-2026-10-14", day: "2026-10-14", start: "17:00", end: "19:05", kind: "concurrent", options: [{ id: "WED-3", label: "W", room: null, docIds: ["e"] }] },
  { id: "conc-2026-10-15", day: "2026-10-15", start: "17:00", end: "19:05", kind: "concurrent", options: [{ id: "THU-2", label: "Th", room: null, docIds: ["a"] }] },
];
const m = (id: string, score: number): Match => ({ idx: docs.findIndex((d) => d.id === id), id, r: score, rNorm: score, s: null, shared: [], score });
const docScores = new Float64Array([0.9, 0.5, 0.6, 0.1, 0.3, 0.7, 0.2]); // a b c d e p z
const results: Results = { kindred: [m("a", 0.9), m("p", 0.7), m("z", 0.2)], opponents: [m("e", 0.3)], serendipity: [], weak: false, docScores };
const plan: PlanItem[] = [
  { slot: slots[0], chosen: slots[0].options[0], score: 1, pinned: false, confident: true, posters: [] },
  { slot: slots[1], chosen: slots[1].options[0], score: 0.7, pinned: false, confident: true, posters: ["p"] },
  { slot: slots[2], chosen: slots[2].options[0], score: 0.3, pinned: false, confident: false, posters: [] },
  { slot: slots[3], chosen: slots[3].options[0], score: 0.9, pinned: true, confident: true, posters: [] },
];

test("matches come first by schedule, then the best talks of each planned session, unscheduled last", () => {
  const items = questionList({ docs, slots, results, plan, perSession: 2 });
  expect(items.map((i) => i.doc.id)).toEqual(["c", "b", "p", "e", "a", "z"]);
  expect(items.find((i) => i.doc.id === "a")!.why).toBe("kindred");
  expect(items.find((i) => i.doc.id === "c")!.why).toBe("plan");
  expect(items.find((i) => i.doc.id === "a")!.slot?.id).toBe("conc-2026-10-15");
  expect(items.find((i) => i.doc.id === "p")!.why).toBe("kindred"); // a poster match is kept; poster slots add nothing on their own
  expect(items.find((i) => i.doc.id === "z")!.slot).toBeUndefined();
});

test("a session that is not a confident pick adds nothing, and nobody is listed twice", () => {
  const items = questionList({ docs, slots, results: { ...results, opponents: [] }, plan, perSession: 2 });
  expect(items.map((i) => i.doc.id)).not.toContain("e");
  expect(new Set(items.map((i) => i.doc.id)).size).toBe(items.length);
});

test("plain text has one block per presenter with both questions", () => {
  const text = questionsText(questionList({ docs, slots, results, plan, perSession: 1 }));
  expect(text).toMatch(/Name a/);
  expect(text).toMatch(/Ask: ask a/);
  expect(text).toMatch(/Push back: push a/);
  expect(text.split("\n\n").length).toBeGreaterThanOrEqual(4);
});
