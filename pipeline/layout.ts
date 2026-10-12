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
