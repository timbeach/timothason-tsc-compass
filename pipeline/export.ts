import { cpSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { buildBm25, hashIndex } from "../core/lexical";
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

/** Keyword index text: title and abstract, plus presenter name and concepts so people can search by speaker. */
export function lexText(r: RawRecord, e: Enrichment): string {
  return `${docText(r)} ${r.name} ${e.concepts.join(" ")}`;
}

/** Fail loudly when build artifacts don't match the current records (stale after a re-scrape). */
export function assertFresh(nRecs: number, dim: number, nVectorFloats: number, nLayout: number): void {
  if (nVectorFloats !== nRecs * dim) throw new Error(`embeddings are stale (${nVectorFloats / dim} rows for ${nRecs} records): re-run npm run embed`);
  if (nLayout !== nRecs) throw new Error(`layout is stale (${nLayout} points for ${nRecs} records): re-run npm run layout`);
}

export function findLeaks(publicJson: string[], recs: RawRecord[]): string[] {
  const hay = publicJson.join("\n").toLowerCase();
  return recs.filter((r) => {
    const w = r.abstract.toLowerCase().split(/\s+/);
    const unquote = (x: string) => x.replace(/["\u201c\u201d]/g, "");
    const title = unquote(r.title.toLowerCase().split(/\s+/).join(" ")); // titles are public; abstracts often repeat them
    for (let i = 0; i + 8 <= w.length; i++) {
      const run = w.slice(i, i + 8).join(" ");
      if (!title.includes(unquote(run)) && hay.includes(run)) return true;
    }
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
  const vectors = readF32(`data/build/emb/${tag}.f32`);
  assertFresh(recs.length, spec.dim, vectors.length, layout.length);
  const docs = recs.map((r, i) => toDoc(r, enr.get(r.id)!, layout[i]));
  const out = "web/public/data";
  mkdirSync(out, { recursive: true });
  writeJson(`${out}/docs.json`, docs);
  writeF32(`${out}/vectors.f32`, vectors);
  writeJson(`${out}/lex.json`, hashIndex(buildBm25(recs.map((r) => lexText(r, enr.get(r.id)!)))));
  writeJson(`${out}/axes.json`, readJson(`data/build/axes.${tag}.json`));
  writeJson(`${out}/slots.json`, readJson<Slot[]>("data/build/slots.json"));
  const concepts = docs.flatMap((d) => d.concepts.map((concept) => ({ docId: d.id, concept })));
  const embed = await nodeEmbedder(spec);
  const cv = await embed(concepts.map((c) => c.concept));
  const flat = new Float32Array(cv.length * spec.dim);
  cv.forEach((v, i) => flat.set(v, i * spec.dim));
  writeJson(`${out}/concepts.json`, concepts);
  writeF32(`${out}/conceptvecs.f32`, flat);
  const ortWasm = "ort-wasm-simd-threaded.asyncify.wasm";
  const modelFiles = [
    { path: `models/${spec.id}/onnx/model_quantized.onnx`, bytes: statSync(`.hfcache/${spec.id}/onnx/model_quantized.onnx`).size },
    { path: `ort/${ortWasm}`, bytes: statSync(`node_modules/onnxruntime-web/dist/${ortWasm}`).size },
  ];
  writeJson(`${out}/meta.json`, { dataDate: new Date().toISOString().slice(0, 10), model: spec.id, dim: spec.dim, chunking: cfg.chunking, config: cfg, modelFiles });
  cpSync(`.hfcache/${spec.id}`, `web/public/models/${spec.id}`, { recursive: true });
  mkdirSync("web/public/ort", { recursive: true });
  for (const f of ["ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.mjs"])
    cpSync(`node_modules/onnxruntime-web/dist/${f}`, `web/public/ort/${f}`);

  const leaks = findLeaks(["docs.json", "concepts.json", "meta.json"].map((f) => readFileSync(`${out}/${f}`, "utf8")), recs);
  if (leaks.length) throw new Error(`abstract text leaked into public bundle for: ${leaks.join(", ")}`);
  console.log(`exported ${docs.length} docs, ${concepts.length} concepts, model ${spec.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
