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

/** "mean [lo, hi]" with a bootstrap 95% CI, or "n/a" when there is nothing to summarize. */
export function formatCI(values: number[]): string {
  if (values.length === 0) return "n/a";
  const [lo, hi] = bootstrapCI(values);
  return `${mean(values).toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
}
