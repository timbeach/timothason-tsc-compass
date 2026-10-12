export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function l2normalize(v: Float32Array): Float32Array {
  const n = Math.sqrt(dot(v, v));
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function meanVec(vs: Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

export function row(m: Float32Array, dim: number, i: number): Float32Array {
  return m.subarray(i * dim, (i + 1) * dim);
}

export function zscore(xs: ArrayLike<number>): Float64Array {
  const n = xs.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += xs[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (xs[i] - mean) ** 2;
  const sd = Math.sqrt(v / n);
  const out = new Float64Array(n);
  if (sd === 0) return out;
  for (let i = 0; i < n; i++) out[i] = (xs[i] - mean) / sd;
  return out;
}

export function quantile(xs: number[], q: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
