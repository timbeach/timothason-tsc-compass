import type { ModelSpec } from "./models";
import { l2normalize, meanVec } from "./vec";

export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;
export type Chunking = "truncate" | "chunk";

// Short queries get the model's query instruction (BGE recommends it for short query-to-passage retrieval).
// Longer text, like a pasted abstract, is itself a passage, so it is embedded like a document (no instruction).
const SHORT_QUERY_WORDS = 60;
const CHUNK_WORDS = 180;
const OVERLAP = 30;

export function chunkWords(text: string, maxWords = CHUNK_WORDS, overlap = OVERLAP): string[] {
  const w = text.split(/\s+/).filter(Boolean);
  if (w.length <= maxWords) return [w.join(" ")];
  const out: string[] = [];
  for (let start = 0; start < w.length; start += maxWords - overlap) {
    out.push(w.slice(start, start + maxWords).join(" "));
    if (start + maxWords >= w.length) break;
  }
  return out;
}

async function pooled(embed: EmbedFn, chunks: string[]): Promise<Float32Array> {
  const vs = await embed(chunks);
  return l2normalize(vs.length === 1 ? vs[0] : meanVec(vs));
}

export async function embedDocText(embed: EmbedFn, text: string, chunking: Chunking): Promise<Float32Array> {
  return chunking === "truncate" ? l2normalize((await embed([text]))[0]) : pooled(embed, chunkWords(text));
}

export async function embedQuery(embed: EmbedFn, text: string, spec: ModelSpec): Promise<Float32Array> {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < SHORT_QUERY_WORDS) return l2normalize((await embed([spec.queryPrefix + text.trim()]))[0]);
  return pooled(embed, chunkWords(text));
}
