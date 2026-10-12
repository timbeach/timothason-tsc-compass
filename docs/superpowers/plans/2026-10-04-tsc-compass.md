# TSC Compass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static, browser-only matcher for the TSC 2026 program. It returns kindred, opponent and serendipity matches plus a conflict-free itinerary, and an offline evaluation backs the matching. It must be live before Oct 11, 2026.

**Architecture:** A Node/TypeScript build pipeline scrapes tsc2026.org, enriches each abstract once with Claude, embeds the abstracts with a quantized transformers.js model, fits stance-axis regressors and exports public JSON and binary data. A pure `core/` library (retrieval, stance, ranking, explanations, itinerary) is shared by the evaluation harness and the Vite web app, which embeds the user's query in a Web Worker with the same model.

**Tech Stack:** Node 26, TypeScript 5 (ESM), tsx, vitest, cheerio, @anthropic-ai/sdk 0.131 + zod 4, @huggingface/transformers 4.3, umap-js 1.4, yaml, Vite, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-10-04-tsc-compass-design.md`

## Global Constraints

- Data source: only `https://tsc2026.org/` (listing pages plus `abstracts_html/<slug>.html`). Never use third-party data.
- Polite scraping: cache every page once, at least 0.4s between network requests, User-Agent `tsc-compass/0.1 (unofficial attendee tool)`.
- Do not republish abstracts. The deployed bundle contains title, speaker, affiliation, session, `coreClaim` (25 words max), the official URL, and term-count maps, never abstract or bio text. Raw text lives in `data/raw/` (gitignored).
- Enrichment model: `claude-opus-5-5`, structured output via `client.beta.messages.parse` + `betaZodOutputFormat`, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Embedding models must run quantized (`dtype: "q8"`) in the browser, at 40 MB or less.
- Stance axes, in order: `ontology`, `mechanism`, `evidence`, `scope`. Scores are integers from -2 to +2, or `null`.
- Axis gates: an axis is auto-projected only if human agreement Spearman ≥ 0.6 and embedding CV Spearman ≥ 0.5. Otherwise it's slider-only and never used for opponents.
- Queries never leave the device: the model files are self-hosted under `web/public/models/`, so there are no runtime requests to third-party hosts.
- Writing style for all copy, comments and commit messages: no em dashes or en dashes as punctuation. Inside code, match those characters in source data with `\u2014` and `\u2013` escapes.
- Commits: no `Co-Authored-By` or AI attribution trailers (a hook blocks them).
- Repository: private GitHub repo `tsc-compass` until launch.
- Time zone for the itinerary: `America/Los_Angeles`.

## Review Focus

1. **Very short query** (a single acronym like "IIT" or "DMT"): the user expects talks that literally mention it at the top, even when the dense similarity is flat. Covered by a hybrid retrieval test in Task 7.
2. **Very long query** (a pasted 1,500-word abstract): the user expects it to be used whole, not silently cut at 512 tokens. Covered by a chunked query embedding test in Task 6.
3. **Nothing in the program matches** (an off-topic or non-English query): the user expects an honest "no strong matches" banner, not a confident list. Covered by the `weak` flag test in Task 9.
4. **The embedding model fails to load** (a phone at the venue, offline, slow network): the user expects lexical results with a banner, not a blank page. Covered by the lexical fallback tests in Tasks 7 and 16.
5. **Stale state after a re-scrape** (pins in localStorage reference sessions that no longer exist; records without enrichment): pins are ignored silently, and the export fails loudly. Covered by tests in Tasks 11 and 12.

---

## File Structure

```
tsc-compass/
  package.json, tsconfig.json, vitest.config.ts, .gitignore, README.md
  config/compass.json            chosen retrieval/rank config (written in Task 14)
  core/                          pure TS, no Node or DOM APIs
    types.ts                     shared types and constants (AXES, DISCIPLINES, METHODS)
    random.ts                    seeded PRNG, shuffle
    vec.ts                       vector math, zscore, quantile
    lexical.ts                   tokenizer, stemmer, BM25 (serializable index)
    models.ts                    embedding model registry
    embedtext.ts                 chunking, doc and query embedding via an injected EmbedFn
    retrieval.ts                 dense, lexical, hybrid, RRF relevance
    stance.ts                    ridge regression, CV, projection, distance, spearman
    rank.ts                      kindred (MMR), opponents, serendipity, weak flag, all-doc scores
    explain.ts                   "why this matched" strings
    itinerary.ts                 session scoring, per-slot selection, pins, ICS export
  pipeline/                      Node-only build scripts
    fetch.ts                     cached polite fetcher
    scrape.ts                    downloads listing and abstract pages
    parse.ts                     abstract page -> RawRecord
    schedule.ts                  listing pages -> Slot[]
    enrich.ts                    Claude enrichment with cache
    embedder.ts                  transformers.js Node EmbedFn
    embed.ts                     writes doc embeddings for each model x chunking
    axes.ts                      fits AxisModel[] with gates
    layout.ts                    UMAP 2D coordinates
    export.ts                    builds web/public/data and copies model files
    io.ts                        read/write helpers for f32 binaries and JSON
  eval/
    metrics.ts                   MRR, recall@k, nDCG@k, bootstrap CI
    e1.ts                        session recovery
    personas.yaml                hand-written personas
    label-personas.ts            blind labeling CLI (writes eval/labels.json)
    label-stance.ts              human stance labeling CLI (writes eval/human_axes.json)
    run.ts                       grid evaluation -> eval/report.md
  web/
    index.html
    src/main.ts                  UI wiring
    src/worker.ts                embedding worker
    src/data.ts                  loads public data
    src/engine.ts                query -> Results + itinerary (pure, uses core)
    src/storage.ts               safe localStorage
    src/ui/*.ts                  render functions
    src/style.css
  tests/                         vitest specs mirroring the folders above
  e2e/                           Playwright specs
```

---

### Task 1: Repository scaffold and private remote

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts used by every later task: `test`, `typecheck`, `scrape`, `parse`, `schedule`, `enrich`, `embed`, `axes`, `layout`, `export`, `eval`, `label:personas`, `label:stance`, `dev`, `build`, `e2e`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "tsc-compass",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "scrape": "tsx pipeline/scrape.ts",
    "parse": "tsx pipeline/parse.ts",
    "schedule": "tsx pipeline/schedule.ts",
    "enrich": "tsx pipeline/enrich.ts",
    "embed": "tsx pipeline/embed.ts",
    "axes": "tsx pipeline/axes.ts",
    "layout": "tsx pipeline/layout.ts",
    "export": "tsx pipeline/export.ts",
    "eval": "tsx eval/run.ts",
    "label:personas": "tsx eval/label-personas.ts",
    "label:stance": "tsx eval/label-stance.ts",
    "dev": "vite web",
    "build": "vite build web --outDir ../dist --emptyOutDir",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i @anthropic-ai/sdk@0.131 zod@4 @huggingface/transformers@4.3 umap-js@1.4 cheerio@1.2 yaml
npm i -D typescript tsx vitest vite @playwright/test @types/node
```
Expected: installs without errors.

- [ ] **Step 3: Write tsconfig.json, vitest.config.ts, .gitignore**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "lib": ["ES2023", "DOM", "WebWorker"],
    "types": ["node"]
  },
  "include": ["core", "pipeline", "eval", "web/src", "tests", "e2e"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 } });
```

`.gitignore`:
```
node_modules/
data/raw/
data/build/emb/
.hfcache/
dist/
web/public/data/
web/public/models/
test-results/
playwright-report/
```

- [ ] **Step 4: Write a smoke test and run it**

`tests/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("toolchain runs", () => { expect(1 + 1).toBe(2); });
```
Run: `npm test`. Expected: 1 passed.

- [ ] **Step 5: README stub, then commit and create the private remote**

`README.md`:
```markdown
# TSC Compass

Unofficial, browser-only companion for The Science of Consciousness 2026. Not affiliated with or endorsed by TSC. Program data comes from https://tsc2026.org/.

See docs/superpowers/specs for the design and docs/superpowers/plans for the build plan.
```

Run:
```bash
git add -A && git commit -m "chore: scaffold TypeScript project"
gh auth status
gh repo create tsc-compass --private --source . --push
git status
```
Expected: the repo is created as private, and `git status` shows the branch is up to date with `origin`.

---

### Task 2: Shared types, vector utilities and PRNG

**Files:**
- Create: `core/types.ts`, `core/random.ts`, `core/vec.ts`
- Test: `tests/core/vec.test.ts`

**Interfaces:**
- Produces:
  - `AXES`, `Axis`, `AxisScores`, `DISCIPLINES`, `Discipline`, `METHODS`, `Method`, `PresType`, `RawRecord`, `Enrichment`, `Doc`, `SlotKind`, `Slot`, `SlotOption` (core/types.ts)
  - `mulberry32(seed: number): () => number`, `shuffle<T>(xs: T[], rnd: () => number): T[]` (core/random.ts)
  - `dot(a, b): number`, `l2normalize(v: Float32Array): Float32Array`, `meanVec(vs: Float32Array[]): Float32Array`, `row(m: Float32Array, dim: number, i: number): Float32Array`, `zscore(xs: ArrayLike<number>): Float64Array`, `quantile(xs: number[], q: number): number` (core/vec.ts)

- [ ] **Step 1: Write core/types.ts**

```ts
export const AXES = ["ontology", "mechanism", "evidence", "scope"] as const;
export type Axis = (typeof AXES)[number];
export type AxisScores = Record<Axis, number | null>;

export const DISCIPLINES = [
  "neuroscience", "physics", "biology", "philosophy", "psychology",
  "contemplative/experiential", "anomalous/psi research", "AI/computation",
  "arts/humanities", "medicine/clinical",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const METHODS = [
  "EEG/MEG", "fMRI", "other imaging", "anesthesia", "psychedelics", "meditation",
  "phenomenology/first-person", "survey/questionnaire", "formal/mathematical model",
  "computational simulation", "lab physics/biophysics", "animal study", "clinical",
  "theoretical argument", "case reports", "art/practice",
] as const;
export type Method = (typeof METHODS)[number];

export type PresType = "Plenary" | "Concurrent" | "Poster" | "Panel" | "Remote" | "Workshop";

/** One presentation as scraped from its official abstract page. Contains raw text: never exported. */
export interface RawRecord {
  id: string;            // slug, e.g. "jack-tuszynski"
  name: string;
  affiliation: string;
  title: string;
  abstract: string;
  bio: string;
  url: string;
  day: string | null;    // ISO date "2026-10-12"
  sessionCode: string | null; // "PL-1", "MON-1", "PS-1"
  sessionName: string | null;
  room: string | null;
  types: PresType[];
  workshops: string[];   // workshop anchor ids from tag links, e.g. ["quantum-biology"]
}

export interface Enrichment {
  core_claim: string;
  discipline: Discipline;
  methods: Method[];
  axes: AxisScores;
  concepts: string[];
  ask_question: string;
  challenge_question: string;
}

/** Public, exportable view of a presentation. */
export interface Doc {
  id: string;
  name: string;
  affiliation: string;
  title: string;
  url: string;
  day: string | null;
  sessionCode: string | null;
  sessionName: string | null;
  room: string | null;
  types: PresType[];
  workshops: string[];
  coreClaim: string;
  discipline: Discipline;
  methods: Method[];
  axes: AxisScores;
  concepts: string[];
  askQuestion: string;
  challengeQuestion: string;
  xy: [number, number];
}

export type SlotKind = "workshop" | "plenary" | "concurrent" | "poster";
export interface SlotOption { id: string; label: string; room: string | null; docIds: string[] }
export interface Slot { id: string; day: string; start: string; end: string | null; kind: SlotKind; options: SlotOption[] }
```

- [ ] **Step 2: Write the failing tests for vec and random**

`tests/core/vec.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { dot, l2normalize, meanVec, quantile, row, zscore } from "../../core/vec";
import { mulberry32, shuffle } from "../../core/random";

describe("vec", () => {
  test("dot and normalize", () => {
    const v = l2normalize(new Float32Array([3, 4]));
    expect(v[0]).toBeCloseTo(0.6); expect(v[1]).toBeCloseTo(0.8);
    expect(dot(v, v)).toBeCloseTo(1);
  });
  test("normalize zero vector stays zero", () => {
    expect(Array.from(l2normalize(new Float32Array([0, 0])))).toEqual([0, 0]);
  });
  test("meanVec", () => {
    expect(Array.from(meanVec([new Float32Array([1, 3]), new Float32Array([3, 5])]))).toEqual([2, 4]);
  });
  test("row slices a flat matrix", () => {
    const m = new Float32Array([1, 2, 3, 4, 5, 6]);
    expect(Array.from(row(m, 3, 1))).toEqual([4, 5, 6]);
  });
  test("zscore with constant input returns zeros", () => {
    expect(Array.from(zscore([2, 2, 2]))).toEqual([0, 0, 0]);
  });
  test("zscore has mean 0", () => {
    const z = zscore([1, 2, 3, 4]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
  test("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.7)).toBeCloseTo(7);
  });
});

describe("random", () => {
  test("mulberry32 is deterministic", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  test("shuffle is a permutation and does not mutate input", () => {
    const xs = [1, 2, 3, 4, 5];
    const s = shuffle(xs, mulberry32(1));
    expect([...s].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/vec.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 4: Implement core/random.ts and core/vec.ts**

`core/random.ts`:
```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

`core/vec.ts`:
```ts
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function l2normalize(v: Float32Array): Float32Array {
  const n = Math.sqrt(dot(v, v));
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function meanVec(vs: Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

export function row(m: Float32Array, dim: number, i: number): Float32Array {
  return m.subarray(i * dim, (i + 1) * dim);
}

export function zscore(xs: ArrayLike<number>): Float64Array {
  const n = xs.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += xs[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (xs[i] - mean) ** 2;
  const sd = Math.sqrt(v / n);
  const out = new Float64Array(n);
  if (sd === 0) return out;
  for (let i = 0; i < n; i++) out[i] = (xs[i] - mean) / sd;
  return out;
}

export function quantile(xs: number[], q: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
```

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npx vitest run tests/core/vec.test.ts && npm run typecheck`. Expected: all pass, no type errors.
```bash
git add core tests && git commit -m "feat(core): shared types, vector utils, seeded PRNG"
```

---

### Task 3: Polite cached fetcher and scrape script

**Files:**
- Create: `pipeline/fetch.ts`, `pipeline/scrape.ts`
- Test: `tests/pipeline/fetch.test.ts`

**Interfaces:**
- Produces: `cachedFetch(url: string, cacheFile: string, opts?: { fetchFn?: typeof fetch; delayMs?: number }): Promise<string>`; `listAbstractSlugs(listingHtml: string[]): string[]`; `LISTING_PAGES` (string[]); files `data/raw/pages/<page>.html` and `data/raw/abstracts/<slug>.html`.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/fetch.test.ts`:
```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { cachedFetch } from "../../pipeline/fetch";
import { listAbstractSlugs } from "../../pipeline/scrape";

test("cachedFetch hits the network once, then reads the cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tscc-"));
  const fetchFn = vi.fn(async () => new Response("<html>ok</html>", { status: 200 }));
  const file = join(dir, "a.html");
  expect(await cachedFetch("https://tsc2026.org/a.html", file, { fetchFn, delayMs: 0 })).toBe("<html>ok</html>");
  expect(await cachedFetch("https://tsc2026.org/a.html", file, { fetchFn, delayMs: 0 })).toBe("<html>ok</html>");
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(readFileSync(file, "utf8")).toBe("<html>ok</html>");
  const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^tsc-compass\//);
});

test("cachedFetch throws on non-200 and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tscc-"));
  const fetchFn = vi.fn(async () => new Response("nope", { status: 404 }));
  await expect(cachedFetch("https://tsc2026.org/x.html", join(dir, "x.html"), { fetchFn, delayMs: 0 })).rejects.toThrow(/404/);
});

test("cachedFetch refuses hosts other than tsc2026.org", async () => {
  await expect(cachedFetch("https://example.org/elsewhere", "/tmp/never.html", { delayMs: 0 })).rejects.toThrow(/tsc2026\.org/);
});

test("listAbstractSlugs dedupes and sorts across pages", () => {
  const a = '<a href="abstracts_html/b-two.html">x</a><a href="abstracts_html/a-one.html#x">y</a>';
  const b = '<a href="abstracts_html/b-two.html">z</a>';
  expect(listAbstractSlugs([a, b])).toEqual(["a-one", "b-two"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pipeline/fetch.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement pipeline/fetch.ts and pipeline/scrape.ts**

`pipeline/fetch.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UA = "tsc-compass/0.1 (unofficial attendee tool)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cachedFetch(
  url: string,
  cacheFile: string,
  opts: { fetchFn?: typeof fetch; delayMs?: number } = {},
): Promise<string> {
  if (new URL(url).hostname !== "tsc2026.org") throw new Error(`refusing non tsc2026.org url: ${url}`);
  if (existsSync(cacheFile)) return readFileSync(cacheFile, "utf8");
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}`);
  const body = await res.text();
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, body);
  await sleep(opts.delayMs ?? 400);
  return body;
}
```

