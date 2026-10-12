import { toIcs, type PlanItem } from "../../../core/itinerary";
import type { Doc } from "../../../core/types";
import { el, esc } from "./html";

export function renderItinerary(root: HTMLElement, plan: PlanItem[], docs: Doc[], onPin: (slotId: string, optionId: string | null) => void): void {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const days = [...new Set(plan.map((p) => p.slot.day))];
  const html = days.map((day) => `<h3>${new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h3>` +
    plan.filter((p) => p.slot.day === day).map((p) => `<div class="slot"><span class="time">${p.slot.start}</span>
      <select data-slot="${esc(p.slot.id)}" aria-label="Session at ${p.slot.start}">
        ${p.slot.options.map((o) => `<option value="${esc(o.id)}" ${o.id === p.chosen.id ? "selected" : ""}>${esc(p.slot.kind === "poster" ? o.label : `${o.id}: ${o.label}`)}</option>`).join("")}
      </select>${p.pinned ? `<button data-unpin="${esc(p.slot.id)}">Unpin</button>` : ""}
      ${p.posters.length ? `<ol class="posters">${p.posters.map((id) => `<li><a href="${esc(byId.get(id)!.url)}" target="_blank" rel="noopener">${esc(byId.get(id)!.title)}</a></li>`).join("")}</ol>` : ""}
    </div>`).join("")).join("");
  const node = el(`<section class="itinerary"><h2>My week</h2>${html}<button id="ics">Add to calendar (.ics)</button></section>`);
  node.querySelectorAll<HTMLSelectElement>("select[data-slot]").forEach((s) => s.addEventListener("change", () => onPin(s.dataset.slot!, s.value)));
  node.querySelectorAll<HTMLButtonElement>("button[data-unpin]").forEach((b) => b.addEventListener("click", () => onPin(b.dataset.unpin!, null)));
  node.querySelector("#ics")!.addEventListener("click", () => {
    const blob = new Blob([toIcs(plan, byId)], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tsc2026-my-week.ics"; a.click();
  });
  root.replaceChildren(node);
}
