# TSC Compass: design spec

Date: 2026-10-04
Status: draft for review
Working name: **TSC Compass** (rename freely)

## 1. Purpose

An unofficial, free, browser-only companion for The Science of Consciousness 2026 (San Diego, Oct 11 to 16). An attendee describes what they care about, and Compass:

1. finds the talks and posters closest to their interests,
2. separates them into **kindred spirits** (same topic, similar position) and **worthy opponents** (same topic, opposing position),
3. adds one deliberate **serendipity** pick from outside their usual field,
4. gives each match a question to open a conversation with,
5. builds a **conflict-free itinerary** across the week's parallel sessions.

**Why:** the real goal is networking and visibility for Tim and Mason. We ship before the conference, share it on the TSC Discord, and grow it at the hackathon (pitch gate Tue Oct 13, 12:00 PST). A tool people already use on day one is the pitch.

**Success looks like:**
- Live at a public URL, with a single Discord post, by **Fri Oct 9**.
- The offline evaluation (section 7) shows the chosen retrieval clearly beats a keyword baseline, and the stance axes we expose to users pass their validation threshold.
- Codex reviews the matching and evaluation code before launch.
- People use it during the week, and it gives us something concrete to extend at the hackathon.

**Non-goals for v0:** accounts, a server or database, people-to-people matching (the hackathon v1 target), per-talk time slots (the official site only publishes session blocks), experiential sessions and social events, and mobile apps.

## 2. Data source and etiquette

- **Only the official site, tsc2026.org.** Listing pages: `program_details.html` (plenaries and the day grid), `program.html`, `concurrent.html` (26 sessions, MON-1 to THU-7), `posters.html` (2 sessions with Focus disciplines), and `workshops.html` (Sunday, Oct 11). Abstract pages: `abstracts_html/<slug>.html`, 293 in total.
- Each abstract page provides: name, affiliation, presentation line (day, session, room), type tags (Plenary, Concurrent, Poster, Workshop, Panel, Remote), title, abstract text and bio.
- Scraping is polite: every page is cached once, there's at least 0.4s between requests, and the User-Agent identifies the project. Re-scraping is a manual command, and the UI shows "program data as of <date>".
- **We don't republish abstracts.** The UI shows title, speaker, affiliation, session, our own one-line summary of the core claim and a link to the official abstract page. Full abstract text is used only at build time, for embeddings and enrichment. Raw HTML and abstract text stay out of the deployed bundle (they're gitignored in a `data/raw/` folder).
- The site carries an unofficial disclaimer and credits TSC. Before the Discord post, we send a courtesy note to the organizers, with a contact link where presenters can ask for a correction or for their entry to be removed.

## 3. Architecture

**One language: TypeScript on Node 26 for the pipeline, evaluation and web app.** That way query-time scoring and the evaluation run the *same* code, and document and query embeddings come from the *same* quantized ONNX model through transformers.js. This rules out drift between Python evaluation and JS runtime.

```
tsc-compass/
  pipeline/           build-time only, Node scripts
    scrape.ts         listing pages + abstract pages -> data/raw/ (cached)
    parse.ts          -> data/build/records.json (metadata + abstract text)
    schedule.ts       -> data/build/slots.json (time slots and parallel options)
    enrich.ts         Claude API -> data/build/enrichment.json (cached by content hash)
    embed.ts          transformers.js -> data/build/embeddings.<model>.bin
    axes.ts           ridge fit embedding->axis, cross-validated -> axes.json + report
    layout.ts         2D map coordinates (UMAP via umap-js) -> layout.json
    export.ts         -> web/public/data/*.json|bin (public fields only)
  core/               pure, shared by eval and web, no I/O
    retrieval.ts      dense, lexical (BM25), hybrid fusion
    stance.ts         axis projection, stance distance
    rank.ts           kindred / opponents / serendipity, MMR
    explain.ts        "why this matched" strings
    itinerary.ts      slot-wise selection
  eval/
    personas.yaml     hand-written personas with graded relevance
    run.ts            all metrics for all candidate configs -> eval/report.md
  web/                Vite + vanilla TS, embedding in a Web Worker
```

