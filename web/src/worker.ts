import { env, pipeline } from "@huggingface/transformers";
import { embedQuery } from "../../core/embedtext";
import { MODELS } from "../../core/models";
import { prefetch } from "./prefetch";

env.allowRemoteModels = false;
env.allowLocalModels = true;
// Relative on purpose: transformers.js skips its local-file check for http(s) URLs, then finds no tokenizer.
// Resolved against this worker's URL, so it also works when the site lives under a subpath.
env.localModelPath = "../models/";
// Self-hosted ONNX runtime: without this, transformers.js fetches it from a public CDN.
env.backends.onnx.wasm!.wasmPaths = new URL("../ort/", self.location.href).href;
// One thread: threaded reductions sum in varying order, which can flip near-tied rankings between runs.
env.backends.onnx.wasm!.numThreads = 1;

let ready: Promise<(text: string) => Promise<Float32Array>> | null = null;

type FileInfo = { path: string; bytes: number };
const siteUrl = (path: string) => new URL(`../${path}`, self.location.href).href;

/** Download the big files once with progress (or take them from the browser's model cache on return
 * visits), then serve them to transformers.js (custom cache) and onnxruntime (wasmBinary). */
async function preload(files: FileInfo[]) {
  let browserCache: Cache | null = null;
  try { browserCache = await caches.open("transformers-cache"); } catch { /* private mode can refuse */ }
  const bytes = new Map<string, Uint8Array>();
  // Return visits: take what's already in the browser's model cache.
  for (const f of files) {
    const hit = await browserCache?.match(siteUrl(f.path)).catch(() => undefined);
    if (hit) bytes.set(f.path, new Uint8Array(await hit.arrayBuffer()));
  }
  const todo = files.filter((f) => !bytes.has(f.path));
  const fetched = await prefetch(todo.map((f) => ({ path: siteUrl(f.path), bytes: f.bytes })), (fraction) => postMessage({ type: "progress", fraction }));
  for (const f of todo) {
    const b = fetched.get(siteUrl(f.path));
    if (!b) continue;
    bytes.set(f.path, b);
    // transformers.js won't cache bytes it didn't fetch itself, so store them for the next visit.
    await browserCache?.put(siteUrl(f.path), new Response(b.buffer as ArrayBuffer)).catch(() => { /* quota: fine */ });
  }
  const wasm = files.find((f) => f.path.endsWith(".wasm"));
  if (wasm && bytes.has(wasm.path)) env.backends.onnx.wasm!.wasmBinary = bytes.get(wasm.path)!;
  env.useCustomCache = true;
  env.customCache = {
    async match(key: RequestInfo | URL) {
      const k = typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
      for (const [path, b] of bytes) if (k.endsWith(path)) return new Response(b.buffer as ArrayBuffer);
      return (await browserCache?.match(k)) ?? undefined;
    },
    async put(key: RequestInfo | URL, res: Response) { await browserCache?.put(key, res); },
  } as unknown as typeof env.customCache;
}

function init(modelId: string, files: FileInfo[]) {
  const spec = MODELS.find((m) => m.id === modelId)!;
  return (async () => {
    if (files.length) await preload(files);
    // No progress_callback: with one, transformers.js GETs every file in full just to learn its size.
    const ex = await pipeline("feature-extraction", modelId, { dtype: "q8" });
    const embed = async (texts: string[]) => {
      const t = await ex(texts, { pooling: spec.pooling, normalize: true });
      const [n, d] = t.dims as [number, number];
      const data = t.data as Float32Array;
      return Array.from({ length: n }, (_, i) => data.slice(i * d, (i + 1) * d));
    };
    postMessage({ type: "ready" });
    return (text: string) => embedQuery(embed, text, spec);
  })();
}

onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "init"; model: string; files?: FileInfo[] } | { type: "embed"; id: number; text: string };
  try {
    if (msg.type === "init") { ready = init(msg.model, msg.files ?? []); await ready; return; }
    if (!ready) throw new Error("not initialised");
    const vec = await (await ready)(msg.text);
    postMessage({ type: "vec", id: msg.id, vec }, [vec.buffer]);
  } catch (err) {
    postMessage(msg.type === "init"
      ? { type: "error", phase: "init", message: String(err) }
      : { type: "error", phase: "embed", id: msg.id, message: String(err) });
  }
};
