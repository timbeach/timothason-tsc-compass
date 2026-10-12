import type { Doc, Slot, SlotOption } from "./types";

export function sessionScore(talkScores: number[]): number {
  const s = talkScores.filter(Number.isFinite).sort((a, b) => b - a);
  if (s.length === 0) return -Infinity;
  const top = s.slice(0, 3);
  return s[0] + 0.5 * (top.reduce((a, b) => a + b, 0) / top.length);
}

/** confident: some option in this slot actually matched the query (or the user pinned one). */
export interface PlanItem { slot: Slot; chosen: SlotOption; score: number; pinned: boolean; confident: boolean; posters: string[] }

export interface ItineraryOpts {
  days: Set<string> | null; pins: Record<string, string>; posterN: number;
  /** Keep only these options (for example the streamed rooms for someone on Zoom). A slot left with none is dropped. */
  allowOption?: (o: SlotOption, slot: Slot) => boolean;
  /** Vary the evenings: across the concurrent slots, avoid the same dominant field night after night.
   * penalty is in score units; the default is a quarter of the spread of the finite session scores. */
  vary?: { disciplineOf: (docId: string) => string | undefined; penalty?: number };
}

type Scored = { o: SlotOption; score: number };

function dominant(o: SlotOption, disciplineOf: (id: string) => string | undefined): string | undefined {
  const counts = new Map<string, number>();
  for (const id of o.docIds) { const d = disciplineOf(id); if (d) counts.set(d, (counts.get(d) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Dynamic program over the ordered concurrent slots: the plan with the highest total score minus a penalty for
 * each pair of consecutive evenings spent in the same dominant field. Pinned slots are fixed and still count as
 * neighbours. Slots where nothing scored keep their default (first option, not confident). */
function varied(seq: { scored: Scored[]; pinIdx: number }[], disc: (o: SlotOption) => string | undefined, penalty: number): number[] {
  const live = seq.map((s) => s.pinIdx >= 0 || s.scored.some((x) => Number.isFinite(x.score)));
  const choices = seq.map((s) => (s.pinIdx >= 0 ? [s.pinIdx] : s.scored.map((_, i) => i).filter((i) => Number.isFinite(s.scored[i].score))));
  let prev: { total: number; path: number[]; disc: string | undefined }[] = [{ total: 0, path: [], disc: undefined }];
  seq.forEach((s, t) => {
    if (!live[t]) { prev = prev.map((p) => ({ ...p, path: [...p.path, 0], disc: undefined })); return; }
    const next: typeof prev = [];
    for (const i of choices[t]) {
      const d = disc(s.scored[i].o);
      let best = prev[0], bestTotal = -Infinity;
      for (const p of prev) {
        const total = p.total + (s.pinIdx >= 0 ? 0 : s.scored[i].score) - (d !== undefined && p.disc === d ? penalty : 0);
        if (total > bestTotal) { bestTotal = total; best = p; }
      }
      next.push({ total: bestTotal, path: [...best.path, i], disc: d });
    }
    prev = next;
  });
  return prev.reduce((a, b) => (b.total > a.total ? b : a)).path;
}

export function buildItinerary(slots: Slot[], scoreOf: (docId: string) => number, opts: ItineraryOpts): PlanItem[] {
  const kept = slots.filter((s) => !opts.days || opts.days.has(s.day))
    .map((slot) => ({ slot, options: opts.allowOption ? slot.options.filter((o) => opts.allowOption!(o, slot)) : slot.options }))
    .filter((x) => x.options.length > 0);
  const scoredAll = kept.map(({ slot, options }) => {
    const scored: Scored[] = options.map((o) => ({ o, score: sessionScore(o.docIds.map(scoreOf)) }));
    return { slot, scored, pinIdx: scored.findIndex((x) => x.o.id === opts.pins[slot.id]) };
  });
  // Default: the best option in each slot, independently.
  const choice = scoredAll.map((s) => (s.pinIdx >= 0 ? s.pinIdx : s.scored.reduce((a, b, i, arr) => (b.score > arr[a].score ? i : a), 0)));
  if (opts.vary) {
    const concIdx = scoredAll.map((s, i) => (s.slot.kind === "concurrent" ? i : -1)).filter((i) => i >= 0);
    const finite = concIdx.flatMap((i) => scoredAll[i].scored.map((x) => x.score)).filter(Number.isFinite);
    const penalty = opts.vary.penalty ?? (finite.length ? 0.25 * (Math.max(...finite) - Math.min(...finite)) : 0);
    const disc = (o: SlotOption) => dominant(o, opts.vary!.disciplineOf);
    varied(concIdx.map((i) => scoredAll[i]), disc, penalty).forEach((c, k) => { choice[concIdx[k]] = c; });
  }
  return scoredAll.map(({ slot, scored, pinIdx }, i) => {
    const best = scored[choice[i]];
    const posters = slot.kind === "poster"
      ? best.o.docIds.filter((id) => Number.isFinite(scoreOf(id))).sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, opts.posterN)
      : [];
    return { slot, chosen: best.o, score: best.score, pinned: pinIdx >= 0, confident: pinIdx >= 0 || Number.isFinite(best.score), posters };
  });
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const stamp = (day: string, hm: string) => `${day.replace(/-/g, "")}T${hm.replace(":", "")}00`;
function plusMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** RFC 5545: lines longer than 75 octets continue on the next line after CRLF + space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcs(plan: PlanItem[], docsById: Map<string, Doc>, now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tsc-compass//EN", "CALSCALE:GREGORIAN"];
  for (const p of plan.filter((x) => x.confident)) {
    const end = p.slot.end ?? plusMinutes(p.slot.start, 60);
    const posterLines = p.posters.map((id) => docsById.get(id)?.title ?? id);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.slot.id}-${p.chosen.id}@tsc-compass`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=America/Los_Angeles:${stamp(p.slot.day, p.slot.start)}`,
      `DTEND;TZID=America/Los_Angeles:${stamp(p.slot.day, end)}`,
      `SUMMARY:${esc(p.slot.kind === "poster" ? p.chosen.label : `${p.chosen.id}: ${p.chosen.label}`)}`,
      ...(p.chosen.room ? [`LOCATION:${esc(p.chosen.room)}`] : []),
      ...(posterLines.length ? [`DESCRIPTION:${esc("Posters to visit:\n" + posterLines.join("\n"))}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
