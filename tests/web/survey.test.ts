// @vitest-environment jsdom
import { expect, test } from "vitest";
import type { Doc, Slot } from "../../core/types";
import { findMustSees, readSurvey, restoreSurvey, surveyHtml } from "../../web/src/ui/survey";

function form(): HTMLFormElement {
  const f = document.createElement("form");
  f.innerHTML = surveyHtml({ examples: ["x"], days: [["2026-10-12", "Mon"], ["2026-10-13", "Tue"]], defaultDays: ["2026-10-13"] });
  document.body.replaceChildren(f);
  return f;
}

test("surveyHtml keeps the ids the app and e2e tests rely on, and defaults days to what is left", () => {
  const f = form();
  expect(f.querySelector("#q")).not.toBeNull();
  expect(f.querySelectorAll("input.topic").length).toBe(2);
  expect(f.querySelectorAll(".types input").length).toBe(4);
  expect([...f.querySelectorAll<HTMLInputElement>(".days input")].map((i) => i.checked)).toEqual([false, true]);
  expect(f.querySelector("#stance")).not.toBeNull();
  expect(f.querySelectorAll("input[name=goal]").length).toBe(4);
  expect((f.querySelector("input[name=goal]:checked") as HTMLInputElement).value).toBe("balance");
});

test("readSurvey collects topics in order, skipping blanks, and every other answer", () => {
  const f = form();
  (f.querySelector("#q") as HTMLTextAreaElement).value = "  psychedelics ";
  (f.querySelector('input[data-topic="3"]') as HTMLInputElement).value = "machine consciousness";
  (f.querySelector('input[name=goal][value="argue"]') as HTMLInputElement).checked = true;
  (f.querySelector('input[name=mine][value="physics"]') as HTMLInputElement).checked = true;
  (f.querySelector('input[name=curious][value="philosophy"]') as HTMLInputElement).checked = true;
  (f.querySelector('input[name=m][value="EEG/MEG"]') as HTMLInputElement).checked = true;
  (f.querySelector("#zoom") as HTMLInputElement).checked = true;
  (f.querySelector("#vary") as HTMLInputElement).checked = true;
  (f.querySelector("#posters") as HTMLSelectElement).value = "20";
  const s = readSurvey(f);
  expect(s.topics).toEqual(["psychedelics", "machine consciousness"]);
  expect(s.goal).toBe("argue");
  expect(s.mine).toEqual(["physics"]);
  expect(s.curious).toEqual(["philosophy"]);
  expect(s.methods).toEqual(["EEG/MEG"]);
  expect(s).toMatchObject({ zoomOnly: true, vary: true, posterN: 20, days: ["2026-10-13"] });
  expect(s.types.length).toBe(4);
});

test("restoreSurvey round-trips, and opens a collapsed step that holds an answer", () => {
  const f = form();
  restoreSurvey(f, { topics: ["a", "b"], goal: "explore", mine: ["biology"], methods: ["fMRI"], zoomOnly: true, posterN: 5, days: ["2026-10-12"] });
  const s = readSurvey(f);
  expect(s.topics).toEqual(["a", "b"]);
  expect(s.goal).toBe("explore");
  expect(s.mine).toEqual(["biology"]);
  expect(s.methods).toEqual(["fMRI"]);
  expect(s).toMatchObject({ zoomOnly: true, posterN: 5, days: ["2026-10-12"], vary: false });
  expect(f.querySelector<HTMLDetailsElement>("details.fields")!.open).toBe(true);
  expect(f.querySelector<HTMLDetailsElement>("details.methods")!.open).toBe(true);
});

const doc = (id: string, name: string, title: string, sessionCode: string, day = "2026-10-15"): Doc => ({
  id, name, affiliation: "", title, url: "", day, sessionCode, sessionName: null, room: null, types: ["Concurrent"], workshops: [],
  coreClaim: "", discipline: "physics", methods: [], concepts: [], axes: { ontology: null, mechanism: null, evidence: null, scope: null },
  askQuestion: "", challengeQuestion: "", xy: [0, 0],
});
const slots: Slot[] = [
  { id: "conc-2026-10-15", day: "2026-10-15", start: "17:00", end: "19:05", kind: "concurrent", options: [{ id: "THU-2", label: "Mental Causation", room: "Dockside Room", docIds: ["mason"] }] },
  { id: "poster-PS-1", day: "2026-10-13", start: "19:30", end: null, kind: "poster", options: [{ id: "PS-1", label: "Posters", room: null, docIds: ["p"] }] },
];

test("findMustSees matches name or title, maps to the pinnable session, and skips posters and short queries", () => {
  const docs = [doc("mason", "Mason Ulrika Borchard", "Bursts, not mean shifts", "THU-2"), doc("p", "Poster Person", "Bursts of something", "PS-1")];
  expect(findMustSees(docs, slots, "borch")).toEqual([{ doc: docs[0], slotId: "conc-2026-10-15", optionId: "THU-2" }]);
  expect(findMustSees(docs, slots, "bursts").map((h) => h.doc.id)).toEqual(["mason"]);
  expect(findMustSees(docs, slots, "b")).toEqual([]);
});
