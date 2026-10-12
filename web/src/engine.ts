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