`pipeline/scrape.ts`:
```ts
import { cachedFetch } from "./fetch";

export const BASE = "https://tsc2026.org/";
export const LISTING_PAGES = ["program_details.html", "program.html", "concurrent.html", "posters.html", "workshops.html"];

export function listAbstractSlugs(listingHtml: string[]): string[] {
  const slugs = new Set<string>();
  for (const html of listingHtml)
    for (const m of html.matchAll(/abstracts_html\/([^"#]+)\.html/g)) slugs.add(m[1]);
  return [...slugs].sort();
}

async function main() {
  const pages: string[] = [];
  for (const p of LISTING_PAGES) pages.push(await cachedFetch(BASE + p, `data/raw/pages/${p}`));
  const slugs = listAbstractSlugs(pages);
  console.log(`${slugs.length} abstract pages`);
  let i = 0;
  for (const s of slugs) {
    await cachedFetch(`${BASE}abstracts_html/${s}.html`, `data/raw/abstracts/${s}.html`);
    if (++i % 50 === 0) console.log(i);
  }
  console.log("done");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/pipeline/fetch.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Run the real scrape**

Run: `npm run scrape`. Expected: `293 abstract pages` (or the current count), then `done`. The `data/raw/abstracts/` directory holds one file per slug. A re-run makes no network calls and finishes in under 2 seconds.

- [ ] **Step 6: Commit**

```bash
git add pipeline tests && git commit -m "feat(pipeline): polite cached scraper for tsc2026.org"
```

---

### Task 4: Parse abstract pages into RawRecords

**Files:**
- Create: `pipeline/parse.ts`, `pipeline/io.ts`
- Test: `tests/pipeline/parse.test.ts`

**Interfaces:**
- Consumes: `RawRecord`, `PresType` (Task 2); `data/raw/abstracts/*.html` (Task 3).
- Produces: `parseDayName(s: string): string | null`; `parsePresentation(s: string): { day: string | null; sessionCode: string | null; sessionName: string | null; room: string | null }`; `parseAbstractPage(slug: string, html: string): RawRecord`; `readJson<T>(path): T`, `writeJson(path, value)`, `writeF32(path, data: Float32Array)`, `readF32(path): Float32Array` (pipeline/io.ts); output file `data/raw/records.json` (RawRecord[] sorted by id).

- [ ] **Step 1: Write the failing test**

`tests/pipeline/parse.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseAbstractPage, parseDayName, parsePresentation } from "../../pipeline/parse";

const PAGE = `<html><body>
<div class="abstract-wrap">
<div class="speaker-card"><div class="speaker-info">
<h2>Jack Tuszynski</h2>
<div class="affiliation">University of Alberta, Edmonton, Canada</div>
<div class="presentation">Monday, October 12 &middot; <a href="../program_details.html#pl-1">PL-1: Quantum Biophotonics</a> &middot; <a href="../map.html#paradise-ballroom">Paradise Ballroom</a></div>
<div class="tags"><span class="tag tag-plenary">Plenary</span>
<a class="tag tag-workshop" href="../workshops.html#quantum-biology">Workshop: Quantum Biology and the Brain</a></div>
</div></div>
<div class="talk-title">An overview of the experimental tests of the Orch OR theory</div>
<div class="abstract-text"><p>The Orch OR theory suggests consciousness depends on quantum processes.</p><p>Second paragraph.</p></div>
<div class="about-heading">About the speaker</div>
<div class="abstract-text"><p>Professor of physics.</p></div>
</div></body></html>`;

test("parseDayName", () => {
  expect(parseDayName("Monday, October 12")).toBe("2026-10-12");
  expect(parseDayName("Sunday")).toBeNull();
});

test("parsePresentation handles plenary, concurrent (em dash) and posters", () => {
  expect(parsePresentation("Monday, October 12 · PL-1: Quantum Biophotonics · Paradise Ballroom")).toEqual({
    day: "2026-10-12", sessionCode: "PL-1", sessionName: "Quantum Biophotonics", room: "Paradise Ballroom",
  });
  expect(parsePresentation("Thursday, October 15 · THU-6 \u2014 Art, Myth, and Dream · Bay View Room")).toEqual({
    day: "2026-10-15", sessionCode: "THU-6", sessionName: "Art, Myth, and Dream", room: "Bay View Room",
  });
  expect(parsePresentation("Wednesday, October 14 · Poster Session 2 · Mission Bay Room")).toEqual({
    day: "2026-10-14", sessionCode: "PS-2", sessionName: "Poster Session 2", room: "Mission Bay Room",
  });
  expect(parsePresentation("")).toEqual({ day: null, sessionCode: null, sessionName: null, room: null });
});

test("parseAbstractPage extracts every field", () => {
  const r = parseAbstractPage("jack-tuszynski", PAGE);
  expect(r).toEqual({
    id: "jack-tuszynski",
    name: "Jack Tuszynski",
    affiliation: "University of Alberta, Edmonton, Canada",
    title: "An overview of the experimental tests of the Orch OR theory",
    abstract: "The Orch OR theory suggests consciousness depends on quantum processes. Second paragraph.",
    bio: "Professor of physics.",
    url: "https://tsc2026.org/abstracts_html/jack-tuszynski.html",
    day: "2026-10-12",
    sessionCode: "PL-1",
    sessionName: "Quantum Biophotonics",
    room: "Paradise Ballroom",
    types: ["Plenary", "Workshop"],
    workshops: ["quantum-biology"],
  });
});

test("parseAbstractPage throws when title or abstract is missing", () => {
  expect(() => parseAbstractPage("x", "<html><body></body></html>")).toThrow(/x/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pipeline/parse.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement pipeline/io.ts and pipeline/parse.ts**

`pipeline/io.ts`:
```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 1));
}
export function writeF32(path: string, data: Float32Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}
export function readF32(path: string): Float32Array {
  const b = readFileSync(path);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
```

`pipeline/parse.ts`:
```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/pipeline/parse.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Run on real data and sanity-check**

Run: `npm run parse`. Expected: `293 records`, and the "without session code" count is 0. If it's above 0, print those records' `presentation` text, extend `parsePresentation` with a new test case for that format, and re-run.

- [ ] **Step 6: Commit**

```bash
git add pipeline tests && git commit -m "feat(pipeline): parse abstract pages into records"
```

---

### Task 5: Schedule slots from listing pages

**Files:**
- Create: `pipeline/schedule.ts`
- Test: `tests/pipeline/schedule.test.ts`

**Interfaces:**
- Consumes: `Slot`, `SlotOption`, `RawRecord` (Task 2); `parseDayName` (Task 4); `readJson`, `writeJson` (Task 4).
- Produces: `parseClock(s: string, meridiem?: string): string`; `plenarySlots(html): Slot[]`; `concurrentSlots(html): Slot[]`; `posterSlots(html): Slot[]`; `workshopSlots(html): Slot[]`; `workshopAliases(html: string): Map<string, string>`; `attachDocs(slots: Slot[], recs: RawRecord[], workshopsHtml: string): Slot[]`; output `data/build/slots.json`.

Notes: Membership (`docIds`) always comes from the records' own `sessionCode` and `workshops`, never from the listing markup, because the listing pages use different containers. Plenary, Panel and Remote talks all share `PL-N` codes. A workshop with several parts is placed only in the slot of its first part (a documented v0 simplification).

- [ ] **Step 1: Write the failing test**

`tests/pipeline/schedule.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pipeline/schedule.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement pipeline/schedule.ts**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/pipeline/schedule.test.ts`. Expected: 6 passed.

- [ ] **Step 5: Run on real data**

Run: `npm run schedule`. Expected: about 4 concurrent slots (Mon to Thu), 2 poster slots, 14 or more plenary slots, and several workshop slots, with "unplaced records: 0". If records are unplaced, inspect their `sessionCode`. Plenary codes on program_details use `pl-N` ids, matched case-insensitively through `id.toUpperCase()`. Fix the parser with a new test case, then re-run.

- [ ] **Step 6: Commit**

```bash
git add pipeline tests data/build/slots.json && git commit -m "feat(pipeline): parse schedule into slots"
```

---

### Task 6: Lexical index, model registry and text embedding helpers

**Files:**
- Create: `core/lexical.ts`, `core/models.ts`, `core/embedtext.ts`, `pipeline/embedder.ts`
- Test: `tests/core/lexical.test.ts`, `tests/core/embedtext.test.ts`

**Interfaces:**
- Consumes: `l2normalize`, `meanVec` (Task 2).
- Produces:
  - `tokenize(text: string): string[]`, `stem(w: string): string`, `interface Bm25Index { N: number; avgdl: number; df: Record<string, number>; docs: { len: number; tf: Record<string, number> }[] }`, `buildBm25(texts: string[]): Bm25Index`, `bm25Scores(ix: Bm25Index, query: string, k1?: number, b?: number): Float64Array` (core/lexical.ts)
  - `interface ModelSpec { key: string; id: string; dim: number; pooling: "mean" | "cls"; queryPrefix: string }`, `MODELS: ModelSpec[]`, `modelByKey(key: string): ModelSpec` (core/models.ts)
  - `type EmbedFn = (texts: string[]) => Promise<Float32Array[]>`, `type Chunking = "truncate" | "chunk"`, `chunkWords(text: string, maxWords?: number, overlap?: number): string[]`, `embedDocText(embed: EmbedFn, text: string, chunking: Chunking): Promise<Float32Array>`, `embedQuery(embed: EmbedFn, text: string, spec: ModelSpec): Promise<Float32Array>` (core/embedtext.ts)
  - `nodeEmbedder(spec: ModelSpec): Promise<EmbedFn>` (pipeline/embedder.ts)

- [ ] **Step 1: Write the failing lexical test**

`tests/core/lexical.test.ts`:
```ts
import { expect, test } from "vitest";
import { bm25Scores, buildBm25, stem, tokenize } from "../../core/lexical";

test("stem", () => {
  expect(stem("microtubules")).toBe("microtubule");
  expect(stem("studies")).toBe("study");
  expect(stem("processing")).toBe("process");
  expect(stem("consciousness")).toBe("consciousness");
  expect(stem("iit")).toBe("iit");
});

test("tokenize lowercases, strips accents and stopwords", () => {
  expect(tokenize("The Microtubules and Anesthésia studies, IIT!")).toEqual(["microtubule", "anesthesia", "study", "iit"]);
});

test("BM25 ranks the doc containing a rare query term first", () => {
  const ix = buildBm25([
    "integrated information theory iit and phi",
    "global workspace theory of consciousness",
    "consciousness and the brain",
  ]);
  const s = bm25Scores(ix, "IIT");
  expect(s[0]).toBeGreaterThan(0);
  expect(s[1]).toBe(0);
  expect(s[2]).toBe(0);
});

test("BM25: rarer term outweighs common term", () => {
  const ix = buildBm25(["consciousness psilocybin", "consciousness brain", "consciousness mind"]);
  const s = bm25Scores(ix, "consciousness psilocybin");
  expect(s[0]).toBeGreaterThan(s[1]);
  expect(s[1]).toBeCloseTo(s[2]);
});

test("BM25 empty query gives zeros; index is JSON-serializable", () => {
  const ix = buildBm25(["a b c"]);
  expect(Array.from(bm25Scores(ix, ""))).toEqual([0]);
  const round = JSON.parse(JSON.stringify(ix));
  expect(Array.from(bm25Scores(round, "c"))).toEqual(Array.from(bm25Scores(ix, "c")));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/lexical.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/lexical.ts**

```ts
const STOP = new Set(("a an and are as at be been but by can do does for from has have how in into is it its " +
  "of on or our than that the their them then there these they this those to was we were what when where which " +
  "while who will with within without would you your not no nor also may might such via between both each more most " +
  "other some any all over under about after before during here".split(" ")));

export function stem(w: string): string {
  if (w.length <= 3) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length > 6) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 5) s = s.slice(0, -2);
  return s;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t)).map(stem);
}

export interface Bm25Index { N: number; avgdl: number; df: Record<string, number>; docs: { len: number; tf: Record<string, number> }[] }

export function buildBm25(texts: string[]): Bm25Index {
  const df: Record<string, number> = {};
  const docs = texts.map((t) => {
    const toks = tokenize(t);
    const tf: Record<string, number> = {};
    for (const k of toks) tf[k] = (tf[k] ?? 0) + 1;
    for (const k of Object.keys(tf)) df[k] = (df[k] ?? 0) + 1;
    return { len: toks.length, tf };
  });
  const avgdl = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { N: docs.length, avgdl, df, docs };
}

export function bm25Scores(ix: Bm25Index, query: string, k1 = 1.2, b = 0.75): Float64Array {
  const out = new Float64Array(ix.N);
  const terms = [...new Set(tokenize(query))];
  for (const t of terms) {
    const df = ix.df[t];
    if (!df) continue;
    const idf = Math.log(1 + (ix.N - df + 0.5) / (df + 0.5));
    ix.docs.forEach((d, i) => {
      const f = d.tf[t];
      if (!f) return;
      out[i] += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avgdl));
    });
  }
  return out;
}
```

Note: the expected `stem("processing")` is `"process"`. "processing" drops "ing" (length 10 > 6). The "s"-rule doesn't fire first because "processing" ends in "g".

- [ ] **Step 4: Run lexical tests**

Run: `npx vitest run tests/core/lexical.test.ts`. Expected: 5 passed.

- [ ] **Step 5: Write the failing embedtext test (covers Review Focus 2: long queries)**

`tests/core/embedtext.test.ts`:
```ts
import { expect, test, vi } from "vitest";
import { chunkWords, embedDocText, embedQuery, type EmbedFn } from "../../core/embedtext";
import { modelByKey } from "../../core/models";

const fake: EmbedFn = async (texts) => texts.map((t) => new Float32Array([t.split(" ").length, 1]));

test("chunkWords splits with overlap and keeps short text whole", () => {
  expect(chunkWords("a b c", 180, 30)).toEqual(["a b c"]);
  const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const chunks = chunkWords(words, 180, 30);
  expect(chunks).toHaveLength(3);
  expect(chunks[1].split(" ")[0]).toBe("w150");
  expect(chunks[2].split(" ").at(-1)).toBe("w399");
});

test("embedDocText truncate embeds once; chunk mean-pools and normalizes", async () => {
  const spy = vi.fn(fake);
  const long = Array.from({ length: 400 }, () => "x").join(" ");
  await embedDocText(spy, long, "truncate");
  expect(spy).toHaveBeenLastCalledWith([long]);
  const v = await embedDocText(spy, long, "chunk");
  expect(spy.mock.lastCall![0]).toHaveLength(3);
  expect(Math.hypot(...v)).toBeCloseTo(1);
});

test("embedQuery: short query gets the model prefix, long query is chunked whole", async () => {
  const spy = vi.fn(fake);
  const bge = modelByKey("bge-small");
  await embedQuery(spy, "microtubules", bge);
  expect(spy.mock.lastCall![0]).toEqual([bge.queryPrefix + "microtubules"]);
  const long = Array.from({ length: 1500 }, (_, i) => `w${i}`).join(" ");
  await embedQuery(spy, long, bge);
  const sent = spy.mock.lastCall![0];
  expect(sent.length).toBeGreaterThan(5);
  expect(sent.join(" ")).toContain("w1499");
  expect(sent[0].startsWith(bge.queryPrefix)).toBe(false);
});
```

- [ ] **Step 6: Implement core/models.ts and core/embedtext.ts**

`core/models.ts`:
```ts
export interface ModelSpec { key: string; id: string; dim: number; pooling: "mean" | "cls"; queryPrefix: string }

export const MODELS: ModelSpec[] = [
  { key: "minilm", id: "Xenova/all-MiniLM-L6-v2", dim: 384, pooling: "mean", queryPrefix: "" },
  { key: "bge-small", id: "Xenova/bge-small-en-v1.5", dim: 384, pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: " },
  { key: "gte-small", id: "Xenova/gte-small", dim: 384, pooling: "mean", queryPrefix: "" },
];

export function modelByKey(key: string): ModelSpec {
  const m = MODELS.find((x) => x.key === key);
  if (!m) throw new Error(`unknown model ${key}`);
  return m;
}
```

`core/embedtext.ts`:
```ts
import type { ModelSpec } from "./models";
import { l2normalize, meanVec } from "./vec";

export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;
export type Chunking = "truncate" | "chunk";

const SHORT_QUERY_WORDS = 60;
const CHUNK_WORDS = 180;
const OVERLAP = 30;

export function chunkWords(text: string, maxWords = CHUNK_WORDS, overlap = OVERLAP): string[] {
  const w = text.split(/\s+/).filter(Boolean);
  if (w.length <= maxWords) return [w.join(" ")];
  const out: string[] = [];
  for (let start = 0; start < w.length; start += maxWords - overlap) {
    out.push(w.slice(start, start + maxWords).join(" "));
    if (start + maxWords >= w.length) break;
  }
  return out;
}

async function pooled(embed: EmbedFn, chunks: string[]): Promise<Float32Array> {
  const vs = await embed(chunks);
  return l2normalize(vs.length === 1 ? vs[0] : meanVec(vs));
}

export async function embedDocText(embed: EmbedFn, text: string, chunking: Chunking): Promise<Float32Array> {
  return chunking === "truncate" ? l2normalize((await embed([text]))[0]) : pooled(embed, chunkWords(text));
}

export async function embedQuery(embed: EmbedFn, text: string, spec: ModelSpec): Promise<Float32Array> {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < SHORT_QUERY_WORDS) return l2normalize((await embed([spec.queryPrefix + text.trim()]))[0]);
  return pooled(embed, chunkWords(text));
}
```

- [ ] **Step 7: Implement pipeline/embedder.ts and run a real-model check**

`pipeline/embedder.ts`:
```ts
import { env, pipeline } from "@huggingface/transformers";
import type { EmbedFn } from "../core/embedtext";
import type { ModelSpec } from "../core/models";

env.cacheDir = ".hfcache";
const BATCH = 16;

export async function nodeEmbedder(spec: ModelSpec): Promise<EmbedFn> {
  const ex = await pipeline("feature-extraction", spec.id, { dtype: "q8" });
  return async (texts) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const t = await ex(texts.slice(i, i + BATCH), { pooling: spec.pooling, normalize: true });
      const [n, d] = t.dims as [number, number];
      const data = t.data as Float32Array;
      for (let j = 0; j < n; j++) out.push(data.slice(j * d, (j + 1) * d));
    }
    return out;
  };
}
```

Run: `npx tsx -e "import('./pipeline/embedder.ts').then(async m=>{const {MODELS}=await import('./core/models.ts');for(const s of MODELS){const e=await m.nodeEmbedder(s);const v=await e(['microtubules']);console.log(s.key,v[0].length)}})"`
Expected: `minilm 384`, `bge-small 384`, `gte-small 384`. If any model fails to download, remove it from `MODELS` and note that in the commit message.

- [ ] **Step 8: Run all tests, typecheck, commit**

Run: `npm test && npm run typecheck`. Expected: all pass.
```bash
git add core pipeline tests && git commit -m "feat(core): BM25 lexical index, model registry, chunked embedding"
```

---

### Task 7: Relevance scoring (dense, lexical, hybrid, RRF)

**Files:**
- Create: `core/retrieval.ts`
- Test: `tests/core/retrieval.test.ts`

**Interfaces:**
- Consumes: `Bm25Index`, `bm25Scores` (Task 6); `dot`, `row`, `zscore` (Task 2).
- Produces: `type RetrievalMode = "dense" | "lexical" | "hybrid" | "rrf"`; `interface RetrievalConfig { mode: RetrievalMode; alpha: number; rrfK: number }`; `interface Corpus { ids: string[]; dim: number; vectors: Float32Array; lex: Bm25Index }`; `denseScores(c: Corpus, q: Float32Array): Float64Array`; `rankOrder(scores: ArrayLike<number>): number[]`; `relevance(c: Corpus, qVec: Float32Array | null, qText: string, cfg: RetrievalConfig): { r: Float64Array; dense: Float64Array | null; lex: Float64Array }`.

- [ ] **Step 1: Write the failing test (covers Review Focus 1 and 4)**

`tests/core/retrieval.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildBm25 } from "../../core/lexical";
import { denseScores, rankOrder, relevance, type Corpus } from "../../core/retrieval";

const texts = ["integrated information theory iit phi", "global workspace broadcast", "microtubule quantum orch"];
// Dense vectors: doc 1 is closest to the query vector [0,1,0]; doc 0 is orthogonal.
const corpus: Corpus = {
  ids: ["a", "b", "c"], dim: 3,
  vectors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0.6, 0.8]),
  lex: buildBm25(texts),
};
const q = new Float32Array([0, 1, 0]);

test("denseScores and rankOrder", () => {
  const d = denseScores(corpus, q);
  expect(Array.from(d)).toEqual([0, 1, expect.closeTo(0.6)]);
  expect(rankOrder(d)).toEqual([1, 2, 0]);
});

test("rankOrder breaks ties by index", () => {
  expect(rankOrder([1, 1, 2])).toEqual([2, 0, 1]);
});

test("hybrid lets an exact acronym win when dense is flat (Review Focus 1)", () => {
  const flat = new Float32Array([0.707, 0.707, 0]); // a and b tie on dense, c is lower
  const { r } = relevance(corpus, flat, "IIT", { mode: "hybrid", alpha: 0.5, rrfK: 60 });
  expect(rankOrder(r)[0]).toBe(0);
});

test("dense mode follows dense", () => {
  const { r } = relevance(corpus, q, "IIT", { mode: "dense", alpha: 0.5, rrfK: 60 });
  expect(rankOrder(r)[0]).toBe(1);
});

test("rrf fuses ranks", () => {
  const { r } = relevance(corpus, q, "iit", { mode: "rrf", alpha: 0.5, rrfK: 60 });
  // doc0: dense rank 3, lex rank 1. doc1: dense rank 1, lex rank 2 (tie at 0, index order). Equal sums.
  expect(r[0]).toBeCloseTo(1 / 63 + 1 / 61);
  expect(r[1]).toBeCloseTo(1 / 61 + 1 / 62);
});

test("null query vector falls back to lexical in every mode (Review Focus 4)", () => {
  for (const mode of ["dense", "hybrid", "rrf", "lexical"] as const) {
    const out = relevance(corpus, null, "microtubule", { mode, alpha: 0.5, rrfK: 60 });
    expect(out.dense).toBeNull();
    expect(rankOrder(out.r)[0]).toBe(2);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/retrieval.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/retrieval.ts**

```ts
import { bm25Scores, type Bm25Index } from "./lexical";
import { dot, row, zscore } from "./vec";

export type RetrievalMode = "dense" | "lexical" | "hybrid" | "rrf";
export interface RetrievalConfig { mode: RetrievalMode; alpha: number; rrfK: number }
export interface Corpus { ids: string[]; dim: number; vectors: Float32Array; lex: Bm25Index }

export function denseScores(c: Corpus, q: Float32Array): Float64Array {
  const out = new Float64Array(c.ids.length);
  for (let i = 0; i < c.ids.length; i++) out[i] = dot(row(c.vectors, c.dim, i), q);
  return out;
}

export function rankOrder(scores: ArrayLike<number>): number[] {
  return Array.from({ length: scores.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
}

function rrf(lists: ArrayLike<number>[], k: number): Float64Array {
  const out = new Float64Array(lists[0].length);
  for (const l of lists) rankOrder(l).forEach((idx, rank) => { out[idx] += 1 / (k + rank + 1); });
  return out;
}

export function relevance(c: Corpus, qVec: Float32Array | null, qText: string, cfg: RetrievalConfig) {
  const lex = bm25Scores(c.lex, qText);
  if (!qVec) return { r: lex, dense: null, lex };
  const dense = denseScores(c, qVec);
  let r: Float64Array;
  switch (cfg.mode) {
    case "lexical": r = lex; break;
    case "dense": r = dense; break;
    case "rrf": r = rrf([dense, lex], cfg.rrfK); break;
    case "hybrid": {
      const zd = zscore(dense), zl = zscore(lex);
      r = new Float64Array(dense.length);
      for (let i = 0; i < r.length; i++) r[i] = cfg.alpha * zd[i] + (1 - cfg.alpha) * zl[i];
      break;
    }
  }
  return { r, dense, lex };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/core/retrieval.test.ts`. Expected: 6 passed. If the RRF test's expected values differ because lexical ties are ordered by index, recompute them by hand from `rankOrder` and fix the test, not the code.
```bash
git add core tests && git commit -m "feat(core): dense, lexical, hybrid and RRF relevance"
```

---

### Task 8: Stance model (ridge regression, CV, projection, distance)

**Files:**
- Create: `core/stance.ts`
- Test: `tests/core/stance.test.ts`

**Interfaces:**
- Consumes: `AXES`, `Axis`, `AxisScores` (Task 2); `mulberry32`, `shuffle` (Task 2); `dot` (Task 2).
- Produces: `spearman(a: number[], b: number[]): number`; `pearson(a: number[], b: number[]): number`; `choleskySolve(A: Float64Array, n: number, b: Float64Array): Float64Array`; `fitRidge(X: Float32Array[], y: number[], lambda: number): { w: Float64Array; b: number }`; `cvRidge(X: Float32Array[], y: number[], lambdas: number[], folds?: number, seed?: number): { lambda: number; spearman: number; r2: number }`; `interface AxisModel { axis: Axis; w: number[]; b: number; lambda: number; n: number; cvSpearman: number; cvR2: number; humanSpearman: number | null; auto: boolean }`; `CV_MIN = 0.5`; `HUMAN_MIN = 0.6`; `type Sliders = Partial<Record<Axis, number | null>>`; `projectStance(models: AxisModel[], q: Float32Array, sliders: Sliders): AxisScores`; `stanceDistance(u: AxisScores, d: AxisScores, eligible?: (a: Axis) => boolean): { s: number | null; shared: Axis[] }`.

- [ ] **Step 1: Write the failing test**

`tests/core/stance.test.ts`:
```ts
import { expect, test } from "vitest";
import { choleskySolve, cvRidge, fitRidge, pearson, projectStance, spearman, stanceDistance, type AxisModel } from "../../core/stance";
import { mulberry32 } from "../../core/random";

test("spearman handles ties and monotone transforms", () => {
  expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
  expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  expect(spearman([1, 1, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1);
  expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
});

test("choleskySolve solves a SPD system", () => {
  const A = new Float64Array([4, 2, 2, 3]);
  const x = choleskySolve(A, 2, new Float64Array([2, 1]));
  expect(x[0]).toBeCloseTo(0.5); expect(x[1]).toBeCloseTo(0);
});

function synth(n: number, d: number, seed: number) {
  const rnd = mulberry32(seed);
  const wTrue = Array.from({ length: d }, (_, i) => (i < 3 ? 1 : 0));
  const X = Array.from({ length: n }, () => new Float32Array(Array.from({ length: d }, () => rnd() - 0.5)));
  const y = X.map((x) => x.reduce((s, v, i) => s + v * wTrue[i], 0) * 4 + (rnd() - 0.5) * 0.1);
  return { X, y };
}

test("fitRidge recovers a linear signal", () => {
  const { X, y } = synth(200, 8, 3);
  const { w, b } = fitRidge(X, y, 0.01);
  expect(w[0]).toBeCloseTo(4, 0); expect(w[5]).toBeCloseTo(0, 0); expect(Math.abs(b)).toBeLessThan(0.2);
});

test("cvRidge reports high spearman on signal, near zero on noise", () => {
  const { X, y } = synth(200, 8, 4);
  expect(cvRidge(X, y, [0.01, 1, 10]).spearman).toBeGreaterThan(0.9);
  const rnd = mulberry32(9);
  const noise = y.map(() => rnd());
  expect(Math.abs(cvRidge(X, noise, [0.01, 1, 10]).spearman)).toBeLessThan(0.3);
});

const model = (axis: AxisModel["axis"], auto: boolean): AxisModel =>
  ({ axis, w: [1, 0], b: 0, lambda: 1, n: 50, cvSpearman: 0.8, cvR2: 0.5, humanSpearman: 0.7, auto });

test("projectStance: auto axes project and clamp, sliders override, non-auto axes need a slider", () => {
  const models = [model("ontology", true), model("mechanism", false), model("evidence", true), model("scope", true)];
  const u = projectStance(models, new Float32Array([5, 0]), { evidence: -1, scope: null });
  expect(u).toEqual({ ontology: 2, mechanism: null, evidence: -1, scope: null });
  expect(projectStance(models, new Float32Array([5, 0]), { mechanism: 1 }).mechanism).toBe(1);
});

test("stanceDistance uses only shared non-null axes", () => {
  const u = { ontology: 2, mechanism: null, evidence: 0, scope: -2 };
  const d = { ontology: -2, mechanism: 1, evidence: null, scope: -2 };
  const { s, shared } = stanceDistance(u, d);
  expect(shared).toEqual(["ontology", "scope"]);
  expect(s).toBeCloseTo(Math.sqrt((16 + 0) / 2) / 4);
  expect(stanceDistance(u, { ontology: null, mechanism: null, evidence: null, scope: null }).s).toBeNull();
});

test("stanceDistance respects the eligible filter", () => {
  const u = { ontology: 2, mechanism: 2, evidence: null, scope: null };
  const d = { ontology: -2, mechanism: 2, evidence: null, scope: null };
  const r = stanceDistance(u, d, (a) => a !== "ontology");
  expect(r.shared).toEqual(["mechanism"]);
  expect(r.s).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/stance.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/stance.ts**

```ts
import { AXES, type Axis, type AxisScores } from "./types";
import { mulberry32, shuffle } from "./random";
import { dot } from "./vec";

export const CV_MIN = 0.5;
export const HUMAN_MIN = 0.6;

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number { return pearson(ranks(a), ranks(b)); }

export function choleskySolve(A: Float64Array, n: number, b: Float64Array): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (s <= 0) throw new Error("matrix not positive definite"); L[i * n + i] = Math.sqrt(s); }
      else L[i * n + j] = s / L[j * n + j];
    }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

export function fitRidge(X: Float32Array[], y: number[], lambda: number): { w: Float64Array; b: number } {
  const n = X.length, d = X[0].length;
  const mx = new Float64Array(d);
  for (const x of X) for (let j = 0; j < d; j++) mx[j] += x[j] / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  const A = new Float64Array(d * d), rhs = new Float64Array(d), xc = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) xc[j] = X[i][j] - mx[j];
    const yc = y[i] - my;
    for (let j = 0; j < d; j++) {
      rhs[j] += xc[j] * yc;
      for (let k = 0; k <= j; k++) A[j * d + k] += xc[j] * xc[k];
    }
  }
  for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[k * d + j] = A[j * d + k]; A[j * d + j] += lambda; }
  const w = choleskySolve(A, d, rhs);
  return { w, b: my - dot(mx, w) };
}

export function cvRidge(X: Float32Array[], y: number[], lambdas: number[], folds = 5, seed = 7) {
  const order = shuffle(X.map((_, i) => i), mulberry32(seed));
  const fold = new Array<number>(X.length);
  order.forEach((idx, k) => { fold[idx] = k % folds; });
  let best = { lambda: lambdas[0], spearman: -Infinity, r2: -Infinity };
  for (const lambda of lambdas) {
    const pred = new Array<number>(X.length);
    for (let f = 0; f < folds; f++) {
      const tr = X.map((_, i) => i).filter((i) => fold[i] !== f);
      const m = fitRidge(tr.map((i) => X[i]), tr.map((i) => y[i]), lambda);
      X.forEach((x, i) => { if (fold[i] === f) pred[i] = dot(x, m.w) + m.b; });
    }
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const ssRes = y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0);
    const res = { lambda, spearman: spearman(y, pred), r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
    if (res.spearman > best.spearman) best = res;
  }
  return best;
}

export interface AxisModel {
  axis: Axis; w: number[]; b: number; lambda: number; n: number;
  cvSpearman: number; cvR2: number; humanSpearman: number | null; auto: boolean;
}
export type Sliders = Partial<Record<Axis, number | null>>;

const clamp = (v: number) => Math.max(-2, Math.min(2, v));

export function projectStance(models: AxisModel[], q: Float32Array, sliders: Sliders): AxisScores {
  const out = {} as AxisScores;
  for (const a of AXES) {
    if (a in sliders) { out[a] = sliders[a] ?? null; continue; }
    const m = models.find((x) => x.axis === a);
    out[a] = m && m.auto ? clamp(dot(q, m.w) + m.b) : null;
  }
  return out;
}

export function stanceDistance(u: AxisScores, d: AxisScores, eligible: (a: Axis) => boolean = () => true) {
  const shared = AXES.filter((a) => eligible(a) && u[a] !== null && d[a] !== null);
  if (shared.length === 0) return { s: null as number | null, shared };
  const sq = shared.reduce((s, a) => s + ((u[a] as number) - (d[a] as number)) ** 2, 0);
  return { s: Math.sqrt(sq / shared.length) / 4, shared };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/core/stance.test.ts`. Expected: 7 passed.
```bash
git add core tests && git commit -m "feat(core): ridge stance model with CV, projection and distance"
```

---

### Task 9: Ranking (kindred with MMR, opponents, serendipity, weak flag)

**Files:**
- Create: `core/rank.ts`
- Test: `tests/core/rank.test.ts`

**Interfaces:**
- Consumes: `Doc`, `Axis`, `AxisScores` (Task 2); `stanceDistance` (Task 8); `dot`, `row`, `quantile` (Task 2); `rankOrder` (Task 7).
- Produces: `interface RankConfig { candidates: number; tauRank: number; beta: number; mmrLambda: number; nKindred: number; nOpponents: number; oppFloor: number; serendipityQuantile: number; weakDense: number }`; `DEFAULT_RANK: RankConfig`; `interface Match { idx: number; id: string; r: number; rNorm: number; s: number | null; shared: Axis[]; score: number }`; `interface Results { kindred: Match[]; opponents: Match[]; serendipity: Match | null; weak: boolean; docScores: Float64Array }`; `interface RankInput { docs: Doc[]; vectors: Float32Array; dim: number; r: Float64Array; dense: Float64Array | null; u: AxisScores; oppAxes: (a: Axis) => boolean; allow?: (d: Doc) => boolean }`; `rankAll(inp: RankInput, cfg?: RankConfig): Results`.

`docScores[i]` is the kindred-adjusted score of every document (`-Infinity` for filtered ones). The itinerary uses it.

- [ ] **Step 1: Write the failing test (covers Review Focus 3)**

`tests/core/rank.test.ts`:
```ts
import { expect, test } from "vitest";
import { DEFAULT_RANK, rankAll, type RankInput } from "../../core/rank";
import type { AxisScores, Doc } from "../../core/types";

const ax = (o: number | null): AxisScores => ({ ontology: o, mechanism: null, evidence: null, scope: null });
const doc = (id: string, discipline: Doc["discipline"], o: number | null): Doc => ({
  id, name: id, affiliation: "", title: id, url: "", day: null, sessionCode: null, sessionName: null, room: null,
  types: ["Concurrent"], workshops: [], coreClaim: "", discipline, methods: [], axes: ax(o), concepts: [],
  askQuestion: "", challengeQuestion: "", xy: [0, 0],
});

function input(over: Partial<RankInput> = {}): RankInput {
  // 6 docs; 0,1 are near-duplicates (same vector). 2 has the opposite stance. 5 is another discipline.
  const docs = [doc("a", "philosophy", 2), doc("b", "philosophy", 2), doc("c", "philosophy", -2),
    doc("d", "philosophy", 1), doc("e", "philosophy", null), doc("f", "biology", null)];
  const vectors = new Float32Array([1, 0, 1, 0, 0.9, 0.1, 0, 1, 0.5, 0.5, 0.6, 0.4]); // d is orthogonal to a
  return {
    docs, vectors, dim: 2,
    r: new Float64Array([0.9, 0.89, 0.85, 0.8, 0.5, 0.6]),
    dense: new Float64Array([0.9, 0.89, 0.85, 0.8, 0.5, 0.6]),
    u: ax(2), oppAxes: () => true, ...over,
  };
}
const cfg = { ...DEFAULT_RANK, nKindred: 3, nOpponents: 2, tauRank: 4, serendipityQuantile: 0.1 };

test("kindred favours same stance and MMR avoids the duplicate", () => {
  const r = rankAll(input(), cfg);
  const ids = r.kindred.map((m) => m.id);
  expect(ids[0]).toBe("a");
  expect(ids).not.toContain("c");
  expect(ids.indexOf("b") === -1 || ids.indexOf("b") > 1).toBe(true);
});

test("opponents are on-topic, disagree beyond the floor, and exclude kindred", () => {
  const r = rankAll(input(), cfg);
  expect(r.opponents.map((m) => m.id)).toEqual(["c"]);
  expect(r.opponents[0].s).toBeCloseTo(1);
});

test("no opponents when the user has no stance", () => {
  expect(rankAll(input({ u: ax(null) }), cfg).opponents).toEqual([]);
});

test("opponents ignore axes that are not eligible", () => {
  expect(rankAll(input({ oppAxes: () => false }), cfg).opponents).toEqual([]);
});

test("serendipity comes from another discipline", () => {
  expect(rankAll(input(), cfg).serendipity?.id).toBe("f");
});

test("weak flag when dense similarity is low everywhere (Review Focus 3)", () => {
  const low = new Float64Array([0.1, 0.1, 0.05, 0.02, 0.01, 0.0]);
  expect(rankAll(input({ dense: low, r: low }), cfg).weak).toBe(true);
  expect(rankAll(input(), cfg).weak).toBe(false);
});

test("weak flag in lexical-only mode when nothing matched", () => {
  const zero = new Float64Array(6);
  expect(rankAll(input({ dense: null, r: zero }), cfg).weak).toBe(true);
});

test("allow filter removes docs everywhere and docScores is -Infinity for them", () => {
  const r = rankAll(input({ allow: (d) => d.id !== "a" }), cfg);
  expect(r.kindred.map((m) => m.id)).not.toContain("a");
  expect(r.docScores[0]).toBe(-Infinity);
  expect(Number.isFinite(r.docScores[1])).toBe(true);
});

test("everything filtered out gives empty weak results", () => {
  const r = rankAll(input({ allow: () => false }), cfg);
  expect(r).toMatchObject({ kindred: [], opponents: [], serendipity: null, weak: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/rank.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/rank.ts**

```ts
import type { Axis, AxisScores, Doc } from "./types";
import { stanceDistance } from "./stance";
import { rankOrder } from "./retrieval";
import { dot, quantile, row } from "./vec";

export interface RankConfig {
  candidates: number; tauRank: number; beta: number; mmrLambda: number; nKindred: number;
  nOpponents: number; oppFloor: number; serendipityQuantile: number; weakDense: number;
}
export const DEFAULT_RANK: RankConfig = {
  candidates: 40, tauRank: 15, beta: 0.5, mmrLambda: 0.7, nKindred: 8,
  nOpponents: 4, oppFloor: 0.35, serendipityQuantile: 0.7, weakDense: 0.35,
};

export interface Match { idx: number; id: string; r: number; rNorm: number; s: number | null; shared: Axis[]; score: number }
export interface Results { kindred: Match[]; opponents: Match[]; serendipity: Match | null; weak: boolean; docScores: Float64Array }
export interface RankInput {
  docs: Doc[]; vectors: Float32Array; dim: number; r: Float64Array; dense: Float64Array | null;
  u: AxisScores; oppAxes: (a: Axis) => boolean; allow?: (d: Doc) => boolean;
}

export function rankAll(inp: RankInput, cfg: RankConfig = DEFAULT_RANK): Results {
  const { docs, vectors, dim, r, dense, u } = inp;
  const allowed = docs.map((d, i) => (!inp.allow || inp.allow(d) ? i : -1)).filter((i) => i >= 0);
  const docScores = new Float64Array(docs.length).fill(-Infinity);
  if (allowed.length === 0) return { kindred: [], opponents: [], serendipity: null, weak: true, docScores };

  const allowedSet = new Set(allowed);
  const order = rankOrder(r).filter((i) => allowedSet.has(i));
  const R = order.slice(0, cfg.candidates);
  const rmax = r[R[0]], rmin = r[R[R.length - 1]];
  const norm = (i: number) => (rmax === rmin ? 1 : Math.max(0, Math.min(1, (r[i] - rmin) / (rmax - rmin))));
  const tau = r[R[Math.min(cfg.tauRank, R.length) - 1]];

  const match = (i: number, score: number, eligible?: (a: Axis) => boolean): Match => {
    const { s, shared } = stanceDistance(u, docs[i].axes, eligible);
    return { idx: i, id: docs[i].id, r: r[i], rNorm: norm(i), s, shared, score };
  };
  const kScore = (i: number) => norm(i) - cfg.beta * (stanceDistance(u, docs[i].axes).s ?? 0.5);
  for (const i of allowed) docScores[i] = kScore(i);

  // Kindred: MMR over R.
  const kindred: Match[] = [];
  const pool = new Set(R);
  while (kindred.length < cfg.nKindred && pool.size) {
    let best = -1, bestVal = -Infinity;
    for (const i of pool) {
      const maxSim = kindred.reduce((m, k) => Math.max(m, dot(row(vectors, dim, i), row(vectors, dim, k.idx))), 0);
      const val = cfg.mmrLambda * docScores[i] - (1 - cfg.mmrLambda) * maxSim;
      if (val > bestVal) { bestVal = val; best = i; }
    }
    pool.delete(best);
    kindred.push(match(best, docScores[best]));
  }
  const taken = new Set(kindred.map((m) => m.idx));

  // Opponents: on topic, real disagreement on eligible axes.
  const opponents = R.filter((i) => !taken.has(i) && r[i] >= tau)
    .map((i) => match(i, 0, inp.oppAxes))
    .filter((m) => m.s !== null && m.shared.length > 0 && m.s >= cfg.oppFloor)
    .map((m) => ({ ...m, score: (m.s as number) * m.rNorm }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.nOpponents);
  for (const m of opponents) taken.add(m.idx);

  // Serendipity: best relevant doc from a different discipline than the kindred majority.
  const counts = new Map<string, number>();
  for (const m of kindred) counts.set(docs[m.idx].discipline, (counts.get(docs[m.idx].discipline) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const floor = quantile(allowed.map((i) => r[i]), cfg.serendipityQuantile);
  const sIdx = order.find((i) => !taken.has(i) && docs[i].discipline !== dominant && r[i] >= floor);
  const serendipity = sIdx === undefined ? null : match(sIdx, r[sIdx]);

  const weak = dense
    ? Math.max(...allowed.map((i) => dense[i])) < cfg.weakDense
    : Math.max(...allowed.map((i) => r[i])) <= 0;

  return { kindred, opponents, serendipity, weak, docScores };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/core/rank.test.ts`. Expected: 9 passed.
```bash
git add core tests && git commit -m "feat(core): kindred, opponent and serendipity ranking"
```

---

### Task 10: Explanations

**Files:**
- Create: `core/explain.ts`
- Test: `tests/core/explain.test.ts`

**Interfaces:**
- Consumes: `Doc`, `Axis`, `AxisScores`, `AXES` (Task 2); `tokenize` (Task 6); `dot` (Task 2).
- Produces: `AXIS_POLES: Record<Axis, [string, string]>`; `poleLabel(axis: Axis, v: number): string`; `interface ExplainInput { doc: Doc; u: AxisScores; shared: Axis[]; qText: string; qVec: Float32Array | null; conceptVec: (docId: string, concept: string) => Float32Array | undefined; theta: number; methods?: string[] }`; `explain(inp: ExplainInput): string[]`.

- [ ] **Step 1: Write the failing test**

`tests/core/explain.test.ts`:
```ts
import { expect, test } from "vitest";
import { explain, poleLabel } from "../../core/explain";
import type { Doc } from "../../core/types";

const doc = { id: "x", concepts: ["microtubules", "anesthesia", "Orch OR"], methods: ["anesthesia"],
  axes: { ontology: 2, mechanism: 2, evidence: null, scope: null } } as unknown as Doc;
const base = { doc, qVec: null, conceptVec: () => undefined, theta: 0.6 };

test("poleLabel", () => {
  expect(poleLabel("mechanism", 2)).toBe("quantum or field accounts");
  expect(poleLabel("mechanism", -1)).toBe("classical neural accounts");
});

test("literal concept overlap, agreement, method overlap; max 3 reasons", () => {
  const out = explain({ ...base, qText: "anesthesia and microtubules", shared: ["ontology", "mechanism"],
    u: { ontology: 2, mechanism: 1, evidence: null, scope: null }, methods: ["anesthesia"] });
  expect(out).toEqual([
    "Shared interest: microtubules, anesthesia",
    "You both lean toward consciousness as fundamental",
    "Same method: anesthesia",
  ]);
});

test("disagreement reason names both sides", () => {
  const out = explain({ ...base, qText: "global workspace", shared: ["mechanism"],
    u: { ontology: null, mechanism: -2, evidence: null, scope: null } });
  expect(out).toEqual(["They lean toward quantum or field accounts; you lean toward classical neural accounts"]);
});

test("semantic concept match via concept vectors", () => {
  const out = explain({ ...base, qText: "tubulin", shared: [], u: { ontology: null, mechanism: null, evidence: null, scope: null },
    qVec: new Float32Array([1, 0]),
    conceptVec: (_id, c) => (c === "microtubules" ? new Float32Array([0.9, 0.1]) : new Float32Array([0, 1])) });
  expect(out).toEqual(["Shared interest: microtubules"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/explain.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/explain.ts**

```ts
import type { Axis, AxisScores, Doc } from "./types";
import { tokenize } from "./lexical";
import { dot } from "./vec";

export const AXIS_POLES: Record<Axis, [string, string]> = {
  ontology: ["consciousness from physical processes", "consciousness as fundamental"],
  mechanism: ["classical neural accounts", "quantum or field accounts"],
  evidence: ["empirical work", "theoretical work"],
  scope: ["brain-bound mind", "extended or nonlocal mind"],
};

export function poleLabel(axis: Axis, v: number): string { return AXIS_POLES[axis][v < 0 ? 0 : 1]; }

export interface ExplainInput {
  doc: Doc; u: AxisScores; shared: Axis[]; qText: string; qVec: Float32Array | null;
  conceptVec: (docId: string, concept: string) => Float32Array | undefined; theta: number; methods?: string[];
}

export function explain(inp: ExplainInput): string[] {
  const { doc, u } = inp;
  const out: string[] = [];
  const qTok = new Set(tokenize(inp.qText));
  const concepts = doc.concepts.filter((c) => {
    const t = tokenize(c);
    if (t.length && t.every((x) => qTok.has(x))) return true;
    const v = inp.qVec && inp.conceptVec(doc.id, c);
    return !!v && dot(v, inp.qVec!) >= inp.theta;
  }).slice(0, 2);
  if (concepts.length) out.push(`Shared interest: ${concepts.join(", ")}`);

  const diffs = inp.shared.map((a) => ({ a, du: u[a] as number, dd: doc.axes[a] as number }))
    .map((x) => ({ ...x, gap: Math.abs(x.du - x.dd) }));
  const agree = diffs.find((x) => x.gap <= 1 && x.du !== 0 && Math.sign(x.du) === Math.sign(x.dd));
  const clash = diffs.filter((x) => x.gap >= 2).sort((p, q) => q.gap - p.gap)[0];
  if (clash) {
    const yours = clash.du === 0 ? "you're in the middle" : `you lean toward ${poleLabel(clash.a, clash.du)}`;
    out.push(`They lean toward ${poleLabel(clash.a, clash.dd)}; ${yours}`);
  } else if (agree) out.push(`You both lean toward ${poleLabel(agree.a, agree.dd)}`);

  const m = (inp.methods ?? []).filter((x) => (doc.methods as string[]).includes(x));
  if (m.length) out.push(`Same method: ${m.join(", ")}`);
  return out.slice(0, 3);
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/core/explain.test.ts`. Expected: 4 passed.
```bash
git add core tests && git commit -m "feat(core): match explanations"
```

---

### Task 11: Itinerary and ICS export

**Files:**
- Create: `core/itinerary.ts`
- Test: `tests/core/itinerary.test.ts`

**Interfaces:**
- Consumes: `Slot`, `SlotOption`, `Doc` (Task 2).
- Produces: `sessionScore(talkScores: number[]): number`; `interface PlanItem { slot: Slot; chosen: SlotOption; score: number; pinned: boolean; posters: string[] }`; `buildItinerary(slots: Slot[], scoreOf: (docId: string) => number, opts: { days: Set<string> | null; pins: Record<string, string>; posterN: number }): PlanItem[]`; `toIcs(plan: PlanItem[], docsById: Map<string, Doc>): string`.

- [ ] **Step 1: Write the failing test (covers Review Focus 5: stale pins)**

`tests/core/itinerary.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildItinerary, sessionScore, toIcs } from "../../core/itinerary";
import type { Doc, Slot } from "../../core/types";

const slots: Slot[] = [
  { id: "conc-2026-10-12", day: "2026-10-12", start: "17:00", end: "19:05", kind: "concurrent", options: [
    { id: "MON-1", label: "Quantum, Theories; etc", room: "Ballroom", docIds: ["a", "b"] },
    { id: "MON-2", label: "Neuro", room: "Garden", docIds: ["c"] },
    { id: "MON-3", label: "Empty", room: null, docIds: [] } ] },
  { id: "poster-PS-1", day: "2026-10-13", start: "19:30", end: null, kind: "poster",
    options: [{ id: "PS-1", label: "Poster Session 1", room: "Mission Bay", docIds: ["p1", "p2", "p3"] }] },
];
const scores: Record<string, number> = { a: 0.2, b: 0.1, c: 0.9, p1: 0.1, p2: 0.8, p3: 0.5 };
const scoreOf = (id: string) => scores[id] ?? -Infinity;

test("sessionScore = max + 0.5 * mean(top 3); empty is -Infinity", () => {
  expect(sessionScore([0.2, 0.1])).toBeCloseTo(0.2 + 0.5 * 0.15);
  expect(sessionScore([])).toBe(-Infinity);
  expect(sessionScore([-Infinity, 0.5])).toBeCloseTo(0.5 + 0.5 * 0.5);
});

test("picks the best option per slot and ranks posters", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: {}, posterN: 2 });
  expect(plan.map((p) => p.chosen.id)).toEqual(["MON-2", "PS-1"]);
  expect(plan[1].posters).toEqual(["p2", "p3"]);
});

test("pins override; stale pins are ignored (Review Focus 5)", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: { "conc-2026-10-12": "MON-1", "gone-slot": "X", "poster-PS-1": "NOPE" }, posterN: 2 });
  expect(plan[0]).toMatchObject({ pinned: true });
  expect(plan[0].chosen.id).toBe("MON-1");
  expect(plan[1].pinned).toBe(false);
});

test("day filter", () => {
  expect(buildItinerary(slots, scoreOf, { days: new Set(["2026-10-13"]), pins: {}, posterN: 1 }).map((p) => p.slot.id)).toEqual(["poster-PS-1"]);
});

test("toIcs emits escaped events in Pacific time with CRLF", () => {
  const plan = buildItinerary(slots, scoreOf, { days: null, pins: { "conc-2026-10-12": "MON-1" }, posterN: 1 });
  const ics = toIcs(plan, new Map([["p2", { title: "Poster Two" } as Doc]]));
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20261012T170000");
  expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20261012T190500");
  expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20261013T203000");
  expect(ics).toContain("SUMMARY:MON-1: Quantum\\, Theories\\; etc");
  expect(ics).toContain("Poster Two");
  expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/itinerary.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement core/itinerary.ts**

```ts
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
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/core/itinerary.test.ts`. Expected: 5 passed.
```bash
git add core tests && git commit -m "feat(core): itinerary selection, pins and ICS export"
```

---

### Task 12: Claude enrichment with cache and validation

**Files:**
- Create: `pipeline/enrich.ts`
- Test: `tests/pipeline/enrich.test.ts`

**Interfaces:**
- Consumes: `RawRecord`, `Enrichment`, `AXES`, `DISCIPLINES`, `METHODS` (Task 2); `readJson`, `writeJson` (Task 4).
- Produces: `PROMPT_VERSION: string`; `EnrichmentSchema` (zod); `contentHash(r: RawRecord): string`; `buildPrompt(r: RawRecord): string`; `validateEnrichment(e: Enrichment): string[]` (list of problems); `type CallModel = (prompt: string) => Promise<{ ok: true; value: Enrichment } | { ok: false; reason: string }>`; `enrichAll(recs: RawRecord[], cacheDir: string, call: CallModel, concurrency?: number): Promise<{ done: number; cached: number; failed: { id: string; reason: string }[] }>`; `loadEnrichments(recs: RawRecord[], cacheDir: string): Map<string, Enrichment>` (throws listing missing ids); cache files `data/build/enrichment/<id>.json` = `{ hash, model, promptVersion, enrichment }`.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/enrich.test.ts`:
```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { Enrichment, RawRecord } from "../../core/types";
import { buildPrompt, contentHash, enrichAll, loadEnrichments, validateEnrichment, type CallModel } from "../../pipeline/enrich";

const rec = (id: string, abstract = "Quantum processes in microtubules.") =>
  ({ id, title: `T ${id}`, abstract, name: "N", affiliation: "A" } as RawRecord);
const good: Enrichment = {
  core_claim: "Microtubules host quantum processes that anesthetics disrupt.",
  discipline: "biology", methods: ["anesthesia"], concepts: ["microtubules", "anesthesia", "quantum biology"],
  axes: { ontology: null, mechanism: 2, evidence: -1, scope: null },
  ask_question: "What result would surprise you most?", challenge_question: "How do you rule out classical explanations?",
};

test("buildPrompt includes title and abstract but not the bio", () => {
  const p = buildPrompt({ ...rec("a"), bio: "SECRET BIO" });
  expect(p).toContain("T a"); expect(p).toContain("microtubules"); expect(p).not.toContain("SECRET BIO");
});

test("validateEnrichment catches out-of-range axes and overlong claims", () => {
  expect(validateEnrichment(good)).toEqual([]);
  const bad = { ...good, core_claim: Array(30).fill("word").join(" "), axes: { ...good.axes, ontology: 3 } };
  expect(validateEnrichment(bad)).toEqual(["core_claim has 30 words (max 25)", "axis ontology=3 out of range"]);
});

test("enrichAll caches by content hash and re-runs when the abstract changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  const call: CallModel = vi.fn(async () => ({ ok: true as const, value: good }));
  expect(await enrichAll([rec("a"), rec("b")], dir, call, 2)).toMatchObject({ done: 2, cached: 0, failed: [] });
  expect(await enrichAll([rec("a"), rec("b")], dir, call, 2)).toMatchObject({ done: 0, cached: 2 });
  expect(await enrichAll([rec("a", "Changed abstract."), rec("b")], dir, call, 2)).toMatchObject({ done: 1, cached: 1 });
  expect(call).toHaveBeenCalledTimes(3);
  const saved = JSON.parse(readFileSync(join(dir, "a.json"), "utf8"));
  expect(saved.hash).toBe(contentHash(rec("a", "Changed abstract.")));
});

test("refusals and invalid output are reported, not cached", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  const call: CallModel = async (p) => (p.includes("Title: T a\n") ? { ok: false, reason: "refusal" } : { ok: true, value: { ...good, axes: { ...good.axes, scope: 9 } } });
  const res = await enrichAll([rec("a"), rec("b")], dir, call, 1);
  expect(res.failed).toEqual([{ id: "a", reason: "refusal" }, { id: "b", reason: "axis scope=9 out of range" }]);
});

test("loadEnrichments throws listing records with missing or stale cache (Review Focus 5)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "enr-"));
  await enrichAll([rec("a")], dir, async () => ({ ok: true, value: good }), 1);
  writeFileSync(join(dir, "b.json"), JSON.stringify({ hash: "stale", enrichment: good }));
  expect(() => loadEnrichments([rec("a"), rec("b"), rec("c")], dir)).toThrow(/b, c/);
  expect(loadEnrichments([rec("a")], dir).get("a")).toEqual(good);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pipeline/enrich.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement pipeline/enrich.ts**

```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/enrich.test.ts && npm run typecheck`. Expected: 5 passed, no type errors. If the `beta.messages.parse` parameter types reject `fallbacks` or `betas`, read the compiler error and fix the call to match `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`. Don't drop the fallback without telling Tim.

- [ ] **Step 5: Pilot on 5 records, then review by hand**

Run: `ant auth status`. Expected: an active credential source. If there isn't one, ask Tim to run `! ant auth login`.
Run: `LIMIT=5 npm run enrich`. Expected: `done: 5, failed: []`.
Read the 5 JSON files in `data/build/enrichment/` with Tim. Check that the axes and core claims are sensible and neutrally worded. If they aren't, adjust `buildPrompt`, bump `PROMPT_VERSION` to `v2`, and re-run the pilot.

- [ ] **Step 6: Full run and commit**

Run: `npm run enrich`. Expected: `failed: []`. Retry any failures with a second `npm run enrich`; only uncached ones are called. If refusals persist, report the ids to Tim.
```bash
git add pipeline tests data/build/enrichment && git commit -m "feat(pipeline): Claude enrichment with content-hash cache"
```

---

### Task 13: Embeddings, axis models and 2D layout

**Files:**
- Create: `pipeline/embed.ts`, `pipeline/axes.ts`, `pipeline/layout.ts`
- Test: `tests/pipeline/axes.test.ts`

**Interfaces:**
- Consumes: `nodeEmbedder` (Task 6), `embedDocText`, `MODELS` (Task 6), `cvRidge`, `fitRidge`, `spearman`, `CV_MIN`, `HUMAN_MIN`, `AxisModel` (Task 8), `loadEnrichments` (Task 12), `readF32`, `writeF32`, `readJson`, `writeJson` (Task 4), `mulberry32` (Task 2).
- Produces:
  - `docText(r: RawRecord): string` (title + ". " + abstract), and embedding files `data/build/emb/<modelKey>__<chunking>.f32` (N x dim, rows in `records.json` order) (pipeline/embed.ts)
  - `fitAxisModels(vecs: Float32Array[], labels: (number | null)[][], human: Record<Axis, number | null>): AxisModel[]`, where `labels[i][k]` is record i's score on `AXES[k]` and `human[a]` is the human agreement Spearman; writes `data/build/axes.<modelKey>__<chunking>.json` (pipeline/axes.ts)
  - `computeLayout(vecs: Float32Array[], seed?: number): [number, number][]` (normalized to [0, 1]); writes `data/build/layout.<modelKey>__<chunking>.json` (pipeline/layout.ts)

- [ ] **Step 1: Implement pipeline/embed.ts and run it**

```ts
import { embedDocText, type Chunking } from "../core/embedtext";
import { MODELS } from "../core/models";
import type { RawRecord } from "../core/types";
import { nodeEmbedder } from "./embedder";
import { readJson, writeF32 } from "./io";

export const CHUNKINGS: Chunking[] = ["truncate", "chunk"];
export const docText = (r: RawRecord) => `${r.title}. ${r.abstract}`;

async function main() {
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const only = process.env.MODEL;
  for (const spec of MODELS.filter((m) => !only || m.key === only)) {
    const embed = await nodeEmbedder(spec);
    for (const ch of CHUNKINGS) {
      const out = new Float32Array(recs.length * spec.dim);
      for (let i = 0; i < recs.length; i++) out.set(await embedDocText(embed, docText(recs[i]), ch), i * spec.dim);
      writeF32(`data/build/emb/${spec.key}__${ch}.f32`, out);
      console.log(`${spec.key}__${ch}: ${recs.length} x ${spec.dim}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
```

Run: `npm run embed`. Expected: six lines, e.g. `minilm__truncate: 293 x 384`. The run takes several minutes on CPU.

- [ ] **Step 2: Write the failing axes test**

`tests/pipeline/axes.test.ts`:
```ts
import { expect, test } from "vitest";
import { mulberry32 } from "../../core/random";
import { fitAxisModels } from "../../pipeline/axes";
import { computeLayout } from "../../pipeline/layout";

function data(n: number) {
  const rnd = mulberry32(5);
  const vecs = Array.from({ length: n }, () => new Float32Array([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
  const labels = vecs.map((v) => [Math.round(v[0] * 4), Math.round((rnd() - 0.5) * 4), null, Math.round(v[2] * 4)]);
  return { vecs, labels };
}

test("fitAxisModels applies CV and human gates", () => {
  const { vecs, labels } = data(120);
  const models = fitAxisModels(vecs, labels, { ontology: 0.8, mechanism: 0.9, evidence: 0.9, scope: 0.4 });
  const by = Object.fromEntries(models.map((m) => [m.axis, m]));
  expect(by.ontology.auto).toBe(true);           // signal + human ok
  expect(by.mechanism.auto).toBe(false);         // noise fails CV
  expect(by.evidence.auto).toBe(false);          // no labels at all
  expect(by.evidence.n).toBe(0);
  expect(by.scope.auto).toBe(false);             // signal but human agreement 0.4 < 0.6
  expect(by.scope.cvSpearman).toBeGreaterThan(0.5);
});

test("computeLayout is deterministic and normalized", () => {
  const { vecs } = data(40);
  const a = computeLayout(vecs, 1), b = computeLayout(vecs, 1);
  expect(a).toEqual(b);
  for (const [x, y] of a) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1); }
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/pipeline/axes.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement pipeline/axes.ts and pipeline/layout.ts**

`pipeline/axes.ts`:
```ts
import { existsSync } from "node:fs";
import { AXES, type Axis, type RawRecord } from "../core/types";
import { CV_MIN, HUMAN_MIN, cvRidge, fitRidge, type AxisModel } from "../core/stance";
import { row } from "../core/vec";
import { modelByKey } from "../core/models";
import { loadEnrichments } from "./enrich";
import { readF32, readJson, writeJson } from "./io";

const LAMBDAS = [0.1, 0.3, 1, 3, 10, 30];
const MIN_LABELS = 20;

export function fitAxisModels(vecs: Float32Array[], labels: (number | null)[][], human: Record<Axis, number | null>): AxisModel[] {
  return AXES.map((axis, k) => {
    const idx = labels.map((l, i) => (l[k] === null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length < MIN_LABELS)
      return { axis, w: [], b: 0, lambda: 0, n: idx.length, cvSpearman: 0, cvR2: 0, humanSpearman: human[axis], auto: false };
    const X = idx.map((i) => vecs[i]), y = idx.map((i) => labels[i][k] as number);
    const cv = cvRidge(X, y, LAMBDAS);
    const m = fitRidge(X, y, cv.lambda);
    const auto = cv.spearman >= CV_MIN && (human[axis] ?? -1) >= HUMAN_MIN;
    return { axis, w: Array.from(m.w), b: m.b, lambda: cv.lambda, n: idx.length, cvSpearman: cv.spearman, cvR2: cv.r2, humanSpearman: human[axis], auto };
  });
}

function main() {
  const [modelKey, chunking] = (process.argv[2] ?? "").split("__");
  if (!modelKey || !chunking) throw new Error("usage: npm run axes -- <modelKey>__<chunking>");
  const spec = modelByKey(modelKey);
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const enr = loadEnrichments(recs, "data/build/enrichment");
  const flat = readF32(`data/build/emb/${modelKey}__${chunking}.f32`);
  const vecs = recs.map((_, i) => row(flat, spec.dim, i));
  const labels = recs.map((r) => AXES.map((a) => enr.get(r.id)!.axes[a]));
  const humanFile = "eval/human_agreement.json";
  const human = existsSync(humanFile)
    ? readJson<Record<Axis, number | null>>(humanFile)
    : { ontology: null, mechanism: null, evidence: null, scope: null };
  const models = fitAxisModels(vecs, labels, human);
  writeJson(`data/build/axes.${modelKey}__${chunking}.json`, models);
  for (const m of models) console.log(m.axis, { n: m.n, cv: m.cvSpearman.toFixed(2), human: m.humanSpearman, auto: m.auto });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

`pipeline/layout.ts`:
```ts
import { UMAP } from "umap-js";
import { mulberry32 } from "../core/random";
import { modelByKey } from "../core/models";
import { row } from "../core/vec";
import type { RawRecord } from "../core/types";
import { readF32, readJson, writeJson } from "./io";

export function computeLayout(vecs: Float32Array[], seed = 42): [number, number][] {
  const umap = new UMAP({ nComponents: 2, nNeighbors: Math.min(15, vecs.length - 1), minDist: 0.1, random: mulberry32(seed) });
  const xy = umap.fit(vecs.map((v) => Array.from(v)));
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return xy.map(([x, y]) => [(x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1)]);
}

function main() {
  const [modelKey, chunking] = (process.argv[2] ?? "").split("__");
  const spec = modelByKey(modelKey);
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const flat = readF32(`data/build/emb/${modelKey}__${chunking}.f32`);
  writeJson(`data/build/layout.${modelKey}__${chunking}.json`, computeLayout(recs.map((_, i) => row(flat, spec.dim, i))));
  console.log("layout written");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 5: Run tests, commit**

Run: `npx vitest run tests/pipeline/axes.test.ts`. Expected: 2 passed.
```bash
git add pipeline tests && git commit -m "feat(pipeline): embeddings, gated axis models, UMAP layout"
```

---

### Task 14: Evaluation harness and config selection

**Files:**
- Create: `eval/metrics.ts`, `eval/e1.ts`, `eval/personas.yaml`, `eval/label-personas.ts`, `eval/label-stance.ts`, `eval/run.ts`
- Test: `tests/eval/metrics.test.ts`, `tests/eval/e1.test.ts`
- Output: `eval/report.md`, `eval/labels.json`, `eval/human_axes.json`, `eval/human_agreement.json`, `config/compass.json`

**Interfaces:**
- Consumes: `relevance`, `rankOrder`, `Corpus`, `RetrievalConfig` (Task 7); `buildBm25` (Task 6); `nodeEmbedder`, `embedQuery`, `MODELS` (Task 6); `spearman`, `pearson` (Task 8); `docText`, `CHUNKINGS` (Task 13); `loadEnrichments` (Task 12); `mulberry32`, `shuffle` (Task 2); `readF32`, `readJson`, `writeJson` (Task 4).
- Produces: `mrr(ranked: string[], relevant: Set<string>): number`; `recallAtK(ranked, relevant, k): number`; `ndcgAtK(ranked: string[], grades: Map<string, number>, k: number): number`; `bootstrapCI(values: number[], iters?: number, seed?: number): [number, number]`; `mean(xs: number[]): number` (eval/metrics.ts); `e1SessionRecovery(ids: string[], sessionOf: (string | null)[], scoreRow: (i: number) => Float64Array): { mrr: number[]; recall10: number[]; ndcg10: number[] }` (eval/e1.ts); `config/compass.json` = `{ model: string; chunking: "truncate" | "chunk"; retrieval: RetrievalConfig; rank: RankConfig; theta: number }`.

- [ ] **Step 1: Write the failing metrics and E1 tests**

`tests/eval/metrics.test.ts`:
```ts
import { expect, test } from "vitest";
import { bootstrapCI, mean, mrr, ndcgAtK, recallAtK } from "../../eval/metrics";

test("mrr and recall", () => {
  expect(mrr(["x", "a", "b"], new Set(["a"]))).toBeCloseTo(0.5);
  expect(mrr(["x"], new Set(["a"]))).toBe(0);
  expect(recallAtK(["a", "x", "b"], new Set(["a", "b", "c"]), 2)).toBeCloseTo(1 / 3);
});

test("ndcg: perfect order is 1, reversed is lower, no relevant is 0", () => {
  const g = new Map([["a", 2], ["b", 1]]);
  expect(ndcgAtK(["a", "b", "c"], g, 3)).toBeCloseTo(1);
  expect(ndcgAtK(["c", "b", "a"], g, 3)).toBeLessThan(1);
  expect(ndcgAtK(["c"], new Map(), 3)).toBe(0);
});

test("bootstrapCI brackets the mean and is deterministic", () => {
  const xs = Array.from({ length: 100 }, (_, i) => i % 10);
  const [lo, hi] = bootstrapCI(xs, 500, 1);
  expect(lo).toBeLessThan(mean(xs)); expect(hi).toBeGreaterThan(mean(xs));
  expect(bootstrapCI(xs, 500, 1)).toEqual([lo, hi]);
});
```

`tests/eval/e1.test.ts`:
```ts
import { expect, test } from "vitest";
import { e1SessionRecovery } from "../../eval/e1";

test("E1 excludes the query doc and skips docs without session or session-mates", () => {
  const ids = ["a", "b", "c", "d"];
  const sess = ["S1", "S1", "S2", null];
  // Perfect scorer: same session scores 1, others 0, self scores 99 (must be excluded).
  const scoreRow = (i: number) => Float64Array.from(ids.map((_, j) => (j === i ? 99 : sess[j] === sess[i] ? 1 : 0)));
  const r = e1SessionRecovery(ids, sess, scoreRow);
  expect(r.mrr).toEqual([1, 1]); // only a and b qualify (c has no mates, d has no session)
  expect(r.recall10).toEqual([1, 1]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/eval`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement eval/metrics.ts and eval/e1.ts**

`eval/metrics.ts`:
```ts
import { mulberry32 } from "../core/random";

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export function mrr(ranked: string[], relevant: Set<string>): number {
  const i = ranked.findIndex((id) => relevant.has(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  return relevant.size === 0 ? 0 : ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size;
}

export function ndcgAtK(ranked: string[], grades: Map<string, number>, k: number): number {
  const dcg = (gs: number[]) => gs.slice(0, k).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = dcg([...grades.values()].sort((a, b) => b - a));
  return ideal === 0 ? 0 : dcg(ranked.map((id) => grades.get(id) ?? 0)) / ideal;
}

export function bootstrapCI(values: number[], iters = 1000, seed = 11): [number, number] {
  const rnd = mulberry32(seed);
  const means: number[] = [];
  for (let t = 0; t < iters; t++) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[Math.floor(rnd() * values.length)];
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iters * 0.025)], means[Math.floor(iters * 0.975)]];
}
```

`eval/e1.ts`:
```ts
import { rankOrder } from "../core/retrieval";
import { mrr, ndcgAtK, recallAtK } from "./metrics";

export function e1SessionRecovery(ids: string[], sessionOf: (string | null)[], scoreRow: (i: number) => Float64Array) {
  const out = { mrr: [] as number[], recall10: [] as number[], ndcg10: [] as number[] };
  ids.forEach((_, i) => {
    const s = sessionOf[i];
    if (!s) return;
    const mates = new Set(ids.filter((_, j) => j !== i && sessionOf[j] === s));
    if (mates.size === 0) return;
    const ranked = rankOrder(scoreRow(i)).filter((j) => j !== i).map((j) => ids[j]);
    out.mrr.push(mrr(ranked, mates));
    out.recall10.push(recallAtK(ranked, mates, 10));
    out.ndcg10.push(ndcgAtK(ranked, new Map([...mates].map((m) => [m, 1])), 10));
  });
  return out;
}
```

Run: `npx vitest run tests/eval`. Expected: 4 passed.

- [ ] **Step 4: Write personas and the two labeling CLIs**

`eval/personas.yaml` has 20 personas. Tim and Mason can edit the wording before labeling. Personas are split by index: even indices are the tune set, odd indices are the held-out test set.
```yaml
- id: anesthesiologist
  query: Anesthesiologist curious whether microtubules and anesthetic action tell us anything about consciousness.
- id: buddhist-skeptic
  query: Long-term Buddhist meditator who is skeptical of panpsychism and wants first-person methods taken seriously.
- id: ml-engineer
  query: Machine learning engineer wondering whether large language models could be conscious and how we would test it.
- id: psychedelic-clinician
  query: Psychiatrist running psilocybin trials, interested in mechanisms of altered states and therapeutic outcomes.
- id: iit-fan
  query: IIT
- id: physicalist-philosopher
  query: Analytic philosopher defending physicalism and illusionism about phenomenal consciousness.
- id: idealist
  query: Interested in analytic idealism and the view that consciousness is fundamental to reality.
- id: eeg-lab
  query: EEG researcher studying neural correlates of conscious perception and loss of consciousness under sedation.
- id: psi-researcher
  query: Experimental parapsychologist running presentiment and remote viewing studies with rigorous controls.
- id: nde-nurse
  query: ICU nurse who has heard many near-death experience reports and wants to understand the research.
- id: artist
  query: Visual artist exploring dreams, myth and creativity as windows into consciousness.
- id: animal-cognition
  query: Biologist studying consciousness in non-human animals, insects and plants.
- id: quantum-physicist
  query: Physicist interested in the measurement problem and whether consciousness plays a role in quantum collapse.
- id: predictive-processing
  query: Cognitive scientist working on predictive processing and active inference accounts of experience.
- id: free-will
  query: Philosopher of mind interested in free will, agency and intentionality.
- id: organoids
  query: Neuroscientist growing cerebral organoids and worried about whether they could become conscious.
- id: contemplative-teacher
  query: Meditation teacher interested in nondual awareness and how science studies contemplative states.
- id: em-field
  query: Engineer curious about electromagnetic field theories of consciousness and brain EM fields.
- id: origins-of-life
  query: Biologist asking whether life or consciousness came first in evolution.
- id: ai-ethics
  query: Policy researcher concerned with AI consciousness claims, moral status and how to assess them.
```

`eval/label-personas.ts`:
```ts
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parse } from "yaml";
import { mulberry32, shuffle } from "../core/random";
import type { RawRecord } from "../core/types";
import { loadEnrichments } from "../pipeline/enrich";
import { readJson, writeJson } from "../pipeline/io";

/** Pool = union of each config's top-20 (eval/pools.json, written by run.ts --pools) plus 10 random docs. Shown shuffled, without scores or source. */
async function main() {
  const personas = parse((await import("node:fs")).readFileSync("eval/personas.yaml", "utf8")) as { id: string; query: string }[];
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const enr = loadEnrichments(recs, "data/build/enrichment");
  const pools = readJson<Record<string, string[]>>("eval/pools.json");
  const labels: Record<string, Record<string, number>> = existsSync("eval/labels.json") ? readJson("eval/labels.json") : {};
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const [pi, p] of personas.entries()) {
    labels[p.id] ??= {};
    const rnd = mulberry32(1000 + pi);
    const random10 = shuffle(recs.map((r) => r.id), rnd).slice(0, 10);
    const pool = shuffle([...new Set([...(pools[p.id] ?? []), ...random10])], rnd).filter((id) => !(id in labels[p.id]));
    console.log(`\n=== ${p.id}: ${p.query}\n(${pool.length} to label; 2 = must see, 1 = relevant, 0 = not relevant, q = save and quit)`);
    for (const id of pool) {
      const r = recs.find((x) => x.id === id)!;
      const ans = (await rl.question(`\n${r.title}\n  ${enr.get(id)!.core_claim}\n> `)).trim();
      if (ans === "q") { writeJson("eval/labels.json", labels); rl.close(); return; }
      if (["0", "1", "2"].includes(ans)) labels[p.id][id] = Number(ans);
      writeJson("eval/labels.json", labels);
    }
  }
  rl.close();
}

