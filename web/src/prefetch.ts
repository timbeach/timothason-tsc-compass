/** Downloads the model files once on the page, counting bytes for a progress bar.
 * The worker then loads the same URLs from the browser's HTTP cache. (transformers.js's own
 * progress_callback would GET every file twice.) Never throws: on failure the worker just downloads. */
export async function prefetch(files: { path: string; bytes: number }[], onProgress: (fraction: number) => void): Promise<void> {
  const total = files.reduce((s, f) => s + f.bytes, 0) || 1;
  let read = 0;
  const report = () => onProgress(Math.min(1, read / total));
  try {
    for (const f of files) {
      const res = await fetch(f.path);
      if (!res.ok || !res.body) { read += f.bytes; report(); continue; }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.byteLength;
        report();
      }
    }
  } catch {
    /* offline or blocked: fall through, the worker will try on its own */
  }
  onProgress(1);
}
