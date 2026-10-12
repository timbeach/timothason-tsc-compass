import { embedDocText, type Chunking } from "../core/embedtext";
import { MODELS } from "../core/models";
import type { RawRecord } from "../core/types";
import { nodeEmbedder } from "./embedder";
import { readJson, writeF32 } from "./io";

export const CHUNKINGS: Chunking[] = ["truncate", "chunk"];
export const docText = (r: RawRecord) => `${r.title}. ${r.abstract}`;

async function main() {
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const only = process.env.MODEL;
  for (const spec of MODELS.filter((m) => !only || m.key === only)) {
    const embed = await nodeEmbedder(spec);
    for (const ch of CHUNKINGS) {
      const out = new Float32Array(recs.length * spec.dim);
      for (let i = 0; i < recs.length; i++) out.set(await embedDocText(embed, docText(recs[i]), ch), i * spec.dim);
      writeF32(`data/build/emb/${spec.key}__${ch}.f32`, out);
      console.log(`${spec.key}__${ch}: ${recs.length} x ${spec.dim}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