await main();
```

`eval/label-stance.ts`:
```ts
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { AXES, type Axis, type RawRecord } from "../core/types";
import { mulberry32, shuffle } from "../core/random";
import { spearman } from "../core/stance";
import { AXIS_POLES } from "../core/explain";
import { loadEnrichments } from "../pipeline/enrich";
import { readJson, writeJson } from "../pipeline/io";

const N = 30;
type Human = Record<string, Record<Axis, number | null>>;

async function label(recs: RawRecord[]) {
  const sample = shuffle(recs.map((r) => r.id), mulberry32(2026)).slice(0, N);
  const human: Human = existsSync("eval/human_axes.json") ? readJson("eval/human_axes.json") : {};
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Score what each abstract emphasizes: -2..2, or n for no position. You won't see Claude's labels.");
  for (const id of sample.filter((x) => !(x in human))) {
    const r = recs.find((x) => x.id === id)!;
    console.log(`\n=== ${r.title}\n${r.abstract}\n`);
    const row = {} as Record<Axis, number | null>;
    for (const a of AXES) {
      const [neg, pos] = AXIS_POLES[a];
      for (;;) {
        const ans = (await rl.question(`${a} (-2 ${neg} ... +2 ${pos}, n): `)).trim();
        if (ans === "n") { row[a] = null; break; }
        if (/^-?[0-2]$/.test(ans)) { row[a] = Number(ans); break; }
      }
    }
    human[id] = row;
    writeJson("eval/human_axes.json", human);
  }
  rl.close();
  return human;
}

