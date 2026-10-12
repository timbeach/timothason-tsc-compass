# CLAUDE.md: context for AI coding sessions on TSC Compass

Read this first. It's the hand-off for Claude Code (or any agent) picking up this repo. Humans: start with README.md.

## What this is

An unofficial, static, browser-only matcher for The Science of Consciousness 2026 (San Diego, Oct 11 to 16). It's live at https://compass.timbeach.com. Built by Timothy Beach, and hacked on with Mason during the TSC hackathon (pitch gate Tue Oct 13 12:00 PST, demos Oct 15). Mason uses they/them pronouns.

The deeper record:
- `docs/superpowers/specs/2026-10-04-tsc-compass-design.md`: the design spec. Binding for behavior.
- `docs/superpowers/plans/2026-10-04-tsc-compass.md`: the 20-task build plan the code was written from.
- `docs/reviews/2026-10-04-codex-review.md`: the Codex review of core/ and eval/, and how each finding was resolved.
- `docs/claude/ledger.md`: the execution ledger. Every deviation from the plan is a "Ruling:" line with its cost if wrong.
- `docs/claude/session-history.md`: running notes from the build sessions.

## Architecture in one breath

`pipeline/` (Node, build time) scrapes tsc2026.org, enriches each abstract once with Claude (summary, discipline, methods, concepts, 4 stance axes, two questions), embeds with transformers.js (Xenova/all-MiniLM-L6-v2, q8), fits gated ridge stance projections, computes a UMAP layout, and exports `web/public/data`. `core/` is the pure TypeScript engine (BM25 + dense hybrid, stance, MMR ranking, explanations, itinerary/ICS, and `survey.ts` for the intake answers: goal presets, discipline affinity, streamed-room detection), shared by `eval/` and `web/`. `web/` is Vite + vanilla TypeScript; the model runs in a Web Worker. The intake is a seven-step survey (`web/src/ui/survey.ts`): step 1 is the free-text box (`#q`, still enough on its own), then stance, goal, fields, methods, logistics (types, days left, Zoom-only, posters, vary evenings) and must-sees. Up to three interests are embedded separately and fused by max (`relevanceMulti`). Survey answers persist in localStorage under `survey`.

Data flow: `data/raw/` (gitignored scrape) -> `data/raw/records.json` -> `data/build/{slots.json, enrichment/*.json (committed), emb/*.f32 (gitignored), axes.*.json, layout.*.json}` -> `web/public/data/*` (gitignored, built by `npm run export`).

## Commands

```bash
npm test                    # vitest unit tests, 87 or more, must stay green
npm run typecheck
npm run build && npm run e2e   # Playwright; workers=1 on purpose
npm run scrape && npm run parse && npm run schedule
npm run embed               # all 3 candidate models x 2 chunkings (~3 min CPU); MODEL=minilm for one
npm run axes -- minilm__truncate && npm run layout -- minilm__truncate
npm run export              # fails loudly on missing/stale enrichment or abstract text leaking
npm run eval                # writes eval/report.md; `-- --select` rewrites config/compass.json
npm run label:stance        # human stance labels (30 abstracts) -> unlocks opponents
npm run label:personas      # blind persona labels -> E2 evaluation
```

Deploy (Timothy has server access): `npm run export && npm run build`, then `gzip -kf9` every file over 100 KB in `dist/`, then rsync `dist/` to the compass web root with `--delete`. The server serves the `.gz` files via `gzip_static` and has explicit `application/wasm` and `text/javascript` (`.mjs`) types.

## Rules of the house

