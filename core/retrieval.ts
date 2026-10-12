import { bm25Scores, tokenize, type Bm25Index } from "./lexical";
import { dot, row, zscore } from "./vec";

export type RetrievalMode = "dense" | "lexical" | "hybrid" | "rrf";
/** shortQueryAlpha: dense weight for queries of at most shortQueryTokens content tokens.
 * A one-word query gives a flat, noisy dense vector that z-scoring would stretch over exact keyword hits. */
export interface RetrievalConfig { mode: RetrievalMode; alpha: number; rrfK: number; shortQueryAlpha?: number; shortQueryTokens?: number }
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
      const short = cfg.shortQueryAlpha !== undefined && tokenize(qText).length <= (cfg.shortQueryTokens ?? 2);
      const alpha = short ? cfg.shortQueryAlpha! : cfg.alpha;
      const zd = zscore(dense), zl = zscore(lex);
      r = new Float64Array(dense.length);
      for (let i = 0; i < r.length; i++) r[i] = alpha * zd[i] + (1 - alpha) * zl[i];
      break;
    }
  }
  return { r, dense, lex };
}