`core/` has no dependencies on the DOM or Node, so it's unit-tested once and imported by both `eval/` and `web/`.

## 4. Offline enrichment (Claude)

For each record, one Claude call (model `claude-opus-5-5`, structured output via tool use) returns:

| field | type | notes |
|---|---|---|
| `core_claim` | string, 25 words max | our paraphrase, shown in the UI |
| `discipline` | one of: neuroscience, physics, biology, philosophy, psychology, contemplative/experiential, anomalous/psi research, AI/computation, arts/humanities, medicine/clinical | primary only |
| `methods` | subset of a fixed list: EEG/MEG, fMRI, other imaging, anesthesia, psychedelics, meditation, phenomenology/first-person, survey/questionnaire, formal/mathematical model, computational simulation, lab physics/biophysics, animal study, clinical, theoretical argument, case reports, art/practice | |
| `axes` | per axis: score from -2 to +2, or `null` when the abstract takes no position | see below |
| `concepts` | 3 to 6 short key phrases | used for explanations |
| `ask_question` | one sentence | an open, friendly question for the presenter |
| `challenge_question` | one sentence | a respectful question a skeptic of their position would ask |

**Stance axes (v0, four of them),** written neutrally and phrased as what the abstract *emphasizes*, not as a judgment of the person:

1. **Ontology:** consciousness as produced by physical processes (-2) ↔ consciousness as fundamental or non-physical (+2)
2. **Mechanism:** classical neural/computational accounts (-2) ↔ quantum or biophysical-field accounts (+2)
3. **Evidence mode:** empirical/experimental (-2) ↔ conceptual/theoretical (+2)
4. **Scope:** consciousness confined to brains and organisms (-2) ↔ extended, nonlocal or transpersonal phenomena (+2)

The prompt includes anchor examples for each axis and asks for `null` rather than guessing. Results are cached by content hash and committed, so the build is reproducible without re-calling the API.

**Label quality check:** Tim and/or Mason independently label 30 randomly sampled records on the four axes using the same rubric. We report per-axis agreement with Claude (Spearman correlation on items both treated as non-null, and agreement on null vs. non-null). An axis with Spearman below 0.6 is shown in the UI as a manual slider only, never auto-inferred, and never used for "opponents."

## 5. The matching algorithm

### 5.1 Inputs

- `q_text`: free text. Interests in a sentence, a list of keywords, or a pasted abstract of the user's own.
- Optional stance sliders, one per axis: values -2 to +2, or "no opinion."
- Optional filters: days attending, presentation types, methods.

### 5.2 Topic relevance r(q, d)

- **Dense:** cosine similarity between the query embedding and the document embedding. The document text is `title + ". " + abstract`. Abstracts run up to about 700 tokens and most small models stop at 512, so the evaluation compares (a) truncation with (b) splitting into chunks of about 256 tokens and mean-pooling them.
- **Lexical:** BM25 over title + abstract + concepts, with light stemming. It catches exact named entities like "Orch OR," "IIT," "DMT" or "Hameroff."
- **Hybrid:** `r = α · z(dense) + (1 - α) · z(bm25)`, z-normalized within each query, with α chosen by evaluation. Reciprocal rank fusion is evaluated as an alternative.
- Candidate models (all must run quantized in the browser, at 40 MB or less): `Xenova/all-MiniLM-L6-v2`, `Xenova/bge-small-en-v1.5`, `Xenova/gte-small`, plus a domain-tuned option if one exists in ONNX. **The winner is chosen by the evaluation, not by preference.**

### 5.3 User stance u

1. If the user set sliders, those values are used directly for those axes.
2. Otherwise, for each **validated** axis (section 4), we project: `u_a = w_a · e_q + b_a`, where `(w_a, b_a)` is a ridge regression fit on document embeddings against Claude's axis scores (non-null only), with λ chosen by 5-fold cross-validation. We publish the CV R² and Spearman for each axis. An axis whose CV Spearman is below 0.5 isn't auto-projected, and only the slider is offered.
3. We also project the user onto the 2D map: `pos(q)` = the average of the layout coordinates of the top-8 dense neighbors, weighted by similarity. UMAP itself can't transform new points in the browser, so this is the deliberate substitute.

