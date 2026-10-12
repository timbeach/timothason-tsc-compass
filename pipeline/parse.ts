import { readdirSync, readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import type { PresType, RawRecord } from "../core/types";
import { writeJson } from "./io";

const MONTH = "October";
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseDayName(s: string): string | null {
  const m = s.match(new RegExp(`${MONTH} (\\d{1,2})`));
  return m ? `2026-10-${m[1].padStart(2, "0")}` : null;
}

export function parsePresentation(s: string) {
  const parts = ws(s).split(" \u00b7 ").map((p) => p.trim()).filter(Boolean);
  const out = { day: null as string | null, sessionCode: null as string | null, sessionName: null as string | null, room: null as string | null };
  if (parts.length === 0) return out;
  out.day = parseDayName(parts[0]);
  const sess = parts[1] ?? "";
  const coded = sess.match(/^([A-Z]{2,3}-\d+)\s*(?::|\u2014|\u2013|-)\s*(.+)$/);
  const poster = sess.match(/^Poster Session (\d+)$/);
  if (coded) { out.sessionCode = coded[1]; out.sessionName = coded[2].trim(); }
  else if (poster) { out.sessionCode = `PS-${poster[1]}`; out.sessionName = sess; }
  else if (sess) out.sessionName = sess;
  out.room = parts[2] ?? null;
  return out;
}

const TYPES: PresType[] = ["Plenary", "Concurrent", "Poster", "Panel", "Remote"];

export function parseAbstractPage(slug: string, html: string): RawRecord {
  const $ = cheerio.load(html);
  const blocks = $(".abstract-wrap > .abstract-text");
  const para = (i: number) => blocks.eq(i).find("p").map((_, p) => ws($(p).text())).get().join(" ") || ws(blocks.eq(i).text());
  const title = ws($(".talk-title").first().text());
  const abstract = blocks.length > 0 ? para(0) : "";
  if (!title || !abstract) throw new Error(`missing title or abstract for ${slug}`);
  const tagTexts = $(".tags .tag").map((_, t) => ws($(t).text())).get();
  const types = TYPES.filter((t) => tagTexts.includes(t)) as PresType[];
  const workshops = $(".tags a.tag-workshop").map((_, a) => ($(a).attr("href") ?? "").split("#")[1]).get().filter(Boolean);
  if (workshops.length) types.push("Workshop");
  return {
    id: slug,
    name: ws($(".speaker-info h2").first().text()),
    affiliation: ws($(".affiliation").first().text()),
    title,
    abstract,
    bio: blocks.length > 1 ? para(1) : "",
    url: `https://tsc2026.org/abstracts_html/${slug}.html`,
    ...parsePresentation($(".presentation").first().text()),
    types,
    workshops,
  };
}

function main() {
  const dir = "data/raw/abstracts";
  const recs = readdirSync(dir).filter((f) => f.endsWith(".html")).sort()
    .map((f) => parseAbstractPage(f.replace(/\.html$/, ""), readFileSync(`${dir}/${f}`, "utf8")));
  writeJson("data/raw/records.json", recs);
  const noSession = recs.filter((r) => !r.sessionCode && !r.workshops.length).map((r) => r.id);
  console.log(`${recs.length} records; without session code: ${noSession.length}`, noSession.slice(0, 10));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
