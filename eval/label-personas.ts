import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parse } from "yaml";
import { mulberry32, shuffle } from "../core/random";
import type { RawRecord } from "../core/types";
import { loadEnrichments } from "../pipeline/enrich";
import { readJson, writeJson } from "../pipeline/io";

/** Pool = union of each config's top-10 (eval/pools.json, written by every npm run eval) plus 10 random docs. Shown shuffled, without scores or source. */
async function main() {
  const personas = parse((await import("node:fs")).readFileSync("eval/personas.yaml", "utf8")) as { id: string; query: string }[];
  const recs = readJson<RawRecord[]>("data/raw/records.json");
  const enr = loadEnrichments(recs, "data/build/enrichment");
  const pools = readJson<Record<string, string[]>>("eval/pools.json");
  const labels: Record<string, Record<string, number>> = existsSync("eval/labels.json") ? readJson("eval/labels.json") : {};
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const [pi, p] of personas.entries()) {
    labels[p.id] ??= {};
    const rnd = mulberry32(1000 + pi);
    const random10 = shuffle(recs.map((r) => r.id), rnd).slice(0, 10);
    const pool = shuffle([...new Set([...(pools[p.id] ?? []), ...random10])], rnd).filter((id) => !(id in labels[p.id]));
    console.log(`\n=== ${p.id}: ${p.query}\n(${pool.length} to label; 2 = must see, 1 = relevant, 0 = not relevant, q = save and quit)`);
    for (const id of pool) {
      const r = recs.find((x) => x.id === id)!;
      const ans = (await rl.question(`\n${r.title}\n  ${enr.get(id)!.core_claim}\n> `)).trim();
      if (ans === "q") { writeJson("eval/labels.json", labels); rl.close(); return; }
      if (["0", "1", "2"].includes(ans)) labels[p.id][id] = Number(ans);
      writeJson("eval/labels.json", labels);
    }
  }
  rl.close();
}

await main();
