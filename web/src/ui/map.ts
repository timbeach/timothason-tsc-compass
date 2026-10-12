import { DISCIPLINES, type Doc } from "../../../core/types";
import type { Answer } from "../engine";
import { esc } from "./html";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
const PAD = 12;

/** Index of the point closest to (x, y) within radius px, or -1. */
export function nearestDot(points: [number, number][], x: number, y: number, radius: number): number {
  let best = -1, bestD = radius * radius;
  points.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

let current: { canvas: HTMLCanvasElement; docs: Doc[]; a: Answer | null; points: [number, number][] } | null = null;

function draw() {
  if (!current) return;
  const { canvas, docs, a } = current;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const P = (xy: [number, number]) => [PAD + xy[0] * (w - 2 * PAD), PAD + xy[1] * (h - 2 * PAD)] as [number, number];
  current.points = docs.map((d) => P(d.xy));
  docs.forEach((d, i) => {
    const [x, y] = current!.points[i];
    ctx.fillStyle = COLORS[DISCIPLINES.indexOf(d.discipline)] ?? "#888";
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  if (!a || a.results.kindred.length === 0) return;
  // "You are here": the average position of your top kindred matches, weighted by relevance.
  // UMAP can't place new points in the browser, so this stands in for projecting your text.
  const top = a.results.kindred.slice(0, 8);
  const wsum = top.reduce((s, m) => s + Math.max(0.01, m.rNorm), 0);
  const xy = [0, 1].map((k) => top.reduce((s, m) => s + docs[m.idx].xy[k] * Math.max(0.01, m.rNorm), 0) / wsum) as [number, number];
  const [x, y] = P(xy);
  ctx.strokeStyle = getComputedStyle(canvas).color; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText("you", x + 11, y + 4);
}

function setup(canvas: HTMLCanvasElement) {
  const legend = document.createElement("ul");
  legend.className = "map-legend";
  legend.innerHTML = DISCIPLINES.map((d, i) => `<li><span style="background:${COLORS[i]}"></span>${esc(d)}</li>`).join("");
  const tip = document.createElement("div");
  tip.className = "map-tip";
  tip.hidden = true;
  canvas.after(legend);
  canvas.parentElement!.style.position ||= "relative";
  canvas.after(tip);
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    const r = canvas.getBoundingClientRect();
    const i = nearestDot(current.points, e.clientX - r.left, e.clientY - r.top, 8);
    if (i < 0) { tip.hidden = true; return; }
    tip.textContent = current.docs[i].title;
    tip.style.left = `${canvas.offsetLeft + current.points[i][0] + 10}px`;
    tip.style.top = `${canvas.offsetTop + current.points[i][1] + 10}px`;
    tip.hidden = false;
  });
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
  new ResizeObserver(() => draw()).observe(canvas);
}

export function renderMap(canvas: HTMLCanvasElement, docs: Doc[], a: Answer | null): void {
  if (!current) setup(canvas);
  current = { canvas, docs, a, points: current?.points ?? [] };
  draw();
}
