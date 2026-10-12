import { AXIS_POLES } from "../../../core/explain";
import type { Sliders } from "../../../core/stance";
import { AXES, type AxisScores } from "../../../core/types";
import { el, esc } from "./html";

export function renderStance(root: HTMLElement, sliders: Sliders, inferred: AxisScores, onChange: (s: Sliders) => void): void {
  const rows = AXES.map((a) => {
    const set = a in sliders;
    const v = set ? sliders[a] : inferred[a];
    return `<div class="axis"><label for="ax-${a}">${esc(AXIS_POLES[a][0])} <span>vs</span> ${esc(AXIS_POLES[a][1])}</label>
      <input id="ax-${a}" type="range" min="-2" max="2" step="1" value="${v ?? 0}" ${v === null ? 'data-null="1"' : ""} />
      <button type="button" data-clear="${a}">${set ? "Use my text" : v === null ? "No opinion" : "Inferred"}</button></div>`;
  }).join("");
  const wasOpen = root.querySelector("details.stance")?.hasAttribute("open") ?? false; // keep it open across re-renders
  const node = el(`<details class="stance"${wasOpen ? " open" : ""}><summary>My stance (optional)</summary>${rows}</details>`);
  node.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((inp) =>
    inp.addEventListener("change", () => onChange({ ...sliders, [inp.id.slice(3)]: Number(inp.value) })));
  node.querySelectorAll<HTMLButtonElement>("button[data-clear]").forEach((b) => b.addEventListener("click", () => {
    const next = { ...sliders }; delete next[b.dataset.clear as keyof Sliders]; onChange(next);
  }));
  root.replaceChildren(node);
}
