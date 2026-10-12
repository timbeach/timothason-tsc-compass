import type { Doc, Slot, SlotOption } from "./types";

export function sessionScore(talkScores: number[]): number {
  const s = talkScores.filter(Number.isFinite).sort((a, b) => b - a);
  if (s.length === 0) return -Infinity;
  const top = s.slice(0, 3);
  return s[0] + 0.5 * (top.reduce((a, b) => a + b, 0) / top.length);
}

export interface PlanItem { slot: Slot; chosen: SlotOption; score: number; pinned: boolean; posters: string[] }

export function buildItinerary(
  slots: Slot[], scoreOf: (docId: string) => number,
  opts: { days: Set<string> | null; pins: Record<string, string>; posterN: number },
): PlanItem[] {
  return slots.filter((s) => !opts.days || opts.days.has(s.day)).map((slot) => {
    const scored = slot.options.map((o) => ({ o, score: sessionScore(o.docIds.map(scoreOf)) }));
    const pin = scored.find((x) => x.o.id === opts.pins[slot.id]);
    const best = pin ?? scored.reduce((a, b) => (b.score > a.score ? b : a));
    const posters = slot.kind === "poster"
      ? best.o.docIds.filter((id) => Number.isFinite(scoreOf(id))).sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, opts.posterN)
      : [];
    return { slot, chosen: best.o, score: best.score, pinned: !!pin, posters };
  });
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const stamp = (day: string, hm: string) => `${day.replace(/-/g, "")}T${hm.replace(":", "")}00`;
function plusMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function toIcs(plan: PlanItem[], docsById: Map<string, Doc>): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tsc-compass//EN", "CALSCALE:GREGORIAN"];
  for (const p of plan) {
    const end = p.slot.end ?? plusMinutes(p.slot.start, 60);
    const posterLines = p.posters.map((id) => docsById.get(id)?.title ?? id);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.slot.id}-${p.chosen.id}@tsc-compass`,
      `DTSTART;TZID=America/Los_Angeles:${stamp(p.slot.day, p.slot.start)}`,
      `DTEND;TZID=America/Los_Angeles:${stamp(p.slot.day, end)}`,
      `SUMMARY:${esc(p.slot.kind === "poster" ? p.chosen.label : `${p.chosen.id}: ${p.chosen.label}`)}`,
      ...(p.chosen.room ? [`LOCATION:${esc(p.chosen.room)}`] : []),
      ...(posterLines.length ? [`DESCRIPTION:${esc("Posters to visit:\n" + posterLines.join("\n"))}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