function agreement(recs: RawRecord[], human: Human) {
  const enr = loadEnrichments(recs, "data/build/enrichment");
  const out = {} as Record<Axis, number | null>;
  for (const a of AXES) {
    const pairs = Object.entries(human).map(([id, h]) => [h[a], enr.get(id)!.axes[a]] as const)
      .filter(([h, c]) => h !== null && c !== null) as [number, number][];
    const nullAgree = Object.entries(human).filter(([id, h]) => (h[a] === null) === (enr.get(id)!.axes[a] === null)).length;
    out[a] = pairs.length >= 8 ? spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null;
    console.log(a, { pairs: pairs.length, spearman: out[a]?.toFixed(2), nullAgreement: `${nullAgree}/${Object.keys(human).length}` });
  }
  writeJson("eval/human_agreement.json", out);
}

const recs = readJson<RawRecord[]>("data/raw/records.json");
agreement(recs, await label(recs));
```

- [ ] **Step 5: Implement eval/run.ts**

```ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { buildBm25 } from "../core/lexical";
import { embedQuery } from "../core/embedtext";
import { MODELS } from "../core/models";
import { rankOrder, relevance, type Corpus, type RetrievalConfig } from "../core/retrieval";
import { DEFAULT_RANK } from "../core/rank";
import { row } from "../core/vec";
import type { RawRecord } from "../core/types";
import { CHUNKINGS, docText } from "../pipeline/embed";
import { nodeEmbedder } from "../pipeline/embedder";
import { readF32, readJson, writeJson } from "../pipeline/io";
import { e1SessionRecovery } from "./e1";
import { bootstrapCI, mean, ndcgAtK } from "./metrics";
import { writeFileSync, existsSync } from "node:fs";

