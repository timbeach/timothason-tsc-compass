import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AXES, DISCIPLINES, METHODS, type Enrichment, type RawRecord } from "../core/types";
import { readJson } from "./io";

export const PROMPT_VERSION = "v1";
const MODEL = "claude-opus-5-5";

const axis = z.number().int().nullable();
export const EnrichmentSchema = z.object({
  core_claim: z.string(),
  discipline: z.enum(DISCIPLINES),
  methods: z.array(z.enum(METHODS)),
  axes: z.object({ ontology: axis, mechanism: axis, evidence: axis, scope: axis }),
  concepts: z.array(z.string()),
  ask_question: z.string(),
  challenge_question: z.string(),
});

export function contentHash(r: RawRecord): string {
  return createHash("sha256").update(`${PROMPT_VERSION}\n${r.title}\n${r.abstract}`).digest("hex");
}

export function buildPrompt(r: RawRecord): string {
  return `You are annotating one presentation from The Science of Consciousness 2026 conference program for an attendee matching tool. Read the title and abstract, then fill every field.

Title: ${r.title}
Presenter: ${r.name} (${r.affiliation})
Abstract:
${r.abstract}

Fields:
- core_claim: the presentation's central claim or contribution in plain language, at most 25 words, in your own words (do not quote the abstract).
- discipline: the single primary discipline.
- methods: every method from the allowed list that the abstract actually uses or proposes; empty if none apply.
- concepts: 3 to 6 short key phrases (1 to 4 words each) a curious attendee would search for.
- ask_question: one open, friendly question an interested attendee could ask the presenter.
- challenge_question: one respectful question a thoughtful skeptic of this position would ask.
- axes: for each axis, an integer from -2 to 2 describing what the abstract emphasizes, or null when the abstract takes no position on that axis. Prefer null over guessing. These describe the work, not the person.
  - ontology: -2 = consciousness is produced by physical processes (e.g. neural correlates as explanation, illusionism); 0 = neutral or dual-aspect; +2 = consciousness is fundamental or non-physical (e.g. idealism, panpsychism, cosmopsychism).
  - mechanism: -2 = classical neural or computational accounts (e.g. global workspace, predictive processing); +2 = quantum or biophysical-field accounts (e.g. Orch OR, EM field theories).
  - evidence: -2 = empirical or experimental work with data; +2 = conceptual, theoretical or philosophical argument.
  - scope: -2 = consciousness confined to brains and organisms; +2 = extended, nonlocal or transpersonal phenomena (e.g. psi, survival, field consciousness).`;
}

export function validateEnrichment(e: Enrichment): string[] {
  const p: string[] = [];
  const words = e.core_claim.trim().split(/\s+/).length;
  if (words > 25) p.push(`core_claim has ${words} words (max 25)`);
  for (const a of AXES) {
    const v = e.axes[a];
    if (v !== null && (v < -2 || v > 2)) p.push(`axis ${a}=${v} out of range`);
  }
  if (e.concepts.length < 3 || e.concepts.length > 6) p.push(`concepts has ${e.concepts.length} items (3 to 6)`);
  return p;
}

export type CallModel = (prompt: string) => Promise<{ ok: true; value: Enrichment } | { ok: false; reason: string }>;

export function claudeCaller(client = new Anthropic()): CallModel {
  return async (prompt) => {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(EnrichmentSchema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: `refusal ${res.stop_details?.category ?? ""}`.trim() };
    if (!res.parsed_output) return { ok: false, reason: `unparsed (${res.stop_reason})` };
    return { ok: true, value: res.parsed_output as Enrichment };
  };
}

interface CacheEntry { hash: string; model: string; promptVersion: string; enrichment: Enrichment }

export async function enrichAll(recs: RawRecord[], cacheDir: string, call: CallModel, concurrency = 4) {
  mkdirSync(cacheDir, { recursive: true });
  let done = 0, cached = 0;
  const failed: { id: string; reason: string }[] = [];
  const queue = [...recs];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const file = join(cacheDir, `${r.id}.json`);
      const hash = contentHash(r);
      if (existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as CacheEntry).hash === hash) { cached++; continue; }
      const res = await call(buildPrompt(r));
      if (!res.ok) { failed.push({ id: r.id, reason: res.reason }); continue; }
      const problems = validateEnrichment(res.value);
      if (problems.length) { failed.push({ id: r.id, reason: problems.join("; ") }); continue; }
      const entry: CacheEntry = { hash, model: MODEL, promptVersion: PROMPT_VERSION, enrichment: res.value };
      writeFileSync(file, JSON.stringify(entry, null, 1));
      done++;
      if (done % 20 === 0) console.log(`enriched ${done}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  failed.sort((a, b) => a.id.localeCompare(b.id));
  return { done, cached, failed };
}

export function loadEnrichments(recs: RawRecord[], cacheDir: string): Map<string, Enrichment> {
  const out = new Map<string, Enrichment>();
  const missing: string[] = [];
  for (const r of recs) {
    const file = join(cacheDir, `${r.id}.json`);
    const e = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CacheEntry) : null;
    if (!e || e.hash !== contentHash(r)) missing.push(r.id);
    else out.set(r.id, e.enrichment);
  }
  if (missing.length) throw new Error(`missing or stale enrichment for: ${missing.join(", ")}. Run npm run enrich.`);
  return out;
}

async function main() {
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const limit = Number(process.env.LIMIT ?? recs.length);
  const res = await enrichAll(recs.slice(0, limit), "data/build/enrichment", claudeCaller());
  console.log(JSON.stringify(res, null, 1));
  if (res.failed.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
