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
