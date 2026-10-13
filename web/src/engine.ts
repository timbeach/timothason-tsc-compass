import { explain } from "../../core/explain";
import { buildItinerary, type PlanItem } from "../../core/itinerary";
import { rankAll, type Results } from "../../core/rank";
import { denseScores, relevanceMulti, type Topic } from "../../core/retrieval";
import { projectStance, type Sliders } from "../../core/stance";
import { affinity, goalPreset, streamedDocIds, type DisciplinePrefs, type Goal } from "../../core/survey";
import type { AxisScores } from "../../core/types";
import { l2normalize, meanVec } from "../../core/vec";
import type { Bundle } from "./data";

export interface Query {
  text: string; qVec: Float32Array | null; sliders: Sliders; days: Set<string> | null;
  types: Set<string> | null; methods: string[]; pins: Record<string, string>;
  /** Survey answers. `topics` (when given) replaces text/qVec: up to three interests scored separately. */
  topics?: Topic[]; goal?: Goal; disciplines?: DisciplinePrefs; zoomOnly?: boolean; posterN?: number; vary?: boolean;
}
/** opponentsAvailable: at least one stance axis passed validation, so "worthy opponents" can appear at all. */
export interface Answer { results: Results; reasons: Map<string, string[]>; plan: PlanItem[]; u: AxisScores; lexicalOnly: boolean; opponentsAvailable: boolean }

export function answer(b: Bundle, q: Query): Answer {
  const cfg = b.meta.config;
  const topics = (q.topics ?? [{ text: q.text, qVec: q.qVec }]).filter((t) => t.text.trim());
  const vecs = topics.map((t) => t.qVec).filter((v): v is Float32Array => v !== null);
  // Stance is read from the interests as a whole: the normalised mean of the topic vectors.
  const qVec = vecs.length === 0 ? null : vecs.length === 1 ? vecs[0] : l2normalize(meanVec(vecs));
  const qText = topics.map((t) => t.text).join(" ");
  const { r, dense, lex } = relevanceMulti(b.corpus, topics, cfg.retrieval);
  const u = qVec ? projectStance(b.axes, qVec, q.sliders) : projectStance([], new Float32Array(0), q.sliders);
  const autoOk = new Set(b.axes.filter((m) => m.auto).map((m) => m.axis));
  const curious = new Set(q.disciplines?.curious ?? []);
  const streamed = q.zoomOnly ? streamedDocIds(b.slots) : null;
  const rank = goalPreset(q.goal, { ...cfg.rank, affinityWeight: q.disciplines ? (cfg.rank.affinityWeight ?? 0.15) : 0 });
  const results = rankAll({
    docs: b.docs, vectors: b.corpus.vectors, dim: b.corpus.dim, r, dense, u, lex,
    oppAxes: (a) => autoOk.has(a),
    affinity: (d) => affinity(q.disciplines, d),
    prefer: curious.size ? (d) => curious.has(d.discipline) : undefined,
    allow: (d) => (!q.types || d.types.some((t) => q.types!.has(t))) && (!q.days || !d.day || q.days.has(d.day)) &&
      (q.methods.length === 0 || q.methods.some((m) => (d.methods as string[]).includes(m))) &&
      (!streamed || streamed.has(d.id)),
  }, rank);
  // Each match is explained against the topic it matched best, so "shared interest" names the right one.
  const perTopicDense = vecs.length > 1 ? topics.map((t) => (t.qVec ? denseScores(b.corpus, t.qVec) : null)) : null;
  const bestTopic = (idx: number): Topic => {
    if (!perTopicDense) return { text: qText, qVec };
    let best = 0, bestV = -Infinity;
    perTopicDense.forEach((d, k) => { if (d && d[idx] > bestV) { bestV = d[idx]; best = k; } });
    return topics[best];
  };
  const reasons = new Map<string, string[]>();
  for (const m of [...results.kindred, ...results.opponents, ...results.serendipity]) {
    const t = bestTopic(m.idx);
    reasons.set(m.id, explain({ doc: b.docs[m.idx], u, shared: m.shared, qText: t.text, qVec: t.qVec, conceptVec: b.conceptVec, theta: cfg.theta, methods: q.methods }));
  }
  const idx = new Map(b.docs.map((d, i) => [d.id, i]));
  const plan = buildItinerary(b.slots, (id) => results.docScores[idx.get(id) ?? -1] ?? -Infinity, {
    days: q.days, pins: q.pins, posterN: q.posterN ?? 10,
    allowOption: q.zoomOnly ? (o) => !!o.streamed : undefined,
    vary: q.vary ? { disciplineOf: (id) => { const i = idx.get(id); return i === undefined ? undefined : b.docs[i].discipline; } } : undefined,
  });
  return { results, reasons, plan, u, lexicalOnly: qVec === null, opponentsAvailable: autoOk.size > 0 };
}
