import { DISCIPLINES, type Doc } from "../../../core/types";
import type { Answer } from "../engine";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];

export function renderMap(canvas: HTMLCanvasElement, docs: Doc[], a: Answer | null): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const P = (xy: [number, number]) => [12 + xy[0] * (w - 24), 12 + xy[1] * (h - 24)] as const;
  for (const d of docs) {
    const [x, y] = P(d.xy);
    ctx.fillStyle = COLORS[DISCIPLINES.indexOf(d.discipline)] ?? "#888";
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!a || a.results.kindred.length === 0) return;
  // "You are here": similarity-weighted mean of the top 8 kindred positions.
  const top = a.results.kindred.slice(0, 8);
  const wsum = top.reduce((s, m) => s + Math.max(0.01, m.rNorm), 0);
  const xy: [number, number] = [0, 1].map((k) => top.reduce((s, m) => s + docs[m.idx].xy[k] * Math.max(0.01, m.rNorm), 0) / wsum) as [number, number];
  const [x, y] = P(xy);
  ctx.strokeStyle = "currentColor"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText("you", x + 11, y + 4);
}
