import { AXES, type Axis, type AxisScores } from "./types";
import { mulberry32, shuffle } from "./random";
import { dot } from "./vec";

export const CV_MIN = 0.5;
export const HUMAN_MIN = 0.6;

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number { return pearson(ranks(a), ranks(b)); }

export function choleskySolve(A: Float64Array, n: number, b: Float64Array): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (s <= 0) throw new Error("matrix not positive definite"); L[i * n + i] = Math.sqrt(s); }
      else L[i * n + j] = s / L[j * n + j];
    }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

export function fitRidge(X: Float32Array[], y: number[], lambda: number): { w: Float64Array; b: number } {
  const n = X.length, d = X[0].length;
  const mx = new Float64Array(d);
  for (const x of X) for (let j = 0; j < d; j++) mx[j] += x[j] / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  const A = new Float64Array(d * d), rhs = new Float64Array(d), xc = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) xc[j] = X[i][j] - mx[j];
    const yc = y[i] - my;
    for (let j = 0; j < d; j++) {
      rhs[j] += xc[j] * yc;
      for (let k = 0; k <= j; k++) A[j * d + k] += xc[j] * xc[k];
    }
  }
  for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[k * d + j] = A[j * d + k]; A[j * d + j] += lambda; }
  const w = choleskySolve(A, d, rhs);
  return { w, b: my - dot(mx, w) };
}

export function cvRidge(X: Float32Array[], y: number[], lambdas: number[], folds = 5, seed = 7) {
  const order = shuffle(X.map((_, i) => i), mulberry32(seed));
  const fold = new Array<number>(X.length);
  order.forEach((idx, k) => { fold[idx] = k % folds; });
  let best = { lambda: lambdas[0], spearman: -Infinity, r2: -Infinity };
  for (const lambda of lambdas) {
    const pred = new Array<number>(X.length);
    for (let f = 0; f < folds; f++) {
      const tr = X.map((_, i) => i).filter((i) => fold[i] !== f);
      const m = fitRidge(tr.map((i) => X[i]), tr.map((i) => y[i]), lambda);
      X.forEach((x, i) => { if (fold[i] === f) pred[i] = dot(x, m.w) + m.b; });
    }
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const ssRes = y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0);
    const res = { lambda, spearman: spearman(y, pred), r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
    if (res.spearman > best.spearman) best = res;
  }
  return best;
}

export interface AxisModel {
  axis: Axis; w: number[]; b: number; lambda: number; n: number;
  cvSpearman: number; cvR2: number; humanSpearman: number | null; auto: boolean;
}
export type Sliders = Partial<Record<Axis, number | null>>;

const clamp = (v: number) => Math.max(-2, Math.min(2, v));

export function projectStance(models: AxisModel[], q: Float32Array, sliders: Sliders): AxisScores {
  const out = {} as AxisScores;
  for (const a of AXES) {
    if (a in sliders) { out[a] = sliders[a] ?? null; continue; }
    const m = models.find((x) => x.axis === a);
    out[a] = m && m.auto ? clamp(dot(q, m.w) + m.b) : null;
  }
  return out;
}

export function stanceDistance(u: AxisScores, d: AxisScores, eligible: (a: Axis) => boolean = () => true) {
  const shared = AXES.filter((a) => eligible(a) && u[a] !== null && d[a] !== null);
  if (shared.length === 0) return { s: null as number | null, shared };
  const sq = shared.reduce((s, a) => s + ((u[a] as number) - (d[a] as number)) ** 2, 0);
  return { s: Math.sqrt(sq / shared.length) / 4, shared };
}
