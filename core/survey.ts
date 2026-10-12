// Survey answers that shape the match beyond free text: what the attendee is here for, which fields are
// theirs and which they want to visit, and whether they are in the room or on Zoom.
// Last updated: 2026-10-11
import type { RankConfig } from "./rank";
import type { Discipline, Doc, Slot } from "./types";

export const GOALS = ["balance", "kindred", "argue", "explore"] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABELS: Record<Goal, [string, string]> = {
  balance: ["A bit of everything", "The default mix of kindred, opponents and one surprise."],
  kindred: ["Find my people", "More kindred spirits, and your position counts for more."],
  argue: ["Find a good argument", "More worthy opponents, and milder disagreement still qualifies."],
  explore: ["Get out of my bubble", "Wider spread in the kindred list and an easier bar for serendipity."],
};

/** Scales the tuned config for the stated goal. Only existing knobs move, so nothing new needs tuning. */
export function goalPreset(goal: Goal | undefined, cfg: RankConfig): RankConfig {
  switch (goal) {
    case "kindred": return { ...cfg, nKindred: cfg.nKindred + 4, nOpponents: Math.max(2, cfg.nOpponents - 2), beta: cfg.beta * 1.5 };
    case "argue": return { ...cfg, nOpponents: cfg.nOpponents + 4, oppFloor: Math.max(0.25, cfg.oppFloor - 0.1), beta: cfg.beta * 0.5 };
    case "explore": return { ...cfg, mmrLambda: Math.max(0.4, cfg.mmrLambda - 0.2), serendipityQuantile: Math.max(0.5, cfg.serendipityQuantile - 0.15) };
    default: return cfg;
  }
}

export interface DisciplinePrefs { mine: Discipline[]; curious: Discipline[] }

/** Soft lift in [0, 1] for a presentation in one of the attendee's own fields (1) or a field they want to visit (0.5).
 * It never excludes anything: the lift is scaled by affinityWeight in the ranker and sits beside topic relevance. */
export function affinity(prefs: DisciplinePrefs | undefined, d: Doc): number {
  if (!prefs) return 0;
  if (prefs.mine.includes(d.discipline)) return 1;
  if (prefs.curious.includes(d.discipline)) return 0.5;
  return 0;
}

/** Presentations in sessions the official program streams on Zoom (the stream belongs to the session, not the talk). */
export function streamedDocIds(slots: Slot[]): Set<string> {
  return new Set(slots.flatMap((s) => s.options.filter((o) => o.streamed).flatMap((o) => o.docIds)));
}

/** Days still ahead, as ISO dates, so the default plan starts today rather than on a day that has passed.
 * Once the conference is over every day is offered again, for people reading back. */
export function remainingDays(all: string[], today: string): string[] {
  const left = all.filter((d) => d >= today);
  return left.length ? left : all;
}