const RETRIEVALS: RetrievalConfig[] = [
  { mode: "lexical", alpha: 0, rrfK: 60 },
  { mode: "dense", alpha: 1, rrfK: 60 },
  ...[0.5, 0.7, 0.85].map((alpha) => ({ mode: "hybrid" as const, alpha, rrfK: 60 })),
  { mode: "rrf", alpha: 0, rrfK: 60 },
];
const fmt = (xs: number[]) => { const [lo, hi] = bootstrapCI(xs); return `${mean(xs).toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}]`; };

async function main() {
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const ids = recs.map((r) => r.id);
  const lex = buildBm25(recs.map(docText));
  const personas = parse(readFileSync("eval/personas.yaml", "utf8")) as { id: string; query: string }[];
  const labels: Record<string, Record<string, number>> = existsSync("eval/labels.json") ? readJson("eval/labels.json") : {};
  const pools: Record<string, Set<string>> = {};
  const rows: { name: string; model: string; chunking: string; retrieval: RetrievalConfig; e1: number[]; e2tune: number[]; e2test: number[] }[] = [];

  for (const spec of MODELS) {
    const embed = await nodeEmbedder(spec);
    const qVecs = await Promise.all(personas.map((p) => embedQuery(embed, p.query, spec)));
    for (const chunking of CHUNKINGS) {
      const vectors = readF32(`data/build/emb/${spec.key}__${chunking}.f32`);
      const corpus: Corpus = { ids, dim: spec.dim, vectors, lex };
      for (const rc of RETRIEVALS) {
        if (rc.mode === "lexical" && (spec !== MODELS[0] || chunking !== CHUNKINGS[0])) continue; // baseline once
        const name = rc.mode === "lexical" ? "BM25 baseline" : `${spec.key} / ${chunking} / ${rc.mode}${rc.mode === "hybrid" ? ` a=${rc.alpha}` : ""}`;
        // E1: doc-as-query, using its stored vector and its own text for BM25.
        const e1 = e1SessionRecovery(ids, recs.map((r) => (r.types.includes("Concurrent") ? r.sessionCode : null)),
          (i) => relevance(corpus, row(vectors, spec.dim, i), docText(recs[i]), rc).r).mrr;
        const e2tune: number[] = [], e2test: number[] = [];
        personas.forEach((p, pi) => {
          const ranked = rankOrder(relevance(corpus, qVecs[pi], p.query, rc).r).map((i) => ids[i]);
          pools[p.id] ??= new Set();
          ranked.slice(0, 20).forEach((id) => pools[p.id].add(id));
          const g = labels[p.id];
          if (g && Object.keys(g).length) (pi % 2 === 0 ? e2tune : e2test).push(ndcgAtK(ranked, new Map(Object.entries(g)), 10));
        });
        rows.push({ name, model: spec.key, chunking, retrieval: rc, e1, e2tune, e2test });
        console.log(name, "E1 MRR", mean(e1).toFixed(3));
      }
    }
  }
  writeJson("eval/pools.json", Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, [...v]])));

  const haveLabels = rows.some((r) => r.e2tune.length);
  const key = (r: (typeof rows)[number]) => (haveLabels ? mean(r.e1) + mean(r.e2tune) : mean(r.e1));
  const best = rows.filter((r) => r.retrieval.mode !== "lexical").sort((a, b) => key(b) - key(a))[0];
  const md = [
    "# TSC Compass evaluation report", "",
    `Records: ${recs.length}. Personas: ${personas.length} (labels for ${Object.keys(labels).length}). E2 tune = even personas, test = odd personas.`, "",
    "| config | E1 MRR (95% CI) | E2 nDCG@10 tune | E2 nDCG@10 test |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r === best ? "**" + r.name + "**" : r.name} | ${fmt(r.e1)} | ${r.e2tune.length ? fmt(r.e2tune) : "n/a"} | ${r.e2test.length ? fmt(r.e2test) : "n/a"} |`),
    "", `Selected: **${best.name}** (by E1 + E2 tune; E2 test is reported, never used for selection).`,
  ].join("\n");
  writeFileSync("eval/report.md", md + "\n");
  if (process.argv.includes("--select"))
    writeJson("config/compass.json", { model: best.model, chunking: best.chunking, retrieval: best.retrieval, rank: DEFAULT_RANK, theta: 0.6 });
  console.log(`report written; best = ${best.name}`);
}

