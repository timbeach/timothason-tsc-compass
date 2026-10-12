import { env, pipeline } from "@huggingface/transformers";
import type { EmbedFn } from "../core/embedtext";
import type { ModelSpec } from "../core/models";

env.cacheDir = ".hfcache";
const BATCH = 16;

export async function nodeEmbedder(spec: ModelSpec): Promise<EmbedFn> {
  const ex = await pipeline("feature-extraction", spec.id, { dtype: "q8" });
  return async (texts) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const t = await ex(texts.slice(i, i + BATCH), { pooling: spec.pooling, normalize: true });
      const [n, d] = t.dims as [number, number];
      const data = t.data as Float32Array;
      for (let j = 0; j < n; j++) out.push(data.slice(j * d, (j + 1) * d));
    }
    return out;
  };
}
