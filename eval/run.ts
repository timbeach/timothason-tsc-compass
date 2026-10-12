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
import { formatCI, mean, ndcgAtK } from "./metrics";
import { writeFileSync, existsSync } from "node:fs";

const RETRIEVALS: RetrievalConfig[] = [
  { mode: "lexical", alpha: 0, rrfK: 60 },
  { mode: "dense", alpha: 1, rrfK: 60 },
  ...[0.5, 0.7, 0.85].map((alpha) => ({ mode: "hybrid" as const, alpha, rrfK: 60 })),
  { mode: "rrf", alpha: 0, rrfK: 60 },
];
const POOL_DEPTH = 10; // top-k per config that enters the blind labeling pool

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
          ranked.slice(0, POOL_DEPTH).forEach((id) => pools[p.id].add(id));
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
    "E1 (session recovery) is a document-to-document proxy: each concurrent talk's stored vector and text are the query, and its organizer session-mates are the relevant set. Sessions are also shaped by logistics, so E1 compares configs and is not an absolute quality claim. E2 (personas) runs the real query path. The E2 label pool is the union of each config's top " + POOL_DEPTH + " plus 10 random documents, labeled blind.", "",
    "| config | E1 MRR (95% CI) | E2 nDCG@10 tune | E2 nDCG@10 test |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r === best ? "**" + r.name + "**" : r.name} | ${formatCI(r.e1)} | ${formatCI(r.e2tune)} | ${formatCI(r.e2test)} |`),
    "", `Selected: **${best.name}** (by E1 + E2 tune; E2 test is reported, never used for selection).`,
  ].join("\n");
  writeFileSync("eval/report.md", md + "\n");
  if (process.argv.includes("--select"))
    writeJson("config/compass.json", { model: best.model, chunking: best.chunking, retrieval: best.retrieval, rank: DEFAULT_RANK, theta: 0.6 });
  console.log(`report written; best = ${best.name}`);
}

await main();