await main();
```

- [ ] **Step 6: Run the first pass (E1 only) to produce pools**

Run: `npm run eval`. Expected: one line per config with E1 MRR, then `report written`. `eval/pools.json` exists. The BM25 baseline row is present.

- [ ] **Step 7: Human labeling (Tim and/or Mason, about 1 to 2 hours in total)**

Ask Tim to run, in their own terminal, `! npm run label:stance` (30 records, 4 axes each), then `! npm run label:personas` (blind, can be resumed with `q`). Expected outputs: `eval/human_axes.json`, `eval/human_agreement.json` and `eval/labels.json`. Then re-run the axis fits so the human gate applies, for each candidate:
```bash
for m in minilm bge-small gte-small; do for c in truncate chunk; do npm run axes -- ${m}__${c}; done; done
```

- [ ] **Step 8: Full evaluation and selection**

Run: `npm run eval -- --select`. Expected:
- `eval/report.md` has E1 and E2 columns.
- `config/compass.json` is written.
- The selected config beats the BM25 baseline on E1 and E2 tune, with non-overlapping confidence intervals on at least one.

If not, stop and report the table to Tim before going further.

Then run `npm run layout -- <model>__<chunking>` for the selected config.

- [ ] **Step 9: Commit**

```bash
git add eval config data/build/axes.*.json data/build/layout.*.json tests && git commit -m "feat(eval): session recovery, persona nDCG, config selection"
```

---

### Task 15: Codex review checkpoint (matching and evaluation)

**Files:**
- Review: `core/**`, `eval/**`, `pipeline/axes.ts`, `pipeline/enrich.ts`, `eval/report.md`
- Create: `docs/reviews/2026-10-07-codex-review.md`

**Interfaces:**
- Consumes: everything from Tasks 2 to 14.
- Produces: a findings file, plus fix commits for every accepted finding.

- [ ] **Step 1: Run Codex review**

Invoke the `codex:rescue` skill with this request:
"Review the matching algorithm and evaluation of TSC Compass for correctness and methodological soundness. Scope: core/retrieval.ts, core/stance.ts, core/rank.ts, core/explain.ts, core/itinerary.ts, eval/metrics.ts, eval/e1.ts, eval/run.ts, pipeline/axes.ts, pipeline/enrich.ts, and eval/report.md. The spec is docs/superpowers/specs/2026-10-04-tsc-compass-design.md, sections 5 and 7. Look for: math errors (ridge/Cholesky, Spearman with ties, nDCG, bootstrap), leakage between tuning and test personas, circularity in E1 or E2, cases where opponents or serendipity can return nonsense, ranking ties or NaN propagation, and anything in the report that overclaims. Report findings with file:line, severity and a concrete failing input."

- [ ] **Step 2: Triage with superpowers:receiving-code-review**

Save Codex's findings verbatim to `docs/reviews/2026-10-07-codex-review.md`. For each finding, verify it against the code (write a failing test that reproduces it), then fix it or record why it doesn't apply. Each fix follows TDD: failing test, fix, passing test, commit `fix(core): <summary> (codex review)`.

- [ ] **Step 3: Re-run the evaluation and commit**

Run: `npm test && npm run eval -- --select`. Expected: all tests pass. If any metric moved, say so in the commit message.
```bash
git add -A && git commit -m "docs: codex review findings and resolutions"
```

---

### Task 16: Export public bundle

**Files:**
- Create: `pipeline/export.ts`
- Test: `tests/pipeline/export.test.ts`

**Interfaces:**
- Consumes: `config/compass.json` (Task 14); `loadEnrichments` (Task 12); `buildBm25` (Task 6); `docText` (Task 13); `modelByKey`, `nodeEmbedder` (Task 6); `readF32`, `readJson`, `writeJson`, `writeF32` (Task 4); `Doc`, `RawRecord`, `Enrichment` (Task 2).
- Produces: `toDoc(r: RawRecord, e: Enrichment, xy: [number, number]): Doc`; `findLeaks(publicJson: string[], recs: RawRecord[]): string[]`; files in `web/public/data/`: `docs.json` (Doc[]), `vectors.f32`, `lex.json` (Bm25Index), `axes.json` (AxisModel[]), `slots.json`, `concepts.json` (`{ docId: string; concept: string }[]`), `conceptvecs.f32`, `meta.json` (`{ dataDate: string; model: string; dim: number; chunking: string; config: CompassConfig }`); model files in `web/public/models/<model id>/`.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/export.test.ts`:
```ts
import { expect, test } from "vitest";
import type { Enrichment, RawRecord } from "../../core/types";
import { findLeaks, toDoc } from "../../pipeline/export";

const r = { id: "a", name: "N", affiliation: "A", title: "T", url: "u", day: "2026-10-12", sessionCode: "MON-1",
  sessionName: "S", room: "R", types: ["Concurrent"], workshops: [],
  abstract: "the quick brown fox jumps over the lazy dog near the riverbank today", bio: "bio text here" } as RawRecord;
const e = { core_claim: "c", discipline: "biology", methods: [], axes: { ontology: 1, mechanism: null, evidence: null, scope: null },
  concepts: ["x"], ask_question: "q1", challenge_question: "q2" } as Enrichment;

test("toDoc carries no abstract or bio", () => {
  const d = toDoc(r, e, [0.1, 0.2]);
  expect(JSON.stringify(d)).not.toContain("quick brown");
  expect(JSON.stringify(d)).not.toContain("bio text");
  expect(d).toMatchObject({ id: "a", coreClaim: "c", askQuestion: "q1", challengeQuestion: "q2", xy: [0.1, 0.2] });
});

test("findLeaks flags any 8-word run of abstract text in public JSON", () => {
  expect(findLeaks(['{"x":"nothing here"}'], [r])).toEqual([]);
  expect(findLeaks(['{"x":"... quick brown fox jumps over the lazy dog near ..."}'], [r])).toEqual(["a"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pipeline/export.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement pipeline/export.ts**

```ts
import { cpSync, readFileSync, mkdirSync } from "node:fs";
import { buildBm25 } from "../core/lexical";
import { modelByKey } from "../core/models";
import type { RetrievalConfig } from "../core/retrieval";
import type { RankConfig } from "../core/rank";
import type { Doc, Enrichment, RawRecord, Slot } from "../core/types";
import { docText } from "./embed";
import { nodeEmbedder } from "./embedder";
import { loadEnrichments } from "./enrich";
import { readF32, readJson, writeF32, writeJson } from "./io";

export interface CompassConfig { model: string; chunking: "truncate" | "chunk"; retrieval: RetrievalConfig; rank: RankConfig; theta: number }

export function toDoc(r: RawRecord, e: Enrichment, xy: [number, number]): Doc {
  return {
    id: r.id, name: r.name, affiliation: r.affiliation, title: r.title, url: r.url, day: r.day,
    sessionCode: r.sessionCode, sessionName: r.sessionName, room: r.room, types: r.types, workshops: r.workshops,
    coreClaim: e.core_claim, discipline: e.discipline, methods: e.methods, axes: e.axes, concepts: e.concepts,
    askQuestion: e.ask_question, challengeQuestion: e.challenge_question, xy,
  };
}

export function findLeaks(publicJson: string[], recs: RawRecord[]): string[] {
  const hay = publicJson.join("\n").toLowerCase();
  return recs.filter((r) => {
    const w = r.abstract.toLowerCase().split(/\s+/);
    for (let i = 0; i + 8 <= w.length; i++) if (hay.includes(w.slice(i, i + 8).join(" "))) return true;
    return false;
  }).map((r) => r.id);
}

async function main() {
  const cfg = readJson<CompassConfig>("config/compass.json");
  const spec = modelByKey(cfg.model);
  const tag = `${cfg.model}__${cfg.chunking}`;
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const enr = loadEnrichments(recs, "data/build/enrichment"); // throws on missing or stale (Review Focus 5)
  const layout = readJson<[number, number][]>(`data/build/layout.${tag}.json`);
  if (layout.length !== recs.length) throw new Error("layout is stale: re-run npm run layout");
  const docs = recs.map((r, i) => toDoc(r, enr.get(r.id)!, layout[i]));
  const out = "web/public/data";
  mkdirSync(out, { recursive: true });
  writeJson(`${out}/docs.json`, docs);
  writeF32(`${out}/vectors.f32`, readF32(`data/build/emb/${tag}.f32`));
  writeJson(`${out}/lex.json`, buildBm25(recs.map(docText)));
  writeJson(`${out}/axes.json`, readJson(`data/build/axes.${tag}.json`));
  writeJson(`${out}/slots.json`, readJson<Slot[]>("data/build/slots.json"));
  const concepts = docs.flatMap((d) => d.concepts.map((concept) => ({ docId: d.id, concept })));
  const embed = await nodeEmbedder(spec);
  const cv = await embed(concepts.map((c) => c.concept));
  const flat = new Float32Array(cv.length * spec.dim);
  cv.forEach((v, i) => flat.set(v, i * spec.dim));
  writeJson(`${out}/concepts.json`, concepts);
  writeF32(`${out}/conceptvecs.f32`, flat);
  writeJson(`${out}/meta.json`, { dataDate: new Date().toISOString().slice(0, 10), model: spec.id, dim: spec.dim, chunking: cfg.chunking, config: cfg });
  cpSync(`.hfcache/${spec.id}`, `web/public/models/${spec.id}`, { recursive: true });

  const leaks = findLeaks(["docs.json", "concepts.json", "meta.json"].map((f) => readFileSync(`${out}/${f}`, "utf8")), recs);
  if (leaks.length) throw new Error(`abstract text leaked into public bundle for: ${leaks.join(", ")}`);
  console.log(`exported ${docs.length} docs, ${concepts.length} concepts, model ${spec.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
```

Note: `lex.json` contains stemmed term counts, not readable text. That's intended and allowed by the Global Constraints.

- [ ] **Step 4: Run tests, run export, commit**

Run: `npx vitest run tests/pipeline/export.test.ts && npm run export`. Expected: 2 passed; `exported 293 docs ...`. `ls web/public/models/Xenova/*/onnx` shows `model_quantized.onnx`. If the copied directory lacks it, list `.hfcache/` to find the real layout and adjust the `cpSync` source.
```bash
git add pipeline tests && git commit -m "feat(pipeline): export public bundle with leak check"
```

---

### Task 17: Web engine and embedding worker

**Files:**
- Create: `web/index.html`, `web/src/data.ts`, `web/src/engine.ts`, `web/src/worker.ts`, `web/src/storage.ts`, `web/vite.config.ts`
- Test: `tests/web/engine.test.ts`, `tests/web/storage.test.ts`

**Interfaces:**
- Consumes: `relevance`, `Corpus` (Task 7); `projectStance`, `AxisModel`, `Sliders` (Task 8); `rankAll`, `Results` (Task 9); `explain` (Task 10); `buildItinerary`, `PlanItem` (Task 11); `embedQuery`, `ModelSpec` (Task 6); `CompassConfig` (Task 16).
- Produces:
  - `interface Bundle { docs: Doc[]; corpus: Corpus; axes: AxisModel[]; slots: Slot[]; conceptVec: (docId: string, concept: string) => Float32Array | undefined; meta: { dataDate: string; model: string; dim: number; chunking: string; config: CompassConfig } }`, `loadBundle(base?: string): Promise<Bundle>` (web/src/data.ts)
  - `interface Query { text: string; qVec: Float32Array | null; sliders: Sliders; days: Set<string> | null; types: Set<string> | null; methods: string[]; pins: Record<string, string> }`, `interface Answer { results: Results; reasons: Map<string, string[]>; plan: PlanItem[]; u: AxisScores; lexicalOnly: boolean }`, `answer(b: Bundle, q: Query): Answer` (web/src/engine.ts)
  - worker protocol: post `{ type: "embed", id: number, text: string }`, receive `{ type: "vec", id, vec: Float32Array }`, `{ type: "progress", loaded: number, total: number }`, `{ type: "ready" }` or `{ type: "error", message: string }` (web/src/worker.ts)
  - `safeGet<T>(key: string, fallback: T): T`, `safeSet(key: string, value: unknown): void` (web/src/storage.ts)

- [ ] **Step 1: Write the failing engine and storage tests**

`tests/web/engine.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildBm25 } from "../../core/lexical";
import { DEFAULT_RANK } from "../../core/rank";
import type { Doc } from "../../core/types";
import type { Bundle } from "../../web/src/data";
import { answer } from "../../web/src/engine";

