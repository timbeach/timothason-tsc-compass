import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { AXES, type Axis, type RawRecord } from "../core/types";
import { mulberry32, shuffle } from "../core/random";
import { spearman } from "../core/stance";
import { AXIS_POLES } from "../core/explain";
import { loadEnrichments } from "../pipeline/enrich";
import { readJson, writeJson } from "../pipeline/io";

const N = 30;
type Human = Record<string, Record<Axis, number | null>>;

async function label(recs: RawRecord[]) {
  const sample = shuffle(recs.map((r) => r.id), mulberry32(2026)).slice(0, N);
  const human: Human = existsSync("eval/human_axes.json") ? readJson("eval/human_axes.json") : {};
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Score what each abstract emphasizes: -2..2, or n for no position. You won't see Claude's labels.");
  for (const id of sample.filter((x) => !(x in human))) {
    const r = recs.find((x) => x.id === id)!;
    console.log(`\n=== ${r.title}\n${r.abstract}\n`);
    const row = {} as Record<Axis, number | null>;
    for (const a of AXES) {
      const [neg, pos] = AXIS_POLES[a];
      for (;;) {
        const ans = (await rl.question(`${a} (-2 ${neg} ... +2 ${pos}, n): `)).trim();
        if (ans === "n") { row[a] = null; break; }
        if (/^-?[0-2]$/.test(ans)) { row[a] = Number(ans); break; }
      }
    }
    human[id] = row;
    writeJson("eval/human_axes.json", human);
  }
  rl.close();
  return human;
}

function agreement(recs: RawRecord[], human: Human) {
  const enr = loadEnrichments(recs, "data/build/enrichment");
  const out = {} as Record<Axis, number | null>;
  for (const a of AXES) {
    const pairs = Object.entries(human).map(([id, h]) => [h[a], enr.get(id)!.axes[a]] as const)
      .filter(([h, c]) => h !== null && c !== null) as [number, number][];
    const nullAgree = Object.entries(human).filter(([id, h]) => (h[a] === null) === (enr.get(id)!.axes[a] === null)).length;
    out[a] = pairs.length >= 8 ? spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null;
    console.log(a, { pairs: pairs.length, spearman: out[a]?.toFixed(2), nullAgreement: `${nullAgree}/${Object.keys(human).length}` });
  }
  writeJson("eval/human_agreement.json", out);
}

const recs = readJson<RawRecord[]>("data/raw/records.json");
agreement(recs, await label(recs));
