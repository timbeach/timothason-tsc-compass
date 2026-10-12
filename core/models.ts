export interface ModelSpec { key: string; id: string; dim: number; pooling: "mean" | "cls"; queryPrefix: string }

export const MODELS: ModelSpec[] = [
  { key: "minilm", id: "Xenova/all-MiniLM-L6-v2", dim: 384, pooling: "mean", queryPrefix: "" },
  { key: "bge-small", id: "Xenova/bge-small-en-v1.5", dim: 384, pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: " },
  { key: "gte-small", id: "Xenova/gte-small", dim: 384, pooling: "mean", queryPrefix: "" },
];

export function modelByKey(key: string): ModelSpec {
  const m = MODELS.find((x) => x.key === key);
  if (!m) throw new Error(`unknown model ${key}`);
  return m;
}
