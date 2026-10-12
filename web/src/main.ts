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
const TYPES = [["Plenary", "Plenaries and panels"], ["Concurrent", "Concurrent talks"], ["Poster", "Posters"], ["Workshop", "Workshops"]];
const DAYS = [["2026-10-11", "Sun"], ["2026-10-12", "Mon"], ["2026-10-13", "Tue"], ["2026-10-14", "Wed"], ["2026-10-15", "Thu"], ["2026-10-16", "Fri"]];

app.append(el(`<div>
  <header><h1>TSC Compass</h1><p>Unofficial matcher for <a href="https://tsc2026.org/" target="_blank" rel="noopener">The Science of Consciousness 2026</a>.
  Your text never leaves this device.</p></header>
  <div id="featured"></div>
  <form id="f"><label for="q">What draws you to consciousness research?</label>
    <textarea id="q" rows="3" placeholder="A few words, or paste your own abstract"></textarea>
    <div class="chips">${EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}</div>
    <fieldset class="types"><legend>Show me</legend>${TYPES.map(([v, l]) => `<label><input type="checkbox" value="${v}" checked /> ${l}</label>`).join("")}</fieldset>
    <fieldset class="days"><legend>Days I'm attending</legend>${DAYS.map(([d, l]) => `<label><input type="checkbox" value="${d}" checked /> ${l}</label>`).join("")}</fieldset>
    <details><summary>Filter by method</summary>${METHODS.map((m) => `<label><input type="checkbox" name="m" value="${esc(m)}" /> ${esc(m)}</label>`).join("")}</details>
    <button type="submit" id="go">Find my people</button> <span id="status" role="status"></span> <progress id="model-progress" max="1" value="0" hidden aria-label="Loading the matching model"></progress>
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
  const text = $<HTMLTextAreaElement>("#q").value.trim();
  if (!text) return;
  const days = new Set([...app.querySelectorAll<HTMLInputElement>(".days input:checked")].map((i) => i.value));
  const methods = [...app.querySelectorAll<HTMLInputElement>("input[name=m]:checked")].map((i) => i.value);
  const checkedTypes = [...app.querySelectorAll<HTMLInputElement>(".types input:checked")].map((i) => i.value);
  // "Plenary" also covers panels and remote plenaries; all boxes checked means no filter.
  const types = checkedTypes.length === TYPES.length ? null : new Set(checkedTypes.flatMap((t) => (t === "Plenary" ? ["Plenary", "Panel"] : [t])));
  const q = { text, sliders, days, types, methods, pins };
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
    safeSet("pins", pins); renderFeatured(); void run();
  });
  renderMap($<HTMLCanvasElement>("#map"), bundle.docs, a);
}

renderMap($<HTMLCanvasElement>("#map"), bundle.docs, null);

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
  node.querySelectorAll<HTMLButtonElement>("button[data-slot]").forEach((b) => b.addEventListener("click", () => {
    pins[b.dataset.slot!] = b.dataset.code!;
    safeSet("pins", pins);
    renderFeatured();
    if ($<HTMLTextAreaElement>("#q").value.trim()) void run();
  }));
  $("#featured").replaceChildren(node);
}
renderFeatured();
