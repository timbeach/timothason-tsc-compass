import type { Topic } from "../../core/retrieval";
import type { Sliders } from "../../core/stance";
import { remainingDays } from "../../core/survey";
import { AXES, type AxisScores } from "../../core/types";
import { loadBundle } from "./data";
import { answer, type Answer } from "./engine";
import { ModelClient, type FallbackReason, type WorkerLike } from "./model-client";
import { safeGet, safeSet } from "./storage";
import { el, esc } from "./ui/html";
import { renderItinerary } from "./ui/itinerary";
import { renderMap } from "./ui/map";
import { renderResults } from "./ui/results";
import { renderStance } from "./ui/stance";
import { findMustSees, readSurvey, renderMustSees, renderPinned, restoreSurvey, surveyHtml, TYPES, type SurveyState } from "./ui/survey";

const app = document.getElementById("app")!;
const EXAMPLES = ["Microtubules and anesthesia", "Are LLMs conscious?", "Psychedelics and the self", "Idealism vs physicalism", "Meditation and nondual awareness"];
const DAYS: [string, string][] = [["2026-10-11", "Sun"], ["2026-10-12", "Mon"], ["2026-10-13", "Tue"], ["2026-10-14", "Wed"], ["2026-10-15", "Thu"], ["2026-10-16", "Fri"]];
// The plan starts today (conference time), not on a day that has already happened.
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const NO_STANCE: AxisScores = Object.fromEntries(AXES.map((a) => [a, null])) as AxisScores;

app.append(el(`<div>
  <header><h1>TSC Compass</h1><p>Unofficial matcher for <a href="https://tsc2026.org/" target="_blank" rel="noopener">The Science of Consciousness 2026</a>.
  Your text never leaves this device.</p></header>
  <div id="featured"></div>
  <form id="f">
    <p class="intro">Answer as much or as little as you like. The first box is enough to start; every step after it sharpens the match and the plan.</p>
    ${surveyHtml({ examples: EXAMPLES, days: DAYS, defaultDays: remainingDays(DAYS.map((d) => d[0]), today) })}
    <div class="submit"><button type="submit" id="go">Find my people</button> <span id="status" role="status"></span> <progress id="model-progress" max="1" value="0" hidden aria-label="Loading the matching model"></progress></div>
  </form>
  <div id="results"></div><canvas id="map" aria-label="Map of all presentations"></canvas><div id="plan"></div>
  <footer id="foot"></footer>
</div>`));

const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
const status = $("#status");
const form = $<HTMLFormElement>("#f");
let sliders: Sliders = safeGet("sliders", {});
let pins: Record<string, string> = safeGet("pins", {});
let last: Answer | null = null;
const saved = safeGet<Partial<SurveyState>>("survey", {});
restoreSurvey(form, saved);
renderStance($("#stance"), sliders, NO_STANCE, (s) => { sliders = s; safeSet("sliders", s); void run(); });

// Attach handlers before the data arrives: an early tap would otherwise do a native form submit and reload the page.
form.addEventListener("submit", (e) => { e.preventDefault(); void run(); });
app.querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => c.addEventListener("click", () => { $<HTMLTextAreaElement>("#q").value = c.textContent!; void run(); }));
const bundleReady = loadBundle();
bundleReady.catch((err) => {
  console.error(err);
  $("#results").replaceChildren(el(`<p class="banner" data-testid="data-error">The program data didn't load (${esc(String(err.message ?? err))}). Please reload the page.</p>`));
});
const bundle = await bundleReady;
$("#foot").innerHTML = `Program data from tsc2026.org as of ${esc(bundle.meta.dataDate)}. Not affiliated with or endorsed by TSC. <a href="about.html">About, privacy and corrections</a>`;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const progress = $<HTMLProgressElement>("#model-progress");
progress.hidden = false;
const model = new ModelClient(worker as unknown as WorkerLike, bundle.meta.model, 60000, (st) => {
  if (st !== "loading") { status.textContent = ""; progress.hidden = true; }
}, undefined, bundle.meta.modelFiles);
model.onProgress = (f) => { progress.value = f; };

