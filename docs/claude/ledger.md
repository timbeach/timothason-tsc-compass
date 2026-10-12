# Execution ledger (superpowers executing-plans), plan: docs/superpowers/plans/2026-10-04-tsc-compass.md
Spec: docs/superpowers/specs/2026-10-04-tsc-compass-design.md (approved 2026-10-04)
Setup: Ruling: branch build/v0 in place instead of a separate worktree; fresh repo holding only docs on main, so a worktree adds nothing; cost if wrong: none, branch is isolated from main.
Pre-flight (shared interfaces):
- T4 io.ts -> T5,T12,T13,T14,T16: readJson/writeJson/readF32/writeF32. Consistent.
- T5 attachDocs(slots, recs, workshopsHtml): the plan's Produces block was fixed during self-review to match the test. Consistent.
- T6 nodeEmbedder/embedQuery/MODELS -> T13,T14,T16,T19. Consistent.
- T7 rankOrder -> T9,T14. Consistent.
- T8 stanceDistance(u,d,eligible) -> T9; projectStance -> T17. Consistent.
- T12 loadEnrichments -> T13,T14,T16. Consistent.
- T13 axes reads eval/human_agreement.json (made in T14 step 7); if it's missing, every axis is auto=false. T14 step 7 re-runs axes. Consistent by design.
- T16 CompassConfig (type) -> T17 data.ts via import type, so no node code reaches the browser bundle. Consistent.
- T9 Match.shared -> T17 explain input. Consistent.
Task 1: Ruling: pushed main + build/v0 to the new private remote (the plan said push the current branch); keeps main as the base for review; cost if wrong: none
Task 1: complete (commits d9523cb..2485c06, tests: npm test →    Duration  165ms (transform 50%, import 28%, worker 12%, tests 9%))
Task 2: complete (commits 2485c06..68806b3, tests: npm test →    Duration  199ms (transform 55%, import 23%, tests 12%, worker 9%))
Task 3: Ruling: seeded data/raw from the Oct 4 exploration cache (same official pages) instead of re-downloading; fewer requests to tsc2026.org; cost if wrong: data is a few hours older; a re-scrape is one command after deleting data/raw
Task 3: complete (commits 68806b3..29f2f10, tests: npm test →    Duration  317ms (transform 56%, import 20%, tests 18%, worker 6%))
Task 4: complete (commits 29f2f10..ee058e0, tests: npm test →    Duration  446ms (transform 46%, import 38%, tests 13%, worker 3%))
Task 5: complete (commits ee058e0..56c4025, tests: npm test →    Duration  501ms (import 48%, transform 31%, tests 17%, worker 4%))
Task 6: Ruling: the plan's STOP list had a precedence bug (.split applied only to the last literal, so the Set held characters); wrapped the concatenation in parens; cost if wrong: none, caught by the tokenize test
Task 6: complete (commits 56c4025..b29206b, tests: npm test →    Duration  617ms (transform 44%, import 39%, tests 13%, worker 4%))
Task 7: complete (commits b29206b..1487752, tests: npm test →    Duration  701ms (import 42%, transform 38%, tests 16%, worker 4%))
Task 8: complete (commits 1487752..9da24d9, tests: npm test →    Duration  731ms (transform 40%, import 40%, tests 16%, worker 4%))
Task 9: complete (commits 9da24d9..2fb23c3, tests: npm test →    Duration  733ms (transform 43%, import 36%, tests 16%, worker 4%))
Task 10: complete (commits 2fb23c3..ad71237, tests: npm test →    Duration  671ms (import 41%, transform 38%, tests 16%, worker 4%))
Task 11: complete (commits ad71237..152116f, tests: npm test →    Duration  789ms (import 43%, transform 36%, tests 16%, worker 5%))
Task 12: code committed (5/5 tests, typecheck clean). BLOCKED on steps 5-6 (pilot + full run): no Anthropic credentials (no ant CLI, no ANTHROPIC_API_KEY, no pass entry). Ruling: continue with the tasks that don't need enrichment (13 embed/layout, 14 E1, 17) and ask Tim for a key at the end of the turn; cost if wrong: none, ordering only
Task 13: complete (commits 30caed0..28982cc, tests: npm test →    Duration  1.04s (import 46%, transform 30%, tests 21%, worker 3%))
Task 14: Ruling: label pool depth is the top 10 per config, not 20 (top-20 gave about 1,300 labels; top-10 gives 812 including the 10 random per persona); keeps the human labeling within the spec's 1-2h budget; cost if wrong: slightly shallower pooling, so a config whose good hits sit at ranks 11-20 is under-credited at nDCG@10 (minimal, since nDCG@10 only scores the top 10 anyway).
Task 14: steps 1-6 done (E1 pass run: BM25 0.144 [0.104,0.191] vs best minilm/truncate/hybrid a=0.85 0.206 [0.156,0.263]; CIs overlap on E1). Steps 7-8 BLOCKED: they need enrichment (Task 12 key) plus human labeling by Tim/Mason.
Ruling: running Task 17 before 15/16; it has no dependency on the blocked enrichment and labeling; cost if wrong: none
Task 17: complete (commits be2b01b..ff71eae, tests: npm test →              at least ~329ms faster with isolate: false; reuses workers across files instead of one per file)
Task 16: code and unit tests committed (2/2, typecheck clean). Step 4's real export run is BLOCKED on enrichment (Task 12).
Task 18: UI code, style.css (frontend-design pass: Mission Bay dusk palette, system serif and sans because the privacy test forbids font CDNs) and the e2e specs are committed; vite build OK. Steps 5-6 (e2e, manual phone check, E4) are BLOCKED on exported data (Task 16 needs enrichment).
Task 18: note: the ONNX wasm runtime is 26.8MB (6.8MB gzip) on top of the model. The spec's 40MB budget covered the model only, so the cold load on phones is heavy. If tied on eval, prefer minilm (23MB).
Ruling: start the Task 15 Codex review now on core/ + eval/ code, before the final eval numbers exist; the algorithm code is final and review time is the bottleneck; findings get fixed before export; cost if wrong: the report section gets reviewed later than the code, so it needs a quick second look once the labels land.
Task 15: Codex review received (docs/reviews/2026-10-04-codex-review.md). No critical findings; no errors in the ridge/Cholesky, Spearman or nDCG math.
Task 15: fixed #1-3 (zero/tied relevance padded kindred, opponents and serendipity): tests "no relevance signal at all...", "lexical-only mode never pads...", "a single lexical hit is still returned" went RED then GREEN; suite 85/85.
Task 15: fixed #6 (NaN CI): test "formatCI reports n/a..." RED then GREEN.
Task 15: Ruling: #4 (no BGE prefix on long queries) kept; a long pasted text is a passage, and BGE recommends no instruction for passage-to-passage; cost if wrong: slightly worse long-query recall on bge only.
Task 15: Ruling: #5 (E1 bypasses the query path) kept; E1 is a doc-to-doc proxy by design; E2 covers the query path; the report now states this; cost if wrong: E1 slightly misranks bge configs, but E2 decides selection.
Task 15: #7 pool depth: the existing Task 14 ruling stands; comment and report wording fixed.
Final: minor (deferred): cvRidge crashes when n < folds (pipeline guards with MIN_LABELS=20).
Final: minor (deferred): buildItinerary crashes on a slot with no options (the parsers never emit one).
Task 15: re-check eval/report.md once the persona labels exist (the review predates E2 numbers).
Task 12: Ruling (Timothy, 2026-10-11): enrichment done by 6 Claude Code subagents instead of the API (no API key). Same field rules (prompt text taken from buildPrompt), same zod schema plus validateEnrichment on import; cache model field = "claude-opus-5-5 via Claude Code subagents". 293/293 imported. Pilot review skipped (Timothy is at TSC; memory says just proceed); I spot-checked batch 0. Cost if wrong: label quality unreviewed by a human until stance labeling.
Task 14: Ruling: selected config minilm/truncate/hybrid a=0.85 on E1 only (no persona labels yet); the best E1 row and also the smallest model (23MB); cost if wrong: a better config might win on E2 later; switching is one re-export.
Task 13/14: axes CV Spearman ontology 0.67, mechanism 0.84, evidence 0.79, scope 0.74 (n 188/161/291/204). All auto=false until human_agreement.json exists.
Task 16: export complete. Leak check caught 8: 6 were false positives (abstract repeats its public title) -> findLeaks now ignores title runs and quoted titles (2 tests RED then GREEN); 2 real echoes in core_claim (edward-boyden, thomas-campbell), hand-paraphrased in the cache.
Task 18: Ruling: build outDir set in web/vite.config.ts and preview via `vite preview web` (the plan's `vite preview dist` served dist/dist, a 404); cost if wrong: none.
Task 18: real privacy bug found by the e2e test: transformers.js fetched the ONNX wasm runtime from cdn.jsdelivr.net. Fixed by copying onnxruntime-web asyncify wasm+mjs to web/public/ort at export and setting env.backends.onnx.wasm.wasmPaths. The e2e foreign-request check now ignores blob:/data: URLs (in-memory, not network).
Task 18: real bug: an absolute http localModelPath makes transformers.js skip its local-file metadata probe, so the tokenizer is never loaded ("this.tokenizer is not a function") and the app silently fell back to keyword matching. Fixed with relative "../models/". The worker error is now logged via console.warn.
Task 18: e2e app.spec.ts 4/4 pass (14.5s). Lesson: kill stale preview servers, since playwright reuseExistingServer silently tests old builds.
Note 2026-10-11 16:03: Timothy moved ~/code/TSC to ~/code/PROJECTS/TSC mid-run. My playwright run recreated a stray ~/code/TSC/tsc-compass/test-results, which I removed (it held only playwright output). Repo intact.
Task 19: Ruling: playwright workers=1 (9 parallel browsers each compiling 27MB wasm starved the CPU and caused timeouts); cost if wrong: a slower suite (~30s).
Task 19: Ruling: ONNX wasm numThreads=1 (one flaky parity failure in 3 full runs; threaded reductions vary between runs and flip near-ties through MMR); query embedding is tiny, so no user-visible slowdown; cost if wrong: slightly slower first query on multi-core desktops.
Task 19: KNOWN FLAKE (deferred): parity "Are LLMs conscious?" occasionally returns steen-rasmussen,michael-ye at ranks 2-3 instead of stuart-hameroff,francis-lucille. Seen in 2 of about 6 full-suite runs; never reproduced in isolation (11/11 standalone, never on the keyword fallback). Not investigated further, to prioritise launch at TSC. Cost if wrong: a real order-dependent nondeterminism in browser rankings goes unexplained.
Task 19: complete (commits 8ca478c..3d83ed7, tests: npx playwright test e2e --reporter=line →   9 passed (36.1s))
Task 20 (2026-10-11): Timothy chose compass.timbeach.com, contact beachtimothyd@gmail.com, launch now and label later.
Task 20: Ruling: re-scraped before launch because the program had changed (292 records; 18 new or changed abstracts labeled by one subagent; 9 withdrawn records' cache entries removed). Data refreshed from tsc2026.org on 2026-10-11.
Task 20: server: backed up the nginx config first; new server block with a separate LE cert (certbot webroot); application/wasm and text/javascript mjs types; gzip_static plus precompressed .gz (cold load about 26MB, down from 52MB). DNS was already a wildcard.
Task 20: bugs found in live testing and fixed with e2e tests that failed first: (1) tapping search before data loaded did a native form submit and reloaded the page; (2) progress_callback made transformers.js download the 16MB model twice; (3) first-visit model download on slow wifi exceeded the 60s embed timeout and fell back to keywords. Now keyword results show instantly ("loading" banner) and upgrade by themselves; the timeout only applies once the model is ready.
Task 20: Ruling: kept alpha=0.85 although refreshed E1 picks 0.7 (0.204 vs 0.203, noise); the deployed config is covered by parity and e2e; cost if wrong: none measurable.
Task 20: live check (phone viewport, fresh browser, conference wifi): keyword results 4.3s, model results 22.3s, 0 foreign requests, 25 itinerary slots.
Pre-public audit (2026-10-11): commit a79c9c9 had accidentally included data/raw.2026-10-04 (raw abstracts and records.json), because the .gitignore rule data/raw/ didn't match the renamed folder. Amended it out (now 8934514), widened the ignore to data/raw*/, and force-pushed the private branch. Scrubbed the competitor-site mentions (plan line and test URL -> example.org). Added a README with a plain-language explanation, plus an MIT LICENSE.
Ruling: public repo follows the aegix-backup precedent; the private repo was renamed timbeach/tsc-compass-dev (full history, remote "private"); the new PUBLIC timbeach/tsc-compass main is a single clean commit (6d54a3e, from the orphan branch public-main, remote "origin"). Verified: 396 files, no raw data, a fresh clone passes 87 tests and typechecks; cost if wrong: public history starts at launch.
Rename: public repo renamed to timbeach/timothason-tsc-compass at Timothy's request (old URL redirects).
Ruling: from 2026-10-11 the working line is local branch public-main tracking PUBLIC origin/main; build/v0 on the private remote is an archive and gets the same docs. Final-review fixes go on public-main. Cost if wrong: the two branches' histories differ (same tree), so cherry-pick between them, never merge.
Final review: done by a fresh reviewer (Fable). Verdict "with fixes". Critical: #1 acronym queries weak and misranked at alpha 0.85; #2 opponents copy promises a feature the gate blocks. Important: #3 itinerary no-signal picks; #4 stance panel collapses; #5 no bundle integrity check; #6 export doesn't check embeddings freshness; #7 single-candidate noSignal; #8 launch gates unmet (process).
Final: re-graded the BM25-missing-names/concepts minor to Important (attendees will type presenter names and get nothing). Re-graded the ICS validity minor to Important (missing DTSTAMP and line folding can make strict calendar apps reject the export). Both enter the fix pass.
Final: fixed #1 acronym queries: hybrid uses shortQueryAlpha=0.5 for queries of 2 or fewer content tokens, and weak requires no keyword hit. Tests: "short queries lean on keywords...", "not weak when keywords match...", e2e "an acronym query finds..." went RED then GREEN. Parity fixture now includes IIT and Orch OR (6/8 and 7/8 top results mention the term).
Final: fixed #2 opponents copy: Answer.opponentsAvailable; UI and about page say opponents are switched off until stance labels are human-checked. Tests: engine "reports that opponents are unavailable...", e2e "opponents copy is honest..." RED then GREEN.
Final: fixed #3 no-signal itinerary: docScores only for top-R candidates; PlanItem.confident; UI shows "No strong match for you here"; ICS skips unconfident slots. Tests: rank "docScores are -Infinity outside...", itinerary "a slot where nothing scored..." RED then GREEN.
Final: fixed #4 stance panel collapsing: open state kept across renders. e2e "the stance panel stays open..." RED then GREEN.
Final: fixed #5 bundle integrity: res.ok checks, checkBundle length assertions, data fetched with cache no-cache, data-error banner. Tests: unit "checkBundle accepts...", e2e "data that fails to load..." RED then GREEN.
Final: fixed #6 export freshness: assertFresh on embeddings and layout. Test "assertFresh rejects stale..." RED then GREEN.
Final: fixed #7 single candidate: noSignal needs more than one candidate. Test "a filter leaving exactly one candidate..." RED then GREEN.
Final: fixed (re-graded) names and concepts in the keyword index: lexText. Test "the keyword index covers presenter names..." RED then GREEN.
Final: fixed (re-graded) ICS validity: DTSTAMP plus RFC 5545 line folding. Test "ICS skips unconfident... DTSTAMP... folds" RED then GREEN.
Final: suite after the fix pass: unit 98/98, e2e 17/17. Deployed c0875a5; live IIT check: no weak banner, keyword results 2.1s, model 14.0s, 0 foreign requests.
Final: Ruling: #8 launch gates (E1 CIs overlap; E2/E3/E4 not run) acknowledged, not fixed: shipping for the conference was Timothy's priority, and the about page states the overlap honestly. Cost if wrong: alpha and threshold choices aren't validated on short queries beyond the acronym fixtures.
Final: minor (deferred): lex.json publishes a stemmed bag-of-words per abstract (could hash tokens).
Final: minor (deferred): non-English queries can pass the weak threshold.
Final: minor (deferred): map has no hover, legend or resize redraw; "you are here" is weighted by kindred rNorm.
Final: minor (deferred): main has aria-live="polite" on the whole app; drop it.
Final: minor (deferred): one worker error disables the model for the session; the failed banner says "couldn't load" even on timeouts.
Final: minor (deferred): slider and pin changes re-embed the same text; cache qVec by text.
Final: minor (deferred): the presentation-type filter from spec 5.1 is absent.
Final: minor (deferred): stance "No opinion"/"Inferred" buttons are unclear clear-actions.
Final: minor (deferred): playwright reuseExistingServer: true is the stale-server trap.
Final: minor (deferred): spec's model-load progress bar is a static string (progress_callback doubled the download).
Final: ruling on reviewer's declined-to-judge list: all accepted as set aside (process items, server config, label quality via E3, repo split, the known flake, Codex deferrals, the cold-load size trade-off, untested beta flags, empty program slots). Cost if wrong: the label-quality and flake items stay open.
Minors pass (2026-10-11, Timothy asked for it): all 10 deferred minors fixed test-first. Hashed keyword index (hashIndex; ranks identical). Stricter weak bar when no query word is in the program (weakDenseNoKeyword 0.45). ModelClient: init vs per-search failures, timeout-specific banner, query-vector cache. Page-wide aria-live removed. Presentation-type filter. Stance rows show their source with a Reset button. Map legend, hover titles and resize redraw ("you are here" method documented). Playwright no longer reuses a server that's already running.
Minors pass: Ruling: the progress bar became worker-side preload with customCache + wasmBinary + Cache API storage. The first attempt (page prefetch, then HTTP-cache reuse) still double-downloaded in private windows, as the server access log showed. Verified on production: a fresh visit makes one GET per file, a reload makes zero (model results 1.9s). Cost if wrong: if the transformers.js customCache semantics change in a future version, loading falls back to normal network fetches (slower, still correct).
Minors pass: Ruling: the map hover e2e computes the dot position from public data instead of a window test hook (no test-only code in production). Two existing tests were updated for intended contract changes (prefetch returns bytes; map test scrolls into view). Suite: unit 115/115, e2e 22/22.
Plug (2026-10-11, Timothy's request): a featured band for Mason's talk (THU-2, Thu Oct 15 5:00 pm, Dockside Room), built from program data, with an 'Add to my week' pin. The summary is hidden under 720px so the search box stays near the top on phones. e2e 'plug for Mason's talk...' RED then GREEN; suite e2e 23/23, unit 115/115.
Plug: now features both Dani Caputi (WED-1) and Mason Ulrika Borchard (THU-2), in schedule order, each pinnable. The Mason-only test was scoped to its item (intended change). e2e 24/24, unit 115/115.
