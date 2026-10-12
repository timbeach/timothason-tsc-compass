import type { Axis, AxisScores, Doc } from "./types";
import { stanceDistance } from "./stance";
import { rankOrder } from "./retrieval";
import { dot, quantile, row } from "./vec";

export interface RankConfig {
  candidates: number; tauRank: number; beta: number; mmrLambda: number; nKindred: number;
  nOpponents: number; oppFloor: number; serendipityQuantile: number; weakDense: number;
  /** Stricter bar when no query word appears in the program (often a non-English query on an English model). */
  weakDenseNoKeyword?: number;
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
  /** Keyword scores; a query with keyword hits is never "weak" even when dense similarity is low. */
  lex?: Float64Array;
}

export function rankAll(inp: RankInput, cfg: RankConfig = DEFAULT_RANK): Results {
  const { docs, vectors, dim, r, dense, u } = inp;
  const allowed = docs.map((d, i) => (!inp.allow || inp.allow(d) ? i : -1)).filter((i) => i >= 0);
  const docScores = new Float64Array(docs.length).fill(-Infinity);
  if (allowed.length === 0) return { kindred: [], opponents: [], serendipity: null, weak: true, docScores };

  const allowedSet = new Set(allowed);
  // Lexical-only scores of 0 mean "no match": never let them fill a list.
  const order = rankOrder(r).filter((i) => allowedSet.has(i) && (dense !== null || r[i] > 0));
  const noSignal = order.length === 0 || (dense !== null && order.length > 1 && r[order[0]] === r[order[order.length - 1]]);
  if (noSignal) return { kindred: [], opponents: [], serendipity: null, weak: true, docScores };
  const R = order.slice(0, cfg.candidates);
  const rmax = r[R[0]], rmin = r[R[R.length - 1]];
  const norm = (i: number) => (rmax === rmin ? 1 : Math.max(0, Math.min(1, (r[i] - rmin) / (rmax - rmin))));
  const tau = r[R[Math.min(cfg.tauRank, R.length) - 1]];

  const match = (i: number, score: number, eligible?: (a: Axis) => boolean): Match => {
    const { s, shared } = stanceDistance(u, docs[i].axes, eligible);
    return { idx: i, id: docs[i].id, r: r[i], rNorm: norm(i), s, shared, score };
  };
  const kScore = (i: number) => norm(i) - cfg.beta * (stanceDistance(u, docs[i].axes).s ?? 0.5);
  // Only candidates get a score: outside the top-R everything ties, and a tie is not a recommendation.
  for (const i of R) docScores[i] = kScore(i);

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

  const keywordHit = inp.lex ? allowed.some((i) => inp.lex![i] > 0) : false;
  const weak = dense
    ? !keywordHit && Math.max(...allowed.map((i) => dense[i])) < (inp.lex ? (cfg.weakDenseNoKeyword ?? cfg.weakDense) : cfg.weakDense)
    : Math.max(...allowed.map((i) => r[i])) <= 0;

  return { kindred, opponents, serendipity, weak, docScores };
}