const doc = (id: string, title: string, sessionCode: string): Doc => ({
  id, name: id, affiliation: "", title, url: "", day: "2026-10-12", sessionCode, sessionName: null, room: null,
  types: ["Concurrent"], workshops: [], coreClaim: "", discipline: "neuroscience", methods: [], concepts: [title],
  axes: { ontology: null, mechanism: null, evidence: null, scope: null }, askQuestion: "", challengeQuestion: "", xy: [0, 0],
});
const docs = [doc("a", "microtubule anesthesia", "MON-1"), doc("b", "global workspace", "MON-2"), doc("c", "dreams and myth", "MON-2")];
const bundle: Bundle = {
  docs,
  corpus: { ids: docs.map((d) => d.id), dim: 2, vectors: new Float32Array([1, 0, 0, 1, 0.7, 0.7]), lex: buildBm25(docs.map((d) => d.title)) },
  axes: [], conceptVec: () => undefined,
  slots: [{ id: "conc-2026-10-12", day: "2026-10-12", start: "17:00", end: "19:05", kind: "concurrent",
    options: [{ id: "MON-1", label: "One", room: null, docIds: ["a"] }, { id: "MON-2", label: "Two", room: null, docIds: ["b", "c"] }] }],
  meta: { dataDate: "2026-10-05", model: "m", dim: 2, chunking: "chunk",
    config: { model: "m", chunking: "chunk", retrieval: { mode: "hybrid", alpha: 0.7, rrfK: 60 }, rank: { ...DEFAULT_RANK, weakDense: 0.2 }, theta: 0.6 } },
};
const q = { text: "microtubule anesthesia", qVec: new Float32Array([1, 0]), sliders: {}, days: null, types: null, methods: [], pins: {} };

test("answer ranks, explains and plans", () => {
  const a = answer(bundle, q);
  expect(a.results.kindred[0].id).toBe("a");
  expect(a.reasons.get("a")).toContain("Shared interest: microtubule anesthesia");
  expect(a.plan[0].chosen.id).toBe("MON-1");
  expect(a.lexicalOnly).toBe(false);
});

test("lexical-only when the model is unavailable (Review Focus 4)", () => {
  const a = answer(bundle, { ...q, qVec: null });
  expect(a.lexicalOnly).toBe(true);
  expect(a.results.kindred[0].id).toBe("a");
});

test("type filter", () => {
  const a = answer(bundle, { ...q, types: new Set(["Poster"]) });
  expect(a.results.kindred).toEqual([]);
  expect(a.results.weak).toBe(true);
});
```

`tests/web/storage.test.ts`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { safeGet, safeSet } from "../../web/src/storage";

afterEach(() => vi.unstubAllGlobals());

test("safeGet/safeSet survive a throwing localStorage", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
  expect(safeGet("k", { a: 1 })).toEqual({ a: 1 });
  expect(() => safeSet("k", 1)).not.toThrow();
});

test("safeGet returns fallback on corrupt JSON", () => {
  vi.stubGlobal("localStorage", { getItem: () => "{nope", setItem: () => {} });
  expect(safeGet("k", 5)).toBe(5);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/web`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement storage, data and engine**

`web/src/storage.ts`:
```ts
export function safeGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
}
export function safeSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: app still works */ }
}
```

`web/src/data.ts`:
```ts
import type { Bm25Index } from "../../core/lexical";
import type { Corpus } from "../../core/retrieval";
import type { AxisModel } from "../../core/stance";
import type { Doc, Slot } from "../../core/types";
import type { CompassConfig } from "../../pipeline/export";

export interface Bundle {
  docs: Doc[]; corpus: Corpus; axes: AxisModel[]; slots: Slot[];
  conceptVec: (docId: string, concept: string) => Float32Array | undefined;
  meta: { dataDate: string; model: string; dim: number; chunking: string; config: CompassConfig };
}

const json = async <T>(u: string) => (await fetch(u)).json() as Promise<T>;
const f32 = async (u: string) => new Float32Array(await (await fetch(u)).arrayBuffer());

export async function loadBundle(base = "data/"): Promise<Bundle> {
  const [docs, lex, axes, slots, concepts, meta, vectors, cvecs] = await Promise.all([
    json<Doc[]>(base + "docs.json"), json<Bm25Index>(base + "lex.json"), json<AxisModel[]>(base + "axes.json"),
    json<Slot[]>(base + "slots.json"), json<{ docId: string; concept: string }[]>(base + "concepts.json"),
    json<Bundle["meta"]>(base + "meta.json"), f32(base + "vectors.f32"), f32(base + "conceptvecs.f32"),
  ]);
  const dim = meta.dim;
  const cIndex = new Map(concepts.map((c, i) => [`${c.docId}::${c.concept}`, i]));
  return {
    docs, axes, slots, meta,
    corpus: { ids: docs.map((d) => d.id), dim, vectors, lex },
    conceptVec: (id, c) => { const i = cIndex.get(`${id}::${c}`); return i === undefined ? undefined : cvecs.subarray(i * dim, (i + 1) * dim); },
  };
}
```

`web/src/engine.ts`:
```ts
import { explain } from "../../core/explain";
import { buildItinerary, type PlanItem } from "../../core/itinerary";
import { rankAll, type Results } from "../../core/rank";
import { relevance } from "../../core/retrieval";
import { projectStance, type Sliders } from "../../core/stance";
import type { AxisScores } from "../../core/types";
import type { Bundle } from "./data";

export interface Query {
  text: string; qVec: Float32Array | null; sliders: Sliders; days: Set<string> | null;
  types: Set<string> | null; methods: string[]; pins: Record<string, string>;
}
export interface Answer { results: Results; reasons: Map<string, string[]>; plan: PlanItem[]; u: AxisScores; lexicalOnly: boolean }

export function answer(b: Bundle, q: Query): Answer {
  const cfg = b.meta.config;
  const { r, dense } = relevance(b.corpus, q.qVec, q.text, cfg.retrieval);
  const u = q.qVec ? projectStance(b.axes, q.qVec, q.sliders) : projectStance([], new Float32Array(0), q.sliders);
  const autoOk = new Set(b.axes.filter((m) => m.auto).map((m) => m.axis));
  const results = rankAll({
    docs: b.docs, vectors: b.corpus.vectors, dim: b.corpus.dim, r, dense, u,
    oppAxes: (a) => autoOk.has(a),
    allow: (d) => (!q.types || d.types.some((t) => q.types!.has(t))) && (!q.days || !d.day || q.days.has(d.day)) &&
      (q.methods.length === 0 || q.methods.some((m) => (d.methods as string[]).includes(m))),
  }, cfg.rank);
  const reasons = new Map<string, string[]>();
  for (const m of [...results.kindred, ...results.opponents, ...(results.serendipity ? [results.serendipity] : [])])
    reasons.set(m.id, explain({ doc: b.docs[m.idx], u, shared: m.shared, qText: q.text, qVec: q.qVec, conceptVec: b.conceptVec, theta: cfg.theta, methods: q.methods }));
  const idx = new Map(b.docs.map((d, i) => [d.id, i]));
  const plan = buildItinerary(b.slots, (id) => results.docScores[idx.get(id) ?? -1] ?? -Infinity, { days: q.days, pins: q.pins, posterN: 10 });
  return { results, reasons, plan, u, lexicalOnly: q.qVec === null };
}
```

Note: opponents only use axes in `autoOk`, per spec section 4 (a slider-only axis never drives opponents). The engine test bundle has no axes, so it has no opponents, as expected.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/web`. Expected: 5 passed.

- [ ] **Step 5: Implement the worker, index.html and vite config**

`web/src/worker.ts`:
```ts
import { env, pipeline } from "@huggingface/transformers";
import { embedQuery } from "../../core/embedtext";
import { MODELS } from "../../core/models";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("../models/", self.location.href).href;

let ready: Promise<(text: string) => Promise<Float32Array>> | null = null;

function init(modelId: string) {
  const spec = MODELS.find((m) => m.id === modelId)!;
  return (async () => {
    const ex = await pipeline("feature-extraction", modelId, {
      dtype: "q8",
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === "progress") postMessage({ type: "progress", loaded: p.loaded ?? 0, total: p.total ?? 0 });
      },
    });
    const embed = async (texts: string[]) => {
      const t = await ex(texts, { pooling: spec.pooling, normalize: true });
      const [n, d] = t.dims as [number, number];
      const data = t.data as Float32Array;
      return Array.from({ length: n }, (_, i) => data.slice(i * d, (i + 1) * d));
    };
    postMessage({ type: "ready" });
    return (text: string) => embedQuery(embed, text, spec);
  })();
}

onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "init"; model: string } | { type: "embed"; id: number; text: string };
  try {
    if (msg.type === "init") { ready = init(msg.model); await ready; return; }
    if (!ready) throw new Error("not initialised");
    const vec = await (await ready)(msg.text);
    postMessage({ type: "vec", id: msg.id, vec }, [vec.buffer]);
  } catch (err) {
    postMessage({ type: "error", message: String(err) });
  }
};
```

`web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
export default defineConfig({ base: "./", worker: { format: "es" }, build: { target: "es2022" } });
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TSC Compass</title>
  <meta name="description" content="Unofficial matcher for The Science of Consciousness 2026: find kindred spirits, worthy opponents and your week's plan." />
  <link rel="stylesheet" href="./src/style.css" />
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck && npm test`. Expected: no type errors, all tests pass.
```bash
git add web tests && git commit -m "feat(web): engine, data loader, embedding worker"
```

---

### Task 18: Web UI (search, three lists, stance panel, itinerary, map)

**Files:**
- Create: `web/src/main.ts`, `web/src/ui/results.ts`, `web/src/ui/stance.ts`, `web/src/ui/itinerary.ts`, `web/src/ui/map.ts`, `web/src/ui/html.ts`, `web/src/style.css`
- Test: `e2e/app.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `loadBundle`, `Bundle` (Task 17); `answer`, `Query`, `Answer` (Task 17); `safeGet`, `safeSet` (Task 17); `toIcs` (Task 11); `AXIS_POLES` (Task 10); `AXES`, `METHODS` (Task 2).
- Produces: a working static UI. Every result card has `data-testid="match"` with `data-list="kindred|opponents|serendipity"` and `data-id="<docId>"`. The banners are `data-testid="weak-banner"` and `data-testid="lexical-banner"`.

- [ ] **Step 1: Write the HTML helper and render modules**

`web/src/ui/html.ts`:
```ts
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function el(html: string): HTMLElement { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; }
```

`web/src/ui/results.ts`:
```ts
import type { Match } from "../../../core/rank";
import type { Doc } from "../../../core/types";
import type { Answer } from "../engine";
import { el, esc } from "./html";

function card(list: string, m: Match, d: Doc, reasons: string[], question: string): string {
  const when = [d.day ? new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "", d.sessionCode ?? "", d.room ?? ""].filter(Boolean).join(" \u00b7 ");
  return `<article class="card" data-testid="match" data-list="${list}" data-id="${esc(d.id)}">
    <h3><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a></h3>
    <p class="who">${esc(d.name)}${d.affiliation ? `, ${esc(d.affiliation)}` : ""}</p>
    <p class="when">${esc(when)}</p>
    <p class="claim">${esc(d.coreClaim)}</p>
    ${reasons.length ? `<ul class="why">${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    <p class="ask"><span>Ask:</span> ${esc(question)}</p>
  </article>`;
}

