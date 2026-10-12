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

async function get(u: string): Promise<Response> {
  const res = await fetch(u, { cache: "no-cache" }); // revalidate: old and new data files must never mix after a redeploy
  if (!res.ok) throw new Error(`could not load ${u} (HTTP ${res.status})`);
  return res;
}
const json = async <T>(u: string) => (await get(u)).json() as Promise<T>;
const f32 = async (u: string) => new Float32Array(await (await get(u)).arrayBuffer());

/** The data files are deployed together; a mix of old and new files would silently mislabel results. */
export function checkBundle(p: { nDocs: number; dim: number; nVectorFloats: number; lexN: number; nConcepts: number; nConceptFloats: number }): void {
  if (p.nVectorFloats !== p.nDocs * p.dim) throw new Error(`program data mismatch: vectors for ${p.nVectorFloats / p.dim} entries, ${p.nDocs} entries listed`);
  if (p.lexN !== p.nDocs) throw new Error(`program data mismatch: keyword index has ${p.lexN} entries, ${p.nDocs} listed`);
  if (p.nConceptFloats !== p.nConcepts * p.dim) throw new Error("program data mismatch: concept vectors don't match the concept list");
}

export async function loadBundle(base = "data/"): Promise<Bundle> {
  const [docs, lex, axes, slots, concepts, meta, vectors, cvecs] = await Promise.all([
    json<Doc[]>(base + "docs.json"), json<Bm25Index>(base + "lex.json"), json<AxisModel[]>(base + "axes.json"),
    json<Slot[]>(base + "slots.json"), json<{ docId: string; concept: string }[]>(base + "concepts.json"),
    json<Bundle["meta"]>(base + "meta.json"), f32(base + "vectors.f32"), f32(base + "conceptvecs.f32"),
  ]);
  const dim = meta.dim;
  checkBundle({ nDocs: docs.length, dim, nVectorFloats: vectors.length, lexN: lex.N, nConcepts: concepts.length, nConceptFloats: cvecs.length });
  const cIndex = new Map(concepts.map((c, i) => [`${c.docId}::${c.concept}`, i]));
  return {
    docs, axes, slots, meta,
    corpus: { ids: docs.map((d) => d.id), dim, vectors, lex },
    conceptVec: (id, c) => { const i = cIndex.get(`${id}::${c}`); return i === undefined ? undefined : cvecs.subarray(i * dim, (i + 1) * dim); },
  };
}
