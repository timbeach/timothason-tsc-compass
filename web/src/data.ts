import type { Bm25Index } from "../../core/lexical";
import type { Corpus } from "../../core/retrieval";
import type { AxisModel } from "../../core/stance";
import type { Doc, Slot } from "../../core/types";
import type { CompassConfig } from "../../pipeline/export";

export interface Bundle {
  docs: Doc[]; corpus: Corpus; axes: AxisModel[]; slots: Slot[];
  conceptVec: (docId: string, concept: string) => Float32Array | undefined;
  meta: { dataDate: string; model: string; dim: number; chunking: string; config: CompassConfig };
}

const json = async <T>(u: string) => (await fetch(u)).json() as Promise<T>;
const f32 = async (u: string) => new Float32Array(await (await fetch(u)).arrayBuffer());

export async function loadBundle(base = "data/"): Promise<Bundle> {
  const [docs, lex, axes, slots, concepts, meta, vectors, cvecs] = await Promise.all([
    json<Doc[]>(base + "docs.json"), json<Bm25Index>(base + "lex.json"), json<AxisModel[]>(base + "axes.json"),
    json<Slot[]>(base + "slots.json"), json<{ docId: string; concept: string }[]>(base + "concepts.json"),
    json<Bundle["meta"]>(base + "meta.json"), f32(base + "vectors.f32"), f32(base + "conceptvecs.f32"),
  ]);
  const dim = meta.dim;
  const cIndex = new Map(concepts.map((c, i) => [`${c.docId}::${c.concept}`, i]));
  return {
    docs, axes, slots, meta,
    corpus: { ids: docs.map((d) => d.id), dim, vectors, lex },
    conceptVec: (id, c) => { const i = cIndex.get(`${id}::${c}`); return i === undefined ? undefined : cvecs.subarray(i * dim, (i + 1) * dim); },
  };
}