let runSeq = 0;
async function run() {
  await bundleReady; // the module resumes first (it awaited earlier), so bundle and worker exist after this
  const seq = ++runSeq;
  const s = readSurvey(form);
  if (s.topics.length === 0) return;
  safeSet("survey", s);
  // "Plenary" also covers panels and remote plenaries; all boxes checked means no filter.
  const types = s.types.length === TYPES.length ? null : new Set(s.types.flatMap((t) => (t === "Plenary" ? ["Plenary", "Panel"] : [t])));
  const q = {
    text: s.topics[0], qVec: null as Float32Array | null, sliders, days: new Set(s.days), types, methods: s.methods, pins,
    goal: s.goal, disciplines: s.mine.length || s.curious.length ? { mine: s.mine, curious: s.curious } : undefined,
    zoomOnly: s.zoomOnly, posterN: s.posterN, vary: s.vary,
  };
  const keywordTopics: Topic[] = s.topics.map((text) => ({ text, qVec: null }));
  if (model.state === "loading") {
    // Model still downloading: show keyword matches now, upgrade when the vectors arrive.
    status.textContent = "Loading the matching model (first visit only, about 25 MB)";
    show(answer(bundle, { ...q, topics: keywordTopics }), "loading");
  } else status.textContent = "Matching";
  const embedded = await Promise.all(s.topics.map((t) => model.embed(t)));
  if (seq !== runSeq) return; // a newer search started while this one waited
  status.textContent = "";
  const topics: Topic[] = s.topics.map((text, i) => ({ text, qVec: embedded[i].vec }));
  const allFailed = embedded.every((e) => e.vec === null);
  show(answer(bundle, { ...q, qVec: topics[0].qVec, topics }), allFailed ? embedded[0].reason : null);
}

function show(a: Answer, keywordNote: "loading" | FallbackReason | null) {
  last = a;
  renderResults($("#results"), a, bundle.docs, keywordNote);
  renderStance($("#stance"), sliders, a.u, (s) => { sliders = s; safeSet("sliders", s); void run(); });
  renderItinerary($("#plan"), a.plan, bundle.docs, (slot, opt) => setPin(slot, opt));
  renderMap($<HTMLCanvasElement>("#map"), bundle.docs, a);
}

function setPin(slotId: string, optionId: string | null) {
  if (optionId === null) delete pins[slotId]; else pins[slotId] = optionId;
  safeSet("pins", pins);
  renderFeatured(); renderMustSeeStep();
  if (readSurvey(form).topics.length) void run();
}

renderMap($<HTMLCanvasElement>("#map"), bundle.docs, null);

// Step 7: a presenter or title becomes a pinned session.
const mustSee = $<HTMLInputElement>("#mustsee");
function renderMustSeeStep() {
  renderMustSees($("#mustsee-hits"), findMustSees(bundle.docs, bundle.slots, mustSee.value), pins, (slot, code) => setPin(slot, code));
  renderPinned($("#pinned"), pins, bundle.slots, (slot) => setPin(slot, null));
}
mustSee.addEventListener("input", renderMustSeeStep);
mustSee.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); }); // never submit the whole form from here
renderMustSeeStep();

// A tasteful plug for the makers' talks, built from the program data so it stays correct if the schedule moves.
const FEATURED_IDS = ["dani-caputi", "mason-ulrika-borchard"];
const clock12 = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
function renderFeatured() {
  const talks = FEATURED_IDS.flatMap((id) => {
    const d = bundle.docs.find((x) => x.id === id);
    const slot = d && bundle.slots.find((s) => s.options.some((o) => o.id === d.sessionCode));
    return d && d.day && slot ? [{ d, slot }] : [];
  }).sort((a, b) => (a.slot.day + a.slot.start).localeCompare(b.slot.day + b.slot.start));
  if (talks.length === 0) return;
  const node = el(`<aside class="featured" data-testid="featured">
    <p class="plug">${talks.length > 1 ? "Plugs from the makers" : "A plug from the makers"}</p>
    ${talks.map(({ d, slot }) => {
      const day = new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const pinned = pins[slot.id] === d.sessionCode;
      return `<div class="featured-talk">
        <p>${esc(d.name)} presents <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title.split(":")[0])}</a>.<span class="summary"> ${esc(d.coreClaim)}</span></p>
        <p class="when">${esc(day)}, ${clock12(slot.start)}, ${esc(d.sessionCode ?? "")}, ${esc(d.room ?? "")}
          <button type="button" data-slot="${esc(slot.id)}" data-code="${esc(d.sessionCode ?? "")}" ${pinned ? "disabled" : ""}>${pinned ? "In your week" : "Add to my week"}</button></p>
      </div>`;
    }).join("")}
  </aside>`);
  node.querySelectorAll<HTMLButtonElement>("button[data-slot]").forEach((b) => b.addEventListener("click", () => setPin(b.dataset.slot!, b.dataset.code!)));
  $("#featured").replaceChildren(node);
}
renderFeatured();

// A returning visitor with saved answers sees their results straight away.
if (saved.topics?.length) void run();
