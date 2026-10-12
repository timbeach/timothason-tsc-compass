import { METHODS } from "../../core/types";
import type { Sliders } from "../../core/stance";
import { loadBundle } from "./data";
import { answer, type Answer } from "./engine";
import { ModelClient, type FallbackReason, type WorkerLike } from "./model-client";
import { safeGet, safeSet } from "./storage";
import { el, esc } from "./ui/html";
import { renderItinerary } from "./ui/itinerary";
import { renderMap } from "./ui/map";
import { renderResults } from "./ui/results";
import { renderStance } from "./ui/stance";

const app = document.getElementById("app")!;
const EXAMPLES = ["Microtubules and anesthesia", "Are LLMs conscious?", "Psychedelics and the self", "Idealism vs physicalism", "Meditation and nondual awareness"];
const DAYS = [["2026-10-11", "Sun"], ["2026-10-12", "Mon"], ["2026-10-13", "Tue"], ["2026-10-14", "Wed"], ["2026-10-15", "Thu"], ["2026-10-16", "Fri"]];

app.append(el(`<div>
  <header><h1>TSC Compass</h1><p>Unofficial matcher for <a href="https://tsc2026.org/" target="_blank" rel="noopener">The Science of Consciousness 2026</a>.
  Your text never leaves this device.</p></header>
  <form id="f"><label for="q">What draws you to consciousness research?</label>
    <textarea id="q" rows="3" placeholder="A few words, or paste your own abstract"></textarea>
    <div class="chips">${EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}</div>
    <fieldset class="days"><legend>Days I'm attending</legend>${DAYS.map(([d, l]) => `<label><input type="checkbox" value="${d}" checked /> ${l}</label>`).join("")}</fieldset>
    <details><summary>Filter by method</summary>${METHODS.map((m) => `<label><input type="checkbox" name="m" value="${esc(m)}" /> ${esc(m)}</label>`).join("")}</details>
    <button type="submit" id="go">Find my people</button> <span id="status" role="status"></span>
  </form>
  <div id="stance"></div><div id="results"></div><canvas id="map" aria-label="Map of all presentations"></canvas><div id="plan"></div>
  <footer id="foot"></footer>
</div>`));

const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
const status = $("#status");
let sliders: Sliders = safeGet("sliders", {});
let pins: Record<string, string> = safeGet("pins", {});
let last: Answer | null = null;

// Attach handlers before the data arrives: an early tap would otherwise do a native form submit and reload the page.
$("#f").addEventListener("submit", (e) => { e.preventDefault(); void run(); });
app.querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => c.addEventListener("click", () => { $<HTMLTextAreaElement>("#q").value = c.textContent!; void run(); }));
const bundleReady = loadBundle();
bundleReady.catch((err) => {
  console.error(err);
  $("#results").replaceChildren(el(`<p class="banner" data-testid="data-error">The program data didn't load (${esc(String(err.message ?? err))}). Please reload the page.</p>`));
});
const bundle = await bundleReady;
$("#foot").innerHTML = `Program data from tsc2026.org as of ${esc(bundle.meta.dataDate)}. Not affiliated with or endorsed by TSC. <a href="about.html">About, privacy and corrections</a>`;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const model = new ModelClient(worker as unknown as WorkerLike, bundle.meta.model, 60000, (st) => { if (st !== "loading") status.textContent = ""; });

let runSeq = 0;
async function run() {
  await bundleReady; // the module resumes first (it awaited earlier), so bundle and worker exist after this
  const seq = ++runSeq;
  const text = $<HTMLTextAreaElement>("#q").value.trim();
  if (!text) return;
  const days = new Set([...app.querySelectorAll<HTMLInputElement>(".days input:checked")].map((i) => i.value));
  const methods = [...app.querySelectorAll<HTMLInputElement>("input[name=m]:checked")].map((i) => i.value);
  const q = { text, sliders, days, types: null, methods, pins };
  if (model.state === "loading") {
    // Model still downloading: show keyword matches now, upgrade when the vector arrives.
    status.textContent = "Loading the matching model (first visit only, about 25 MB)";
    show(answer(bundle, { ...q, qVec: null }), "loading");
  } else status.textContent = "Matching";
  const { vec: qVec, reason } = await model.embed(text);
  if (seq !== runSeq) return; // a newer search started while this one waited
  status.textContent = "";
  show(answer(bundle, { ...q, qVec }), reason);
}

function show(a: Answer, keywordNote: "loading" | FallbackReason | null) {
  last = a;
  renderResults($("#results"), a, bundle.docs, keywordNote);
  renderStance($("#stance"), sliders, a.u, (s) => { sliders = s; safeSet("sliders", s); void run(); });
  renderItinerary($("#plan"), a.plan, bundle.docs, (slot, opt) => {
    if (opt === null) delete pins[slot]; else pins[slot] = opt;
    safeSet("pins", pins); void run();
  });
  renderMap($<HTMLCanvasElement>("#map"), bundle.docs, a);
}

renderMap($<HTMLCanvasElement>("#map"), bundle.docs, null);