- **Only official data:** scrape https://tsc2026.org/ only, politely and cached. Never use other attendee or third-party sites.
- **Never republish abstracts:** the public bundle has titles, names, sessions, our own one-line `coreClaim`, and links to the official pages. `findLeaks` in `pipeline/export.ts` enforces this. Raw scrapes stay gitignored (`data/raw*/`). Keep it that way.
- **Privacy is a product feature:** queries never leave the browser, and there are zero third-party requests. The e2e test "no requests leave the origin" guards it.
- **Stance axes are gated:** an axis is only auto-inferred, and only drives "worthy opponents", when human agreement Spearman is at least 0.6 (`eval/human_agreement.json`) and CV Spearman is at least 0.5. As of launch no human labels exist, so opponents are off.
- **TDD:** write a failing test first, watch it fail, then fix. Bugs get a regression test.
- **Writing style:** no em dashes or en dashes as punctuation, anywhere (code comments, commits, docs, UI copy). In code, match those characters in data with the escapes backslash-u-2014 and backslash-u-2013, never the literal characters.
- **Commits:** no `Co-Authored-By` or AI attribution trailers.
- Timothy prefers to be called Timothy.

## Gotchas we already paid for

- **transformers.js `env.localModelPath` must be relative** (`"../models/"`). With an absolute http URL it skips its local-file probe, never loads the tokenizer, and fails with `this.tokenizer is not a function`. The app then silently falls back to keyword search.
- **Set `env.backends.onnx.wasm.wasmPaths`** to the self-hosted `ort/` folder, or it fetches the runtime from a public CDN. The export copies those files.
- **Model loading lives in the worker (`preload` in `web/src/worker.ts`):** it streams the .onnx and .wasm once with byte progress (sizes come from `meta.modelFiles`), stores them in the `transformers-cache` Cache API entry for return visits, and hands the bytes to transformers.js via `env.customCache` and to onnxruntime via `wasmBinary`. Don't pass `progress_callback` to `pipeline()` (it GETs every file in full just to learn its size), and don't rely on the HTTP cache to dedupe (private windows use a small in-memory cache). Verify with the server access log: one GET per file on a first visit, none on reload.
- **ONNX wasm `numThreads = 1`:** threaded reductions vary between runs and flip near-tied rankings through MMR.
- **Attach form handlers before awaiting data,** or an early tap does a native submit and reloads the page.
- **Slow first visit:** keyword results render instantly with a "loading" banner, then upgrade when the model is ready. The embed timeout only applies once the model is loaded.
- **Playwright `reuseExistingServer` silently tests a stale preview server:** kill old `vite preview` processes first. Use `pgrep -f '[v]ite preview'`, because an unbracketed pattern matches, and kills, your own shell.
- **`vite preview web`, not `vite preview dist`** (the outDir is set in `web/vite.config.ts`).
- **Enrichment cache entries are keyed by a hash of title + abstract.** After a re-scrape, `loadEnrichments` lists exactly which records need relabeling. Launch labels were made by Claude Code subagents, not the API, with the same schema and validation.

## Open work (as of 2026-10-11)

- Human stance labels (`npm run label:stance`) to switch on opponents, then re-run `npm run axes`, export and redeploy.
- Persona labels (`npm run label:personas`, about 80 min, splittable) for the E2 evaluation.
- Streaming: the official program attaches the Zoom link to the session (`a.zoom-link` beside the room link), not to talks. `pipeline/schedule.ts` keeps the real room and sets `SlotOption.streamed` and `zoomUrl`; "Zoom only" filters via `streamedDocIds(slots)`. Never infer streaming from room text.
- Worker messaging goes through `web/src/model-client.ts` (load vs per-search failures, timeout only once ready, query-vector cache). Test it with the fake worker in `tests/web/model-client.test.ts`.
- Known flake: the parity test for "Are LLMs conscious?" occasionally differs at ranks 2 to 3 in full-suite runs only, and never in isolation. Unexplained.
- Hackathon ideas: attendee-to-attendee matching (opt-in profiles), a live room map, a better stance UI.
- Survey follow-ups: the discipline affinity weight (0.15) and the vary-evenings penalty (a quarter of the score spread) are reasoned defaults, not evaluated ones; `affinityWeight` can be set in `config/compass.json` once there is a persona set to tune it on. DOM unit tests use jsdom (`// @vitest-environment jsdom` per file).