### 5.4 Stance distance s(u, d)

Computed over the axes where both `u_a` and `d_a` are non-null (A = that set):

`s = sqrt( Σ_{a∈A} (u_a - d_a)² / |A| ) / 4`, which lies in [0, 1].

If |A| = 0, s is undefined. Such a document can be kindred on topic alone, but it can never be an opponent.

### 5.5 Lists

Let `R` be the top 40 documents by r. Let `τ` be the r value at rank 15 for this query, an adaptive threshold for "on topic."

- **Kindred (show 8):** rank R by `k = r_norm - β · s` (with s = 0.5 when undefined), then apply MMR diversification: `argmax λ·k(d) - (1 - λ)·max_{d'∈picked} cos(d, d')`, with λ = 0.7 to start. This stops the top 8 being near-copies of each other.
- **Worthy opponents (show 4):** candidates are documents with r ≥ τ, s defined and |A| ≥ 1. Rank them by `o = s · r_norm`, and require s ≥ 0.35 so "opponent" means real disagreement. If fewer than 2 qualify, the section says so honestly rather than padding the list.
- **Serendipity (show 1):** among documents whose `discipline` differs from the most common discipline in the kindred list, pick the one with the highest r, as long as r ≥ the 70th percentile of r over the whole corpus for this query. In other words, it's an adjacent idea from a different field.
- β, λ, τ's rank, and the opponent s floor are config values tuned in evaluation. They're never hard-coded in more than one place.

### 5.6 Explanations

For each match, we show up to three short reasons:
- **Shared concepts:** the document's `concepts` whose embedding similarity to the query is at least θ (concept embeddings are precomputed), or which appear literally in the query.
- **Stance:** for each axis in A, "you both lean toward X" when |u_a - d_a| ≤ 1, and "they lean toward X, you lean toward Y" when |u_a - d_a| ≥ 2.
- **Method overlap,** when the user filtered by methods.

Each match also shows its icebreaker: `ask_question` for kindred and serendipity, and `challenge_question` for opponents. Users see that both questions were AI-drafted and should be treated as starting points.

## 6. Itinerary (approach C)

The official schedule only publishes session blocks, so the itinerary is built from **slots**:

| slot type | when | options |
|---|---|---|
| Workshop slots | Sun Oct 11, several parallel blocks | each workshop is an option |
| Plenary blocks | mornings, single track | one option per block, so no conflict |
| Concurrent slots | Mon to Thu, 5:00 to 7:05 pm | 6 or 7 parallel themed sessions |
| Poster sessions | Tue and Wed, 7:30 pm | one session; output is a ranked visit list of N posters |

- **Session score:** `S(session) = max_t r(t) + 0.5 · mean(top-3 r(t))` over the talks in that session, using kindred-adjusted scores so a stance preference counts.
- **Selection:** slots don't constrain each other (there's no travel time or capacity in v0), so the best conflict-free plan is simply the highest-scoring option in each slot the user attends. We document this choice rather than reach for a solver. If we add constraints later (for example "don't pick the same theme three nights running" or "attend Mason's talk"), selection moves to a small dynamic program over the ordered slots.
- **Pins:** the user can pin or unpin any session or poster. Pins override the automatic choice for that slot.
- **Poster route:** the top 10 posters by kindred score for each poster session. Once board numbers are published they'll be sorted by board number; until then they're sorted by score.
- **Output:** a day-by-day plan in the UI, export to `.ics`, and a shortlist stored in `localStorage` (wrapped in try/catch, so the app works without it).

## 7. Evaluation (what Codex reviews)

All metrics come from `eval/run.ts` across a grid of configurations (model × chunking × fusion × α), written to `eval/report.md` with the winning config highlighted.

