// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import type { QuestionItem } from "../../core/questions";
import type { Doc, Slot } from "../../core/types";
import { renderQuestions } from "../../web/src/ui/questions";

const doc = (id: string): Doc => ({
  id, name: `Name ${id}`, affiliation: "", title: `Title ${id}`, url: `https://x/${id}`, day: "2026-10-15", sessionCode: "THU-2", sessionName: null,
  room: "Dockside Room", types: ["Concurrent"], workshops: [], coreClaim: "", discipline: "physics", methods: [], concepts: [],
  axes: { ontology: null, mechanism: null, evidence: null, scope: null }, askQuestion: `ask ${id}`, challengeQuestion: `push ${id}`, xy: [0, 0],
});
const slot: Slot = { id: "conc-2026-10-15", day: "2026-10-15", start: "17:00", end: "19:05", kind: "concurrent", options: [{ id: "THU-2", label: "Th", room: "Dockside Room", docIds: ["a"] }] };
const items: QuestionItem[] = [{ doc: doc("a"), slot, why: "kindred" }, { doc: doc("b"), slot, why: "plan" }];

test("renders one block per presenter, grouped by day, with both questions and a copy button", async () => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const copy = vi.fn();
  renderQuestions(root, items, copy);
  expect(root.querySelectorAll("[data-testid=question]").length).toBe(2);
  expect(root.querySelectorAll("h3").length).toBe(1); // one day
  expect(root.textContent).toContain("ask a");
  expect(root.textContent).toContain("push a");
  expect(root.textContent).toContain("Dockside Room");
  (root.querySelector("#copy-questions") as HTMLButtonElement).click();
  expect(copy).toHaveBeenCalledTimes(1);
  expect(copy.mock.calls[0][0]).toMatch(/Ask: ask a/);
});

test("nothing to ask leaves the section out", () => {
  const root = document.createElement("div");
  renderQuestions(root, [], () => {});
  expect(root.children.length).toBe(0);
});
