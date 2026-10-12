import { expect, test } from "vitest";
import type { RawRecord } from "../../core/types";
import { attachDocs, concurrentSlots, parseClock, plenarySlots, posterSlots, workshopSlots } from "../../pipeline/schedule";

const PROGRAM = `<h3>Monday, October 12</h3><div class="day-grid">
<div class="dg-time">8:30 am</div><div class="dg-content"><div class="dg-block bg-plenary" id="pl-1">
<div class="session-title"><span class="pl-chip">PL-1</span> Quantum Biophotonics in Living Systems &mdash; <a href="map.html#paradise-ballroom">Paradise Ballroom</a></div></div></div>
<div class="dg-time">10:40 am</div><div class="dg-content"><div class="dg-block bg-break"><div class="session-title">Break</div></div></div>
<div class="dg-time">11:10 am</div><div class="dg-content"><div class="dg-block bg-plenary" id="pl-2">
<div class="session-title"><span class="pl-chip">PL-2</span> Contemplation &mdash; <a>Paradise Ballroom</a></div></div></div>
</div>`;

const CONC = `<div class="session-panel" id="panel-mon-1"><h3>MON-1 &mdash; Quantum Theories</h3>
<div class="ws-meta">Monday, October 12 &middot; 5:00&ndash;7:05 pm &middot; Chair: A &middot; <a>Paradise Ballroom</a></div></div>
<div class="session-panel" id="panel-mon-2"><h3>MON-2 &mdash; Neurobiological Theories</h3>
<div class="ws-meta">Monday, October 12 &middot; 5:00&ndash;7:05 pm &middot; Chair: B &middot; <a>Garden Room</a></div></div>`;

const POSTERS = `<div class="session-panel" id="panel-ps1"><h3>Poster Session 1</h3>
<div class="ws-meta">Tuesday, October 13 &middot; 7:30 pm &middot; <a>Mission Bay Room</a></div></div>`;

const WORKSHOPS = `<div class="session-panel" id="s2"><h3>Quantum Biology and the Brain</h3>
<div class="ws-meta">Sunday &middot; Part 1: 8:30 &ndash; 10:15 am &middot; Part 2: 10:45 am &ndash; 12:30 pm</div></div>
<div class="session-panel" id="s11"><h3>Integrated Information Theory</h3>
<div class="ws-meta">Sunday afternoon &middot; 2:00 pm &ndash; 3:45 pm &middot; Chair: Melanie Boly</div></div>
<script>var WORKSHOP_HASH = { 'quantum-biology': 's2', 'quantum': 's2', 'iit': 's11' };</script>`;

test("parseClock", () => {
  expect(parseClock("5:00 pm")).toBe("17:00");
  expect(parseClock("12:30 pm")).toBe("12:30");
  expect(parseClock("12:15 am")).toBe("00:15");
  expect(parseClock("8:30", "am")).toBe("08:30");
});

test("plenarySlots reads start times and skips breaks", () => {
  const s = plenarySlots(PROGRAM);
  expect(s.map((x) => [x.id, x.day, x.start, x.kind])).toEqual([
    ["pl-1", "2026-10-12", "08:30", "plenary"],
    ["pl-2", "2026-10-12", "11:10", "plenary"],
  ]);
  expect(s[0].options).toEqual([{ id: "PL-1", label: "Quantum Biophotonics in Living Systems", room: "Paradise Ballroom", docIds: [] }]);
});

test("concurrentSlots groups parallel sessions into one slot", () => {
  const s = concurrentSlots(CONC);
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ id: "conc-2026-10-12", day: "2026-10-12", start: "17:00", end: "19:05", kind: "concurrent" });
  expect(s[0].options.map((o) => [o.id, o.label, o.room])).toEqual([
    ["MON-1", "Quantum Theories", "Paradise Ballroom"],
    ["MON-2", "Neurobiological Theories", "Garden Room"],
  ]);
});

test("posterSlots", () => {
  expect(posterSlots(POSTERS)).toEqual([{
    id: "poster-PS-1", day: "2026-10-13", start: "19:30", end: null, kind: "poster",
    options: [{ id: "PS-1", label: "Poster Session 1", room: "Mission Bay Room", docIds: [] }],
  }]);
});

test("workshopSlots groups by first start time and carries anchor aliases", () => {
  const s = workshopSlots(WORKSHOPS);
  expect(s.map((x) => [x.id, x.start, x.end, x.options.map((o) => o.id)])).toEqual([
    ["ws-08:30", "08:30", "10:15", ["s2"]],
    ["ws-14:00", "14:00", "15:45", ["s11"]],
  ]);
  expect(s[0].day).toBe("2026-10-11");
});

test("attachDocs fills docIds from record session codes and workshop anchors", () => {
  const rec = (id: string, sessionCode: string | null, workshops: string[] = []) =>
    ({ id, sessionCode, workshops } as unknown as RawRecord);
  const slots = [...concurrentSlots(CONC), ...workshopSlots(WORKSHOPS)];
  const out = attachDocs(slots, [rec("a", "MON-1"), rec("b", "MON-1"), rec("c", "MON-2"), rec("d", null, ["quantum"])], WORKSHOPS);
  expect(out[0].options[0].docIds).toEqual(["a", "b"]);
  expect(out[0].options[1].docIds).toEqual(["c"]);
  expect(out[1].options[0].docIds).toEqual(["d"]);
});
