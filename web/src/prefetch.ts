/** Downloads the model files once, counting bytes for a progress bar, and returns the bytes keyed by path.
 * The worker hands these bytes to transformers.js and onnxruntime directly, so nothing is fetched twice
 * (relying on the HTTP cache fails in private windows, whose in-memory cache won't hold a 16 MB file).
 * Never throws: a file that fails is simply absent, and the libraries fetch it themselves. */
export async function prefetch(
  files: { path: string; bytes: number }[],
  onProgress: (fraction: number) => void,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const total = files.reduce((s, f) => s + f.bytes, 0) || 1;
  let read = 0;
  const report = () => onProgress(Math.min(1, read / total));
  for (const f of files) {
    try {
      const res = await fetch(f.path);
      if (!res.ok || !res.body) { read += f.bytes; report(); continue; }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); size += value.byteLength; read += value.byteLength;
        report();
      }
      const all = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.byteLength; }
      out.set(f.path, all);
    } catch {
      read += f.bytes; report(); // offline or blocked: the library will try on its own
    }
  }
  onProgress(1);
  return out;
}
