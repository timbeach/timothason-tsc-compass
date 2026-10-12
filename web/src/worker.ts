import { env, pipeline } from "@huggingface/transformers";
import { embedQuery } from "../../core/embedtext";
import { MODELS } from "../../core/models";

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

function init(modelId: string) {
  const spec = MODELS.find((m) => m.id === modelId)!;
  return (async () => {
    // No progress_callback: with one, transformers.js GETs every file in full just to learn its size,
    // which downloads the 16 MB model twice.
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
  const msg = e.data as { type: "init"; model: string } | { type: "embed"; id: number; text: string };
  try {
    if (msg.type === "init") { ready = init(msg.model); await ready; return; }
    if (!ready) throw new Error("not initialised");
    const vec = await (await ready)(msg.text);
    postMessage({ type: "vec", id: msg.id, vec }, [vec.buffer]);
  } catch (err) {
    postMessage(msg.type === "init"
      ? { type: "error", phase: "init", message: String(err) }
      : { type: "error", phase: "embed", id: msg.id, message: String(err) });
  }
};