**E1: session recovery.** For each of the 119 concurrent talks, the talk's own title and abstract is the query, with the talk itself removed from the results. Relevant items are the other talks in the same organizer session. Metrics: MRR, Recall@10, nDCG@10. This is a weak label (sessions are also shaped by logistics), so it's used for *comparing* configs, not as an absolute claim. We report mean ± bootstrap 95% confidence intervals.

**E2: personas.** About 20 hand-written attendee personas (for example "anesthesiologist curious about microtubules," "Buddhist practitioner skeptical of panpsychism," "ML engineer wondering about LLM consciousness") with graded relevance labels (0/1/2) on a candidate pool. **To avoid circularity, labels are assigned by reading titles and core claims *before* any system's results are viewed for that persona.** The pool is the union of top-20s from every config plus 10 random documents, labeled blind to which config surfaced them. Metric: nDCG@10.

**E3: stance validity.** Agreement between Claude and humans per axis (section 4). Embedding-to-axis cross-validation R² and Spearman per axis (section 5.3). These numbers decide which axes are auto-inferred.

**E4: list sanity.** For 10 personas, a human reviews the opponent and serendipity picks and marks each as sensible, weak or wrong. Target: 70% or more sensible. Problems found here drive changes to β, the opponent floor and the serendipity percentile.

**Baselines:** TF-IDF cosine and BM25 alone. The shipped config must beat BM25 on both E1 and E2, with non-overlapping confidence intervals on at least one of them.

**Tests:** unit tests for `core/` (BM25, fusion, MMR, stance distance with null axes, threshold edge cases, slot selection with pins), and a parity test checking that the browser worker and the Node evaluation produce identical rankings for fixed query fixtures.

## 8. Web app (v0)

- **One screen:** a text box ("What draws you to consciousness research?"), example chips, a collapsible "My stance" panel with sliders, and filters. Results appear in three titled columns (Kindred, Opponents, Serendipity), followed by "My week" (the itinerary) and the map.
- **Map:** all 293 items as dots colored by discipline, the user as a "you are here" marker, and hover to see the title. Rendered with plain canvas or SVG, no heavy charting library.
- The embedding model loads lazily in a Web Worker with a progress bar. A cold load of about 25 to 35 MB is cached by the browser afterwards. There's a lexical-only fallback if the model fails to load.
- **Privacy:** no analytics beyond, at most, a privacy-respecting page counter. Queries never leave the device. The page says so.
- Accessible: keyboard navigable, works with reduced motion, readable on phones (most use will be on phones at the venue).
- **Hosting:** a static host. The exact domain is an open question (section 10).

## 9. Timeline

| date | milestone |
|---|---|
| Sun Oct 4 | spec approved, implementation plan written |
| Mon Oct 5 | pipeline: scrape, parse, schedule, enrich, embed |
| Tue Oct 6 | core/ + evaluation harness; personas drafted and labeled |
| Wed Oct 7 | evaluation run, config chosen, **Codex review** of core/ + eval/ |
| Thu Oct 8 | web app and itinerary |
| Fri Oct 9 | polish, courtesy note to organizers, deploy, Discord post |
| Oct 11 to 16 | use at TSC; hackathon v1: attendees opt in and are matched people-to-people |

## 10. Open questions for Tim

1. Name and URL: "TSC Compass" at a subdomain of timbeach.com, on GitHub Pages, or somewhere else?
2. Credit Mason as co-author, and/or feature their talk as an example?
3. Who does the 30-record stance labeling and the persona labels (Tim, Mason, or both)? About 1 to 2 hours in total.
4. Public repo from day one (good for hackathon collaboration), or private until launch?

## 11. Risks

- **Presenters may object to how their work is labeled on an axis.** Mitigations: neutral wording ("emphasizes"), labels shown as leanings rather than verdicts, the human validation gate, a correction/removal contact, and the option to hide axis badges entirely if feedback is negative.
- **The program changes before or during the conference.** A re-scrape takes one command, and the UI shows the data date.
- **The model is slow on phones.** Lexical fallback, a small model and a cached load.
- **Over-fitting the weights to 20 personas.** Tune on E1 plus half the personas; report E2 on the held-out half.
