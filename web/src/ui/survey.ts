// The intake survey: seven short steps that each feed one thing the engine can act on.
// Step 1 is the old single box, so a one-question search still works; everything else can be skipped.
// Last updated: 2026-10-11
import { GOAL_LABELS, GOALS, type Goal } from "../../../core/survey";
import { DISCIPLINES, METHODS, type Discipline, type Doc, type Slot } from "../../../core/types";
import { esc } from "./html";

export interface SurveyState {
  topics: string[]; goal: Goal; mine: Discipline[]; curious: Discipline[];
  zoomOnly: boolean; posterN: number; vary: boolean; methods: string[]; types: string[]; days: string[];
}

export const TYPES: [string, string][] = [["Plenary", "Plenaries and panels"], ["Concurrent", "Concurrent talks"], ["Poster", "Posters"], ["Workshop", "Workshops"]];
const POSTER_CHOICES = [5, 10, 20];

const check = (name: string, value: string, label: string, on: boolean) =>
  `<label><input type="checkbox" name="${esc(name)}" value="${esc(value)}" ${on ? "checked" : ""} /> ${esc(label)}</label>`;

export function surveyHtml(p: { examples: string[]; days: [string, string][]; defaultDays: string[] }): string {
  return `<ol class="survey">
    <li class="step">
      <h2><span class="n">1</span> What draws you to consciousness research?</h2>
      <label for="q" class="visually-hidden">Your main interest</label>
      <textarea id="q" rows="3" placeholder="A few words, or paste your own abstract"></textarea>
      <div class="chips">${p.examples.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}</div>
      <p class="hint">Got more than one interest? Each is matched on its own, so you see both covered.</p>
      <div class="topics">
        <input class="topic" data-topic="2" type="text" placeholder="A second interest (optional)" aria-label="A second interest" />
        <input class="topic" data-topic="3" type="text" placeholder="A third (optional)" aria-label="A third interest" />
      </div>
    </li>
    <li class="step">
      <h2><span class="n">2</span> Where you lean <span class="opt">optional</span></h2>
      <p class="hint">Positions, not verdicts. Kindred spirits share yours; worthy opponents don't.</p>
      <div id="stance"></div>
    </li>
    <li class="step">
      <h2><span class="n">3</span> What are you here for?</h2>
      <fieldset class="goal"><legend class="visually-hidden">Goal</legend>
        ${GOALS.map((g) => `<label class="radio"><input type="radio" name="goal" value="${g}" ${g === "balance" ? "checked" : ""} />
          <span><strong>${esc(GOAL_LABELS[g][0])}</strong><small>${esc(GOAL_LABELS[g][1])}</small></span></label>`).join("")}
      </fieldset>
    </li>
    <li class="step">
      <details class="fields"><summary><span class="n">4</span> Your fields, and fields to visit <span class="opt">optional</span></summary>
        <p class="hint">Your own fields get a small lift. Fields you're curious about steer the serendipity picks. Nothing is excluded.</p>
        <fieldset><legend>My field</legend>${DISCIPLINES.map((d) => check("mine", d, d, false)).join("")}</fieldset>
        <fieldset><legend>Curious about</legend>${DISCIPLINES.map((d) => check("curious", d, d, false)).join("")}</fieldset>
      </details>
    </li>
    <li class="step">
      <details class="methods"><summary><span class="n">5</span> How you like your evidence <span class="opt">optional</span></summary>
        <p class="hint">Tick any to show only work that uses these methods.</p>
        <fieldset><legend class="visually-hidden">Methods</legend>${METHODS.map((m) => check("m", m, m, false)).join("")}</fieldset>
      </details>
    </li>
    <li class="step">
      <h2><span class="n">6</span> Logistics</h2>
      <fieldset class="types"><legend>Show me</legend>${TYPES.map(([v, l]) => `<label><input type="checkbox" value="${v}" checked /> ${l}</label>`).join("")}</fieldset>
      <fieldset class="days"><legend>Days I'm attending</legend>${p.days.map(([d, l]) => `<label><input type="checkbox" value="${d}" ${p.defaultDays.includes(d) ? "checked" : ""} /> ${l}</label>`).join("")}</fieldset>
      <div class="logistics">
        <label><input type="checkbox" id="zoom" /> I'm on Zoom only (streamed sessions)</label>
        <label><input type="checkbox" id="vary" /> Vary my evenings (not the same field four nights running)</label>
        <label>Posters to shortlist <select id="posters">${POSTER_CHOICES.map((n) => `<option value="${n}" ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
    </li>
    <li class="step">
      <h2><span class="n">7</span> Must-sees <span class="opt">optional</span></h2>
      <p class="hint">A presenter or a title. Their session is pinned into your week.</p>
      <input id="mustsee" type="search" placeholder="Try a name: Borchard" aria-label="Find a presenter or title" autocomplete="off" />
      <div id="mustsee-hits" role="listbox" aria-label="Matching presentations"></div>
      <div id="pinned" class="pinned"></div>
    </li>
  </ol>`;
}

const checked = (root: ParentNode, sel: string) => [...root.querySelectorAll<HTMLInputElement>(sel)].filter((i) => i.checked).map((i) => i.value);

export function readSurvey(root: ParentNode): SurveyState {
  const topics = [(root.querySelector("#q") as HTMLTextAreaElement).value, ...[...root.querySelectorAll<HTMLInputElement>("input.topic")].map((i) => i.value)]
    .map((t) => t.trim()).filter(Boolean);
  const goal = ((root.querySelector("input[name=goal]:checked") as HTMLInputElement | null)?.value ?? "balance") as Goal;
  return {
    topics, goal,
    mine: checked(root, "input[name=mine]") as Discipline[], curious: checked(root, "input[name=curious]") as Discipline[],
    zoomOnly: (root.querySelector("#zoom") as HTMLInputElement).checked,
    vary: (root.querySelector("#vary") as HTMLInputElement).checked,
    posterN: Number((root.querySelector("#posters") as HTMLSelectElement).value) || 10,
    methods: checked(root, "input[name=m]"), types: checked(root, ".types input"), days: checked(root, ".days input"),
  };
}

export function restoreSurvey(root: ParentNode, s: Partial<SurveyState>): void {
  const setChecks = (sel: string, values: string[] | undefined) => {
    if (!values) return;
    root.querySelectorAll<HTMLInputElement>(sel).forEach((i) => { i.checked = values.includes(i.value); });
  };
  if (s.topics) {
    (root.querySelector("#q") as HTMLTextAreaElement).value = s.topics[0] ?? "";
    root.querySelectorAll<HTMLInputElement>("input.topic").forEach((i, k) => { i.value = s.topics![k + 1] ?? ""; });
  }
  if (s.goal) root.querySelectorAll<HTMLInputElement>("input[name=goal]").forEach((i) => { i.checked = i.value === s.goal; });
  setChecks("input[name=mine]", s.mine); setChecks("input[name=curious]", s.curious);
  setChecks("input[name=m]", s.methods); setChecks(".types input", s.types); setChecks(".days input", s.days);
  if (s.zoomOnly !== undefined) (root.querySelector("#zoom") as HTMLInputElement).checked = s.zoomOnly;
  if (s.vary !== undefined) (root.querySelector("#vary") as HTMLInputElement).checked = s.vary;
  if (s.posterN) (root.querySelector("#posters") as HTMLSelectElement).value = String(s.posterN);
  // Anything answered in a collapsed step opens it, so a returning visitor sees what is in effect.
  for (const sel of ["details.fields", "details.methods"]) {
    const d = root.querySelector<HTMLDetailsElement>(sel);
    if (d && d.querySelector("input:checked")) d.open = true;
  }
}

/** Which presentations match a typed name or title fragment, with the slot and option that pin them. */
export function findMustSees(docs: Doc[], slots: Slot[], query: string, limit = 6): { doc: Doc; slotId: string; optionId: string }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: { doc: Doc; slotId: string; optionId: string }[] = [];
  for (const d of docs) {
    if (!d.name.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) continue;
    const slot = d.sessionCode ? slots.find((s) => s.options.some((o) => o.id === d.sessionCode)) : undefined;
    if (!slot || slot.kind === "poster") continue; // posters sit in one session; the itinerary already lists the best ones
    out.push({ doc: d, slotId: slot.id, optionId: d.sessionCode! });
    if (out.length >= limit) break;
  }
  return out;
}

export function renderMustSees(root: HTMLElement, hits: ReturnType<typeof findMustSees>, pins: Record<string, string>, onPin: (slotId: string, optionId: string) => void): void {
  root.innerHTML = hits.map(({ doc, slotId, optionId }) => {
    const on = pins[slotId] === optionId;
    const day = doc.day ? new Date(doc.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "";
    return `<button type="button" role="option" class="hit" data-slot="${esc(slotId)}" data-code="${esc(optionId)}" ${on ? "disabled" : ""}>
      <strong>${esc(doc.name)}</strong> ${esc(doc.title)} <span class="when">${esc([day, optionId].filter(Boolean).join(" · "))}</span>${on ? " <em>In your week</em>" : ""}</button>`;
  }).join("");
  root.querySelectorAll<HTMLButtonElement>("button[data-slot]").forEach((b) => b.addEventListener("click", () => onPin(b.dataset.slot!, b.dataset.code!)));
}

export function renderPinned(root: HTMLElement, pins: Record<string, string>, slots: Slot[], onUnpin: (slotId: string) => void): void {
  const items = Object.entries(pins).flatMap(([slotId, optionId]) => {
    const slot = slots.find((s) => s.id === slotId);
    const o = slot?.options.find((x) => x.id === optionId);
    return slot && o ? [{ slotId, label: slot.kind === "poster" ? o.label : `${o.id}: ${o.label}` }] : [];
  });
  root.innerHTML = items.length
    ? `<p class="hint">Pinned into your week:</p>${items.map((x) => `<span class="pin">${esc(x.label)} <button type="button" data-unpin="${esc(x.slotId)}" aria-label="Unpin ${esc(x.label)}">×</button></span>`).join("")}`
    : "";
  root.querySelectorAll<HTMLButtonElement>("button[data-unpin]").forEach((b) => b.addEventListener("click", () => onUnpin(b.dataset.unpin!)));
}
