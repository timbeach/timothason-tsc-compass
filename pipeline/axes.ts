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
