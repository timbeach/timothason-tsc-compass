import * as cheerio from "cheerio";
import type { RawRecord, Slot, SlotOption } from "../core/types";
import { parseDayName } from "./parse";
import { readJson, writeJson } from "./io";
import { readFileSync } from "node:fs";

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const SUNDAY = "2026-10-11";

export function parseClock(s: string, meridiem?: string): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) throw new Error(`bad clock: ${s}`);
  let h = Number(m[1]);
  const mer = (m[3] ?? meridiem ?? "").toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** First "h:mm[ am|pm] (dash) h:mm am|pm" range in a string. */
function firstRange(s: string): { start: string; end: string } | null {
  const m = s.match(/(\d{1,2}:\d{2})\s*(am|pm)?\s*[\u2013\u2014-]\s*(\d{1,2}:\d{2})\s*(am|pm)/i);
  if (!m) return null;
  return { start: parseClock(m[1], m[2] ?? m[4]), end: parseClock(m[3], m[4]) };
}

export function plenarySlots(html: string): Slot[] {
  const $ = cheerio.load(html);
  const out: Slot[] = [];
  $("h3").each((_, h) => {
    const day = parseDayName($(h).text());
    if (!day) return;
    $(h).next(".day-grid").children(".dg-time").each((_, t) => {
      const block = $(t).next(".dg-content").find(".dg-block.bg-plenary[id^='pl-']").first();
      if (!block.length) return;
      const id = block.attr("id")!;
      const title = block.find(".session-title").first().clone();
      title.find(".pl-chip").remove();
      const room = ws(title.find("a").last().text()) || null;
      const label = ws(title.text()).split(/\s+\u2014\s+/)[0];
      out.push({ id, day, start: parseClock(ws($(t).text())), end: null, kind: "plenary",
        options: [{ id: id.toUpperCase(), label, room, docIds: [] }] });
    });
  });
  return out;
}

export function concurrentSlots(html: string): Slot[] {
  const $ = cheerio.load(html);
  const bySlot = new Map<string, Slot>();
  $(".session-panel").each((_, p) => {
    const h3 = ws($(p).find("h3").first().text());
    const m = h3.match(/^([A-Z]{3}-\d+)\s*\u2014\s*(.+)$/);
    if (!m) return;
    const meta = $(p).find(".ws-meta").first();
    const metaText = ws(meta.text());
    const day = parseDayName(metaText);
    const range = firstRange(metaText);
    if (!day || !range) return;
    const id = `conc-${day}`;
    const slot = bySlot.get(id) ?? { id, day, start: range.start, end: range.end, kind: "concurrent" as const, options: [] };
    slot.options.push({ id: m[1], label: m[2], room: ws(meta.find("a").last().text()) || null, docIds: [] });
    bySlot.set(id, slot);
  });
  return [...bySlot.values()];
}

export function posterSlots(html: string): Slot[] {
  const $ = cheerio.load(html);
  const out: Slot[] = [];
  $(".session-panel").each((_, p) => {
    const h3 = ws($(p).find("h3").first().text());
    const m = h3.match(/^Poster Session (\d+)$/);
    if (!m) return;
    const meta = $(p).find(".ws-meta").first();
    const metaText = ws(meta.text());
    const day = parseDayName(metaText);
    const t = metaText.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    if (!day || !t) return;
    const code = `PS-${m[1]}`;
    out.push({ id: `poster-${code}`, day, start: parseClock(t[1]), end: null, kind: "poster",
      options: [{ id: code, label: h3, room: ws(meta.find("a").last().text()) || null, docIds: [] }] });
  });
  return out;
}

export function workshopAliases(html: string): Map<string, string> {
  const block = html.match(/WORKSHOP_HASH\s*=\s*\{([^}]*)\}/);
  const out = new Map<string, string>();
  if (!block) return out;
  for (const m of block[1].matchAll(/'([a-z0-9-]+)'\s*:\s*'(s\d+)'/g)) out.set(m[1], m[2]);
  return out;
}

export function workshopSlots(html: string): Slot[] {
  const $ = cheerio.load(html);
  const bySlot = new Map<string, Slot>();
  $(".session-panel[id]").each((_, p) => {
    const id = $(p).attr("id")!;
    if (!/^s\d+$/.test(id)) return;
    const range = firstRange(ws($(p).find(".ws-meta").first().text()));
    if (!range) return;
    const slotId = `ws-${range.start}`;
    const slot = bySlot.get(slotId) ?? { id: slotId, day: SUNDAY, start: range.start, end: range.end, kind: "workshop" as const, options: [] };
    slot.options.push({ id, label: ws($(p).find("h3").first().text()), room: null, docIds: [] });
    bySlot.set(slotId, slot);
  });
  return [...bySlot.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function attachDocs(slots: Slot[], recs: RawRecord[], workshopsHtml: string): Slot[] {
  const alias = workshopAliases(workshopsHtml);
  const docsFor = (o: SlotOption, kind: Slot["kind"]) =>
    recs.filter((r) => kind === "workshop"
      ? r.workshops.some((w) => (alias.get(w) ?? w) === o.id)
      : r.sessionCode === o.id).map((r) => r.id);
  return slots.map((s) => ({ ...s, options: s.options.map((o) => ({ ...o, docIds: docsFor(o, s.kind) })) }));
}

function main() {
  const page = (p: string) => readFileSync(`data/raw/pages/${p}`, "utf8");
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const raw = [
    ...workshopSlots(page("workshops.html")),
    ...plenarySlots(page("program_details.html")),
    ...concurrentSlots(page("concurrent.html")),
    ...posterSlots(page("posters.html")),
  ];
  const slots = attachDocs(raw, recs, page("workshops.html"))
    .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
  writeJson("data/build/slots.json", slots);
  const placed = new Set(slots.flatMap((s) => s.options.flatMap((o) => o.docIds)));
  const unplaced = recs.filter((r) => !placed.has(r.id)).map((r) => `${r.id} (${r.sessionCode})`);
  console.log(`${slots.length} slots; unplaced records: ${unplaced.length}`, unplaced.slice(0, 10));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
