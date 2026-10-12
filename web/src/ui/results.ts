import type { Match } from "../../../core/rank";
import type { Doc } from "../../../core/types";
import type { Answer } from "../engine";
import { el, esc } from "./html";

function card(list: string, m: Match, d: Doc, reasons: string[], question: string): string {
  const when = [d.day ? new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "", d.sessionCode ?? "", d.room ?? ""].filter(Boolean).join(" \u00b7 ");
  return `<article class="card" data-testid="match" data-list="${list}" data-id="${esc(d.id)}">
    <h3><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a></h3>
    <p class="who">${esc(d.name)}${d.affiliation ? `, ${esc(d.affiliation)}` : ""}</p>
    <p class="when">${esc(when)}</p>
    <p class="claim">${esc(d.coreClaim)}</p>
    ${reasons.length ? `<ul class="why">${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    <p class="ask"><span>Ask:</span> ${esc(question)}</p>
  </article>`;
}

export function renderResults(root: HTMLElement, a: Answer, docs: Doc[], modelLoading = false): void {
  const R = a.results;
  const col = (title: string, blurb: string, list: string, ms: Match[], q: (d: Doc) => string, empty: string) =>
    `<section class="col"><h2>${title}</h2><p class="blurb">${blurb}</p>${ms.length
      ? ms.map((m) => card(list, m, docs[m.idx], a.reasons.get(m.id) ?? [], q(docs[m.idx]))).join("")
      : `<p class="empty">${empty}</p>`}</section>`;
  root.replaceChildren(el(`<div class="results">
    ${a.lexicalOnly ? (modelLoading
      ? `<p class="banner" data-testid="loading-banner">Showing keyword matches while the matching model loads. These will update by themselves in a moment.</p>`
      : `<p class="banner" data-testid="lexical-banner">The meaning model couldn't load, so these are keyword matches only.</p>`) : ""}
    ${R.weak ? `<p class="banner" data-testid="weak-banner">Nothing in the program strongly matches this. Try different words or broaden your filters.</p>` : ""}
    <div class="cols">
      ${col("Kindred spirits", "Close to your interests and your position.", "kindred", R.kindred, (d) => d.askQuestion, "No matches with these filters.")}
      ${col("Worthy opponents", "Same topic, a different position. Good hallway arguments.", "opponents", R.opponents, (d) => d.challengeQuestion,
        "No clear disagreement found. Set your stance below to find opponents.")}
      ${col("Serendipity", "Relevant, from a field you might not visit.", "serendipity", R.serendipity ? [R.serendipity] : [], (d) => d.askQuestion, "None this time.")}
    </div>
    <p class="note">Questions and one-line summaries are AI-drafted from the official abstracts. Treat them as starting points, and read the abstract.</p>
  </div>`));
}
