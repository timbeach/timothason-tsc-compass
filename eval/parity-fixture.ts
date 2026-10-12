import { readFileSync } from "node:fs";
import type { Bm25Index } from "../core/lexical";
import { embedQuery } from "../core/embedtext";
import { MODELS } from "../core/models";
import type { Bundle } from "../web/src/data";
import { answer } from "../web/src/engine";
import { nodeEmbedder } from "../pipeline/embedder";
import { readF32, readJson, writeJson } from "../pipeline/io";

const D = "web/public/data/";
const meta = readJson<Bundle["meta"]>(D + "meta.json");
const docs = readJson<Bundle["docs"]>(D + "docs.json");
const bundle: Bundle = {
  docs, meta, axes: readJson(D + "axes.json"), slots: readJson(D + "slots.json"), conceptVec: () => undefined,
  corpus: { ids: docs.map((d) => d.id), dim: meta.dim, vectors: readF32(D + "vectors.f32"), lex: JSON.parse(readFileSync(D + "lex.json", "utf8")) as Bm25Index },
};
const spec = MODELS.find((m) => m.id === meta.model)!;
const embed = await nodeEmbedder(spec);
const queries = ["microtubules and anesthesia", "Are LLMs conscious?", "psychedelics and the self", "idealism", "near-death experiences"];
const out = [];
for (const query of queries) {
  const qVec = await embedQuery(embed, query, spec);
  const a = answer(bundle, { text: query, qVec, sliders: {}, days: null, types: null, methods: [], pins: {} });
  out.push({ query, kindred: a.results.kindred.map((m) => m.id) });
}
writeJson("e2e/parity.fixture.json", out);
console.log("fixture written");
