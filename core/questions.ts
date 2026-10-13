// Questions to bring. 2026-10-13.
//
// Every abstract was labelled once with two questions: one a friendly listener would ask, one a thoughtful
// skeptic would. This gathers them for the people an attendee is going to hear: the matches, then the
// strongest talks in each session the plan picked, in schedule order, each presenter once.

import type { PlanItem } from "./itinerary";
import type { Results } from "./rank";
import type { Doc, Slot } from "./types";

export type Why = "kindred" | "opponent" | "serendipity" | "plan";
export interface QuestionItem { doc: Doc; slot?: Slot; why: Why }

export interface QuestionInput {
  docs: Doc[]; slots: Slot[]; results: Results; plan: PlanItem[];
  /** How many talks of each planned session to include beyond the matches themselves. */
  perSession?: number;
}

export function questionList(inp: QuestionInput): QuestionItem[] {
  const byId = new Map(inp.docs.map((d, i) => [d.id, i]));
  const slotOf = new Map<string, Slot>();
  for (const s of inp.slots) for (const o of s.options) for (const id of o.docIds) slotOf.set(id, s);
  const seen = new Set<string>();
  const items: QuestionItem[] = [];
  const add = (id: string, why: Why) => {
    const i = byId.get(id);
    if (i === undefined || seen.has(id)) return;
    seen.add(id);
    items.push({ doc: inp.docs[i], slot: slotOf.get(id), why });
  };
  const R = inp.results;
  for (const m of R.kindred) add(m.id, "kindred");
  for (const m of R.opponents) add(m.id, "opponent");
  for (const m of R.serendipity) add(m.id, "serendipity");
  const per = inp.perSession ?? 2;
  for (const p of inp.plan) {
    if (!p.confident || p.slot.kind === "poster") continue;
    const score = (id: string) => R.docScores[byId.get(id) ?? -1] ?? -Infinity;
    p.chosen.docIds.filter((id) => Number.isFinite(score(id))).sort((a, b) => score(b) - score(a)).slice(0, per).forEach((id) => add(id, "plan"));
  }
  // Schedule order; anything the program has not placed yet goes last.
  const key = (it: QuestionItem) => (it.slot ? `${it.slot.day} ${it.slot.start}` : "");
  const rank = (it: QuestionItem) => R.docScores[byId.get(it.doc.id)!] ?? -Infinity;
  return items.sort((a, b) => (key(a) === "" ? 1 : 0) - (key(b) === "" ? 1 : 0) || key(a).localeCompare(key(b)) || rank(b) - rank(a) || a.doc.name.localeCompare(b.doc.name));
}

export function whenLabel(it: QuestionItem): string {
  const parts: string[] = [];
  if (it.slot) {
    const day = new Date(it.slot.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
    const [h, m] = it.slot.start.split(":").map(Number);
    parts.push(`${day} ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`);
  }
  if (it.doc.sessionCode) parts.push(it.doc.sessionCode);
  if (it.doc.room) parts.push(it.doc.room);
  return parts.join(", ");
}

/** Plain text for the clipboard or a printout: one block per presenter. */
export function questionsText(items: QuestionItem[]): string {
  return items.map((it) => {
    const when = whenLabel(it);
    return [`${it.doc.name}${when ? ` (${when})` : ""}`, it.doc.title, `Ask: ${it.doc.askQuestion}`, `Push back: ${it.doc.challengeQuestion}`].join("\n");
  }).join("\n\n");
}
