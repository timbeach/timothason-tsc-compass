const STOP = new Set(("a an and are as at be been but by can do does for from has have how in into is it its " +
  "of on or our than that the their them then there these they this those to was we were what when where which " +
  "while who will with within without would you your not no nor also may might such via between both each more most " +
  "other some any all over under about after before during here").split(" "));

export function stem(w: string): string {
  if (w.length <= 3) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length > 6) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 5) s = s.slice(0, -2);
  return s;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t)).map(stem);
}

export interface Bm25Index { N: number; avgdl: number; df: Record<string, number>; docs: { len: number; tf: Record<string, number> }[] }

export function buildBm25(texts: string[]): Bm25Index {
  const df: Record<string, number> = {};
  const docs = texts.map((t) => {
    const toks = tokenize(t);
    const tf: Record<string, number> = {};
    for (const k of toks) tf[k] = (tf[k] ?? 0) + 1;
    for (const k of Object.keys(tf)) df[k] = (df[k] ?? 0) + 1;
    return { len: toks.length, tf };
  });
  const avgdl = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { N: docs.length, avgdl, df, docs };
}

export function bm25Scores(ix: Bm25Index, query: string, k1 = 1.2, b = 0.75): Float64Array {
  const out = new Float64Array(ix.N);
  const terms = [...new Set(tokenize(query))];
  for (const t of terms) {
    const df = ix.df[t];
    if (!df) continue;
    const idf = Math.log(1 + (ix.N - df + 0.5) / (df + 0.5));
    ix.docs.forEach((d, i) => {
      const f = d.tf[t];
      if (!f) return;
      out[i] += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avgdl));
    });
  }
  return out;
}