export function renderResults(root: HTMLElement, a: Answer, docs: Doc[]): void {
  const R = a.results;
  const col = (title: string, blurb: string, list: string, ms: Match[], q: (d: Doc) => string, empty: string) =>
    `<section class="col"><h2>${title}</h2><p class="blurb">${blurb}</p>${ms.length
      ? ms.map((m) => card(list, m, docs[m.idx], a.reasons.get(m.id) ?? [], q(docs[m.idx]))).join("")
      : `<p class="empty">${empty}</p>`}</section>`;
  root.replaceChildren(el(`<div class="results">
    ${a.lexicalOnly ? `<p class="banner" data-testid="lexical-banner">The meaning model couldn't load, so these are keyword matches only.</p>` : ""}
    ${R.weak ? `<p class="banner" data-testid="weak-banner">Nothing in the program strongly matches this. Try different words or broaden your filters.</p>` : ""}
    <div class="cols">
      ${col("Kindred spirits", "Close to your interests and your position.", "kindred", R.kindred, (d) => d.askQuestion, "No matches with these filters.")}
      ${col("Worthy opponents", "Same topic, a different position. Good hallway arguments.", "opponents", R.opponents, (d) => d.challengeQuestion,
        "No clear disagreement found. Set your stance below to find opponents.")}
      ${col("Serendipity", "Relevant, from a field you might not visit.", "serendipity", R.serendipity ? [R.serendipity] : [], (d) => d.askQuestion, "None this time.")}
    </div>
    <p class="note">Questions and one-line summaries are AI-drafted from the official abstracts. Treat them as starting points, and read the abstract.</p>
  </div>`));
}
```

`web/src/ui/stance.ts`:
```ts
import { AXIS_POLES } from "../../../core/explain";
import type { Sliders } from "../../../core/stance";
import { AXES, type AxisScores } from "../../../core/types";
import { el, esc } from "./html";

export function renderStance(root: HTMLElement, sliders: Sliders, inferred: AxisScores, onChange: (s: Sliders) => void): void {
  const rows = AXES.map((a) => {
    const set = a in sliders;
    const v = set ? sliders[a] : inferred[a];
    return `<div class="axis"><label for="ax-${a}">${esc(AXIS_POLES[a][0])} <span>vs</span> ${esc(AXIS_POLES[a][1])}</label>
      <input id="ax-${a}" type="range" min="-2" max="2" step="1" value="${v ?? 0}" ${v === null ? 'data-null="1"' : ""} />
      <button type="button" data-clear="${a}">${set ? "Use my text" : v === null ? "No opinion" : "Inferred"}</button></div>`;
  }).join("");
  const node = el(`<details class="stance"><summary>My stance (optional)</summary>${rows}</details>`);
  node.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((inp) =>
    inp.addEventListener("change", () => onChange({ ...sliders, [inp.id.slice(3)]: Number(inp.value) })));
  node.querySelectorAll<HTMLButtonElement>("button[data-clear]").forEach((b) => b.addEventListener("click", () => {
    const next = { ...sliders }; delete next[b.dataset.clear as keyof Sliders]; onChange(next);
  }));
  root.replaceChildren(node);
}
```

`web/src/ui/itinerary.ts`:
```ts
import { toIcs, type PlanItem } from "../../../core/itinerary";
import type { Doc } from "../../../core/types";
import { el, esc } from "./html";

export function renderItinerary(root: HTMLElement, plan: PlanItem[], docs: Doc[], onPin: (slotId: string, optionId: string | null) => void): void {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const days = [...new Set(plan.map((p) => p.slot.day))];
  const html = days.map((day) => `<h3>${new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h3>` +
    plan.filter((p) => p.slot.day === day).map((p) => `<div class="slot"><span class="time">${p.slot.start}</span>
      <select data-slot="${esc(p.slot.id)}" aria-label="Session at ${p.slot.start}">
        ${p.slot.options.map((o) => `<option value="${esc(o.id)}" ${o.id === p.chosen.id ? "selected" : ""}>${esc(p.slot.kind === "poster" ? o.label : `${o.id}: ${o.label}`)}</option>`).join("")}
      </select>${p.pinned ? `<button data-unpin="${esc(p.slot.id)}">Unpin</button>` : ""}
      ${p.posters.length ? `<ol class="posters">${p.posters.map((id) => `<li><a href="${esc(byId.get(id)!.url)}" target="_blank" rel="noopener">${esc(byId.get(id)!.title)}</a></li>`).join("")}</ol>` : ""}
    </div>`).join("")).join("");
  const node = el(`<section class="itinerary"><h2>My week</h2>${html}<button id="ics">Add to calendar (.ics)</button></section>`);
  node.querySelectorAll<HTMLSelectElement>("select[data-slot]").forEach((s) => s.addEventListener("change", () => onPin(s.dataset.slot!, s.value)));
  node.querySelectorAll<HTMLButtonElement>("button[data-unpin]").forEach((b) => b.addEventListener("click", () => onPin(b.dataset.unpin!, null)));
  node.querySelector("#ics")!.addEventListener("click", () => {
    const blob = new Blob([toIcs(plan, byId)], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tsc2026-my-week.ics"; a.click();
  });
  root.replaceChildren(node);
}
```

`web/src/ui/map.ts`:
```ts
import { DISCIPLINES, type Doc } from "../../../core/types";
import type { Answer } from "../engine";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];

export function renderMap(canvas: HTMLCanvasElement, docs: Doc[], a: Answer | null): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const P = (xy: [number, number]) => [12 + xy[0] * (w - 24), 12 + xy[1] * (h - 24)] as const;
  for (const d of docs) {
    const [x, y] = P(d.xy);
    ctx.fillStyle = COLORS[DISCIPLINES.indexOf(d.discipline)] ?? "#888";
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!a || a.results.kindred.length === 0) return;
  // "You are here": similarity-weighted mean of the top 8 kindred positions.
  const top = a.results.kindred.slice(0, 8);
  const wsum = top.reduce((s, m) => s + Math.max(0.01, m.rNorm), 0);
  const xy: [number, number] = [0, 1].map((k) => top.reduce((s, m) => s + docs[m.idx].xy[k] * Math.max(0.01, m.rNorm), 0) / wsum) as [number, number];
  const [x, y] = P(xy);
  ctx.strokeStyle = "currentColor"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText("you", x + 11, y + 4);
}
```

- [ ] **Step 2: Write main.ts**

```ts
import { METHODS } from "../../core/types";
import type { Sliders } from "../../core/stance";
import { loadBundle } from "./data";
import { answer, type Answer } from "./engine";
import { safeGet, safeSet } from "./storage";
import { el, esc } from "./ui/html";
import { renderItinerary } from "./ui/itinerary";
import { renderMap } from "./ui/map";
import { renderResults } from "./ui/results";
import { renderStance } from "./ui/stance";

const app = document.getElementById("app")!;
const EXAMPLES = ["Microtubules and anesthesia", "Are LLMs conscious?", "Psychedelics and the self", "Idealism vs physicalism", "Meditation and nondual awareness"];
const DAYS = [["2026-10-11", "Sun"], ["2026-10-12", "Mon"], ["2026-10-13", "Tue"], ["2026-10-14", "Wed"], ["2026-10-15", "Thu"], ["2026-10-16", "Fri"]];

app.append(el(`<div>
  <header><h1>TSC Compass</h1><p>Unofficial matcher for <a href="https://tsc2026.org/" target="_blank" rel="noopener">The Science of Consciousness 2026</a>.
  Your text never leaves this device.</p></header>
  <form id="f"><label for="q">What draws you to consciousness research?</label>
    <textarea id="q" rows="3" placeholder="A few words, or paste your own abstract"></textarea>
    <div class="chips">${EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}</div>
    <fieldset class="days"><legend>Days I'm attending</legend>${DAYS.map(([d, l]) => `<label><input type="checkbox" value="${d}" checked /> ${l}</label>`).join("")}</fieldset>
    <details><summary>Filter by method</summary>${METHODS.map((m) => `<label><input type="checkbox" name="m" value="${esc(m)}" /> ${esc(m)}</label>`).join("")}</details>
    <button type="submit" id="go">Find my people</button> <span id="status" role="status"></span>
  </form>
  <div id="stance"></div><div id="results"></div><canvas id="map" aria-label="Map of all presentations"></canvas><div id="plan"></div>
  <footer id="foot"></footer>
</div>`));

const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
const status = $("#status");
let sliders: Sliders = safeGet("sliders", {});
let pins: Record<string, string> = safeGet("pins", {});
let last: Answer | null = null;

const bundle = await loadBundle();
$("#foot").textContent = `Program data from tsc2026.org as of ${bundle.meta.dataDate}. Not affiliated with or endorsed by TSC.`;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let modelOk: boolean | null = null;
const pending = new Map<number, (v: Float32Array | null) => void>();
let nextId = 0;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "progress" && m.total) status.textContent = `Loading model ${Math.round((100 * m.loaded) / m.total)}%`;
  if (m.type === "ready") { modelOk = true; status.textContent = ""; }
  if (m.type === "vec") { pending.get(m.id)?.(m.vec); pending.delete(m.id); }
  if (m.type === "error") { modelOk = false; for (const r of pending.values()) r(null); pending.clear(); status.textContent = ""; }
};
worker.onerror = () => { modelOk = false; for (const r of pending.values()) r(null); pending.clear(); };
worker.postMessage({ type: "init", model: bundle.meta.model });
const embed = (text: string) => new Promise<Float32Array | null>((res) => {
  if (modelOk === false) return res(null);
  const id = nextId++; pending.set(id, res); worker.postMessage({ type: "embed", id, text });
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(null); } }, 60000);
});

async function run() {
  const text = $<HTMLTextAreaElement>("#q").value.trim();
  if (!text) return;
  status.textContent = modelOk ? "Matching" : "Loading model";
  const qVec = await embed(text);
  const days = new Set([...app.querySelectorAll<HTMLInputElement>(".days input:checked")].map((i) => i.value));
  const methods = [...app.querySelectorAll<HTMLInputElement>("input[name=m]:checked")].map((i) => i.value);
  last = answer(bundle, { text, qVec, sliders, days, types: null, methods, pins });
  status.textContent = "";
  renderResults($("#results"), last, bundle.docs);
  renderStance($("#stance"), sliders, last.u, (s) => { sliders = s; safeSet("sliders", s); void run(); });
  renderItinerary($("#plan"), last.plan, bundle.docs, (slot, opt) => {
    if (opt === null) delete pins[slot]; else pins[slot] = opt;
    safeSet("pins", pins); void run();
  });
  renderMap($<HTMLCanvasElement>("#map"), bundle.docs, last);
}

$("#f").addEventListener("submit", (e) => { e.preventDefault(); void run(); });
app.querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => c.addEventListener("click", () => { $<HTMLTextAreaElement>("#q").value = c.textContent!; void run(); }));
renderMap($<HTMLCanvasElement>("#map"), bundle.docs, null);
```

- [ ] **Step 3: Write style.css**

Use the `frontend-design:frontend-design` skill for the visual direction. Constraints: phone-first single column, under 720px wide, three columns above 1024px; light and dark via `prefers-color-scheme`; `prefers-reduced-motion` respected; tap targets of 44px or more; map canvas `width: 100%; height: 320px`.

- [ ] **Step 4: Write Playwright config and e2e tests**

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", timeout: 120000,
  webServer: { command: "npm run build && npx vite preview dist --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 180000 },
  use: { baseURL: "http://localhost:4173" },
});
```

`e2e/app.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("query returns kindred matches and an itinerary", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules and anesthesia");
  await page.click("#go");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".itinerary .slot").first()).toBeVisible();
  await expect(page.getByTestId("lexical-banner")).toHaveCount(0);
});

test("no requests leave the origin", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("http://localhost:4173")) foreign.push(r.url()); });
  await page.goto("/");
  await page.fill("#q", "dreams");
  await page.click("#go");
  await expect(page.locator('[data-testid="match"]').first()).toBeVisible({ timeout: 90000 });
  expect(foreign).toEqual([]);
});

test("model failure falls back to lexical with a banner (Review Focus 4)", async ({ page }) => {
  await page.route("**/models/**", (r) => r.abort());
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.getByTestId("lexical-banner")).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible();
});

test("gibberish shows the weak-match banner (Review Focus 3)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "zxqv blorp frindle");
  await page.click("#go");
  await expect(page.getByTestId("weak-banner")).toBeVisible({ timeout: 90000 });
});
```

- [ ] **Step 5: Run e2e**

Run: `npx playwright install chromium && npm run e2e`. Expected: 4 passed. If the weak-banner test fails because `weakDense` is too low for the chosen model, measure max dense similarity for 5 gibberish strings and 5 real queries in Node, set `rank.weakDense` in `config/compass.json` midway between them, re-export, and note the values in `eval/report.md`.

- [ ] **Step 6: Manual check on a phone-sized viewport, then commit**

Run: `npm run dev`. Open the site with devtools at 390x844 and confirm the layout, the stance panel, pins persisting across reloads, the .ics download, and the map.
```bash
git add web e2e playwright.config.ts && git commit -m "feat(web): matcher UI, stance panel, itinerary, map"
```

---

### Task 19: Node versus browser parity

**Files:**
- Create: `e2e/parity.spec.ts`, `eval/parity-fixture.ts`
- Output: `e2e/parity.fixture.json`

**Interfaces:**
- Consumes: `answer` (Task 17) via a Node replica of `loadBundle` reading `web/public/data`; `nodeEmbedder`, `embedQuery` (Task 6).
- Produces: `e2e/parity.fixture.json` = `{ query: string; kindred: string[] }[]`.

- [ ] **Step 1: Write the fixture generator**

`eval/parity-fixture.ts`:
```ts
import { readFileSync } from "node:fs";
import type { Bm25Index } from "../core/lexical";
import { embedQuery } from "../core/embedtext";
import { MODELS } from "../core/models";
import type { Bundle } from "../web/src/data";
import { answer } from "../web/src/engine";
import { nodeEmbedder } from "../pipeline/embedder";
import { readF32, readJson, writeJson } from "../pipeline/io";

const D = "web/public/data/";
const meta = readJson<Bundle["meta"]>(D + "meta.json");
const docs = readJson<Bundle["docs"]>(D + "docs.json");
const bundle: Bundle = {
  docs, meta, axes: readJson(D + "axes.json"), slots: readJson(D + "slots.json"), conceptVec: () => undefined,
  corpus: { ids: docs.map((d) => d.id), dim: meta.dim, vectors: readF32(D + "vectors.f32"), lex: JSON.parse(readFileSync(D + "lex.json", "utf8")) as Bm25Index },
};
const spec = MODELS.find((m) => m.id === meta.model)!;
const embed = await nodeEmbedder(spec);
const queries = ["microtubules and anesthesia", "Are LLMs conscious?", "psychedelics and the self", "idealism", "near-death experiences"];
const out = [];
for (const query of queries) {
  const qVec = await embedQuery(embed, query, spec);
  const a = answer(bundle, { text: query, qVec, sliders: {}, days: null, types: null, methods: [], pins: {} });
  out.push({ query, kindred: a.results.kindred.map((m) => m.id) });
}
writeJson("e2e/parity.fixture.json", out);
console.log("fixture written");
```

Run: `npx tsx eval/parity-fixture.ts`. Expected: `fixture written`.

- [ ] **Step 2: Write the parity spec**

`e2e/parity.spec.ts`:
```ts
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = JSON.parse(readFileSync("e2e/parity.fixture.json", "utf8")) as { query: string; kindred: string[] }[];

for (const f of fixture) {
  test(`browser matches node for "${f.query}"`, async ({ page }) => {
    await page.goto("/");
    await page.fill("#q", f.query);
    await page.click("#go");
    const cards = page.locator('[data-list="kindred"]');
    await expect(cards.first()).toBeVisible({ timeout: 90000 });
    const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
    // WASM vs native ONNX can differ in the last float bits: require the same top 3 and 6 of 8 overlap.
    expect(ids.slice(0, 3)).toEqual(f.kindred.slice(0, 3));
    expect(ids.filter((id) => f.kindred.includes(id!)).length).toBeGreaterThanOrEqual(6);
  });
}
```

Note: the fixture is generated with `days: null`. The browser defaults to every day checked, which is equivalent, because every record's day falls within Oct 11 to 16.

- [ ] **Step 3: Run and commit**

Run: `npm run e2e`. Expected: all parity tests pass. If one fails on the top-3 order only, print both score lists. A gap under 1e-4 is a float tie: relax that query to set equality on the top 3 and document why in the test. A larger gap is a real bug: stop and investigate (for example, a query prefix or pooling mismatch between `worker.ts` and `embedder.ts`).
```bash
git add e2e eval/parity-fixture.ts && git commit -m "test: node versus browser ranking parity"
```

---

### Task 20: Launch prep (about page, organizer note, deploy, Discord post)

**Files:**
- Create: `web/about.html`, `docs/launch/organizer-note.md`, `docs/launch/discord-post.md`
- Modify: `web/index.html` (footer link to about), `README.md`

**Interfaces:**
- Consumes: `eval/report.md` (Task 14), `meta.json` (Task 16).
- Produces: a deployed URL.

- [ ] **Step 1: Write the about page**

`web/about.html` must state:
- the site is unofficial and not affiliated with TSC;
- the data source and date;
- how matching works in plain language, linking the evaluation summary (a copy of the headline numbers from `eval/report.md`);
- that the one-line summaries, stance leanings and questions are AI-drafted and are leanings, not verdicts;
- that queries never leave the device;
- a contact for corrections or removal (ask Tim which address to publish).

No em dashes or en dashes.

- [ ] **Step 2: Draft the organizer note and Discord post for Tim**

Write `docs/launch/organizer-note.md` (short and courteous: what the tool is, that it links to official abstracts and doesn't republish them, an offer to take changes or remove it) and `docs/launch/discord-post.md` (2 to 4 sentences, plus the link, plus a "feedback welcome, and come hack on v1 with us at the hackathon" line). Tim sends both personally. Don't send anything on Tim's behalf.

- [ ] **Step 3: Choose a host with Tim, then deploy**

Ask Tim (spec section 10, question 1) which target to use. Commands for each:
- Cloudflare Pages: `npm run build && npx wrangler pages deploy dist --project-name tsc-compass`
- A timbeach.com subdomain: build, then follow that site's existing deploy process (the `publish-article` skill documents how timbeach.com is hosted).
- GitHub Pages: needs the repo public or a paid plan, so it conflicts with "private for now". Only use it if Tim makes the repo public.

Expected: the URL loads on a phone over cellular, the first query works, and the model loads from the same origin.

- [ ] **Step 4: Final verification and push**

Run: `npm test && npm run typecheck && npm run e2e`. Expected: all green. Then:
```bash
git add -A && git commit -m "docs: about page and launch drafts"
git pull --rebase && git push && git status
```
Expected: `git status` shows the branch is up to date with origin.

---

## Self-Review Notes

- Spec coverage: §2 data and etiquette (Tasks 3, 4, 16, 20), §3 architecture (all), §4 enrichment and label gate (Tasks 12, 13, 14), §5.2 retrieval (Tasks 6, 7), §5.3 user stance and map position (Tasks 8, 18), §5.4 distance (Task 8), §5.5 lists (Task 9), §5.6 explanations (Task 10), §6 itinerary (Task 11, UI in Task 18), §7 evaluation E1 to E4 and baselines (Task 14; E4 is the manual list review during Task 18 Step 6 and the Task 15 review), tests and parity (Tasks 2 to 19), §8 web app and privacy (Tasks 17, 18), §9 timeline (task order), §10 open questions (Task 1 private repo, Task 20 host and contact), §11 risks (Tasks 12, 16, 17, 18).
- E4 (human review of opponent and serendipity picks for 10 personas) happens in Task 18 Step 6: run the 10 even-index personas in the UI, mark each pick as sensible, weak or wrong in `eval/e4.md`, and tune `beta`, `oppFloor` or `serendipityQuantile` in `config/compass.json` if fewer than 70% are sensible.
- Type names are consistent across tasks: `RawRecord`, `Doc`, `Slot`, `AxisModel`, `Corpus`, `RetrievalConfig`, `RankConfig`, `Results`, `Match`, `PlanItem`, `Bundle`, `Query`, `Answer`, `CompassConfig`.
