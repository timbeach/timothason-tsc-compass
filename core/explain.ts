import type { Axis, AxisScores, Doc } from "./types";
import { tokenize } from "./lexical";
import { dot } from "./vec";

export const AXIS_POLES: Record<Axis, [string, string]> = {
  ontology: ["consciousness from physical processes", "consciousness as fundamental"],
  mechanism: ["classical neural accounts", "quantum or field accounts"],
  evidence: ["empirical work", "theoretical work"],
  scope: ["brain-bound mind", "extended or nonlocal mind"],
};

export function poleLabel(axis: Axis, v: number): string { return AXIS_POLES[axis][v < 0 ? 0 : 1]; }

export interface ExplainInput {
  doc: Doc; u: AxisScores; shared: Axis[]; qText: string; qVec: Float32Array | null;
  conceptVec: (docId: string, concept: string) => Float32Array | undefined; theta: number; methods?: string[];
}

export function explain(inp: ExplainInput): string[] {
  const { doc, u } = inp;
  const out: string[] = [];
  const qTok = new Set(tokenize(inp.qText));
  const concepts = doc.concepts.filter((c) => {
    const t = tokenize(c);
    if (t.length && t.every((x) => qTok.has(x))) return true;
    const v = inp.qVec && inp.conceptVec(doc.id, c);
    return !!v && dot(v, inp.qVec!) >= inp.theta;
  }).slice(0, 2);
  if (concepts.length) out.push(`Shared interest: ${concepts.join(", ")}`);

  const diffs = inp.shared.map((a) => ({ a, du: u[a] as number, dd: doc.axes[a] as number }))
    .map((x) => ({ ...x, gap: Math.abs(x.du - x.dd) }));
  const agree = diffs.find((x) => x.gap <= 1 && x.du !== 0 && Math.sign(x.du) === Math.sign(x.dd));
  const clash = diffs.filter((x) => x.gap >= 2).sort((p, q) => q.gap - p.gap)[0];
  if (clash) {
    const yours = clash.du === 0 ? "you're in the middle" : `you lean toward ${poleLabel(clash.a, clash.du)}`;
    out.push(`They lean toward ${poleLabel(clash.a, clash.dd)}; ${yours}`);
  } else if (agree) out.push(`You both lean toward ${poleLabel(agree.a, agree.dd)}`);

  const m = (inp.methods ?? []).filter((x) => (doc.methods as string[]).includes(x));
  if (m.length) out.push(`Same method: ${m.join(", ")}`);
  return out.slice(0, 3);
}
