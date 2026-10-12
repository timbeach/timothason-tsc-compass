# Session history (Claude Code status docs)

Running notes Claude Code kept while building TSC Compass with Timothy, lightly redacted for a public repo. Newest at the bottom. The execution ledger with every ruling is in `ledger.md`.

## Session notes from 2026-09-23
## Updates


## TSC Hackathon kickoff
- 16:00 Mason pinged user in TSC Discord about doing the hackathon together. Discord message not yet pasted into session; waiting on it.
- 16:00 Skimmed ionosphere repo (QRNG to light/sound, mind-matter interaction research; Mason actively committing: live-stream frame tee, focus_session column, UTC clock on visualizers).
- 16:05 Got the hackathon brief: drop-in, BYOT, collaborative. Gates: pitch Tue Oct 13 12:00 PST, midway check Wed Oct 14 12:00 PST, demos Oct 15, archive Oct 16. Existing projects welcome. ~18 days of prep time from today.
- 16:05 Brainstorming (architectural path, since it's a new project). Next step: pin down the user's intent and their role alongside Mason.
- 16:08 User's main goal: networking/visibility with Mason and TSC folks. Scope matters less. So: keep it light and easy to drop into, and something that sparks conversations.
- 16:10 User will be in person all week, so a physical, in-the-room project is on the table.
- 16:15 Mason (they/them) proposed doing the hackathon together, with no idea attached yet. This session is early, pre-event brainstorming. Ionosphere is optional: the user's role there is minor.
- 16:20 Pitched 5 idea directions: (1) find-your-people map of TSC abstracts, (2) live argument map, (3) room-split poll, (4) Claude Code helper station, (5) ambient ionosphere piece. Recommended 1+4.
- Parked until user talks with Mason. Circle-back entry updated. Next: pick an idea, then go through spec and pitch before Oct 13 12:00 PST.

## Session notes from 2026-10-01
## Updates


## Looking at prior art (2026-10-01)
- Looked at another attendee-built companion site for TSC. Takeaway for us: keep Compass focused on one job (matching people to the program) and make it easy to act on.
- Confirmed the official program is scrapeable: tsc2026.org/program_details.html links to abstracts_html/<name>.html.
- User idea: build something before TSC, share it on Discord to get traction, then use the hackathon to extend it.

## Matcher: data exploration (2026-10-04)
- User wants to publish an interest matcher before TSC, with the matching algorithm as the core. Codex will review the algorithm. Treating it as architectural: data exploration, then algorithm design for approval, then spec, then plan.
- Scraper (exploration only) is in the session scratchpad: scrape.py writes corpus.json, with raw HTML cached in abs_cache/ and a 0.4s delay between requests. The no-email User-Agent is deliberate.
- Local hardware: Quadro M2000M with 4GB, so plan for CPU-sized embedding models or an API.
- Corpus: 293 records (135 posters, 119 concurrent, 35 plenary, plus workshops, panels and remote talks). Abstracts run 44 to 515 words, median 360; 22 bios are missing. Days cover Oct 12 to 16.
- Evaluation ground truth for free: the organizers grouped the 119 concurrent talks into 26 themed sessions (MON-1 and so on), and posters into 2 sessions with "Focus" disciplines. Session co-membership can serve as a weak relevance label.
- Next: present algorithm approaches for the user to approve.

## Matcher: spec (2026-10-04)
- User picked approach C: stance-aware matching (kindred, opponents, serendipity) plus a conflict-free itinerary. Ship before TSC and iterate at the hackathon.
- Schedule granularity is session blocks only, no per-talk times. Concurrent: Mon to Thu 5:00 to 7:05 pm, 6 or 7 parallel sessions. Plenaries are single-track mornings, posters Tue and Wed 7:30 pm, workshops Sun Oct 11. Since slots are independent, the itinerary is a per-slot argmax (documented in the spec).
- New repo tsc-compass/ (git init, no remote yet). Spec at docs/superpowers/specs/2026-10-04-tsc-compass-design.md, commit 6db1588.
- Key decisions: all TypeScript, so evaluation and runtime share the same core/ and the same ONNX embeddings. Abstracts aren't republished (only title, our one-line claim, and a link out). Claude enriches each abstract once offline: 4 neutral stance axes (or null), methods, concepts, two icebreaker questions. Axes are gated by human-agreement and cross-validation thresholds.
- Hook blocks Co-Authored-By trailers, so commits are made without them (saved to memory).
- Waiting on: user's review of the spec and answers to the open questions (name/URL, Mason credit, who labels, public repo).

## Matcher: plan (2026-10-04)
- Spec approved; private repo for now. Plan written: docs/superpowers/plans/2026-10-04-tsc-compass.md (20 tasks).
- Verified APIs against installed packages before writing code into the plan: @anthropic-ai/sdk 0.131 (beta.messages.parse + betaZodOutputFormat, fallbacks "default"), transformers.js 4.3 (bge-small q8 loads in Node in about 18s, 34MB), umap-js 1.4.
- Data quirks: membership comes from each abstract page's own session code. The workshops page maps anchors to panels with a JS WORKSHOP_HASH object. Multi-part workshops sit only in their first slot.
- Self-review fixed 4 fragile test fixtures (hybrid tie, MMR duplicate, serendipity quantile, prompt marker).
- Codex review is Task 15 (after evaluation, before export). Human labeling (stance x30, personas) is a Tim/Mason step in Task 14.
- Waiting on: Tim to review the plan and choose an execution method.

## Matcher: build (2026-10-04)
- Executing the plan inline on branch build/v0. Private dev repo (main + build/v0 pushed). Ledger in .superpowers/sdd/2026-10-04-tsc-compass/progress.md.
- Done: tasks 1-11 (scaffold, scraper, parser, schedule with 25 slots and all 293 records placed, the full core library), 13 (embeddings for 3 models x 2 chunkings), 17 (web engine), plus the code for 14, 16 and 18. 74 tests green, typecheck clean, vite build OK.
- First E1 pass: BM25 MRR 0.144 vs best (minilm/truncate/hybrid a=0.85) 0.206; the CIs overlap. Persona labels are needed to separate configs.
- Rulings so far: branch instead of worktree; seeded the cache from the exploration scrape; fixed a stopword precedence bug in the plan; label pool depth top-10 (812 labels); started the Codex review early.
- BLOCKED: no Anthropic credentials on this machine (enrichment, Task 12). Asked Tim for a key.
- Codex review is running in the background on core/ + eval/.

## Session notes from 2026-10-11
## Updates


## TSC Compass: status check at TSC (2026-10-11)
- No change since Oct 4: branch build/v0 at 2e0d109, pushed. Still blocked on enrichment (no Anthropic key). Missed the Oct 9 pre-launch target. Pitch gate is Tue Oct 13 12:00 PST.
- Gave Timothy a summary and unblock options (API key, Claude Code subagents doing the enrichment instead, or shipping without enrichment).
- Timothy chose option 1: enrichment via Claude Code subagents instead of the API. 6 batches of about 49 abstracts each, using the same field rules as buildPrompt. Import validates against the same zod schema plus validateEnrichment and writes the content-hash cache, so loadEnrichments and export work unchanged. Scripts are in the session scratchpad (enrich/prep.mts, enrich/import.mts).
- Open issue: with no human stance labels, every axis gate is closed, so no opponents appear at all. 20-30 min of `npm run label:stance` by Timothy would unlock them.

## TSC Compass: launched (2026-10-11)
- 16:03 Timothy moved ~/code/TSC to ~/code/PROJECTS/TSC mid-run; nothing was lost. Removed the stray test-results my run recreated at the old path.
- Enrichment via 6+1 subagents (no API key). The program changed since Oct 4, so I re-scraped: 292 records, 18 relabeled, 9 withdrawn.
- Bugs found and fixed with failing e2e tests first: ONNX runtime fetched from a CDN (privacy), tokenizer never loaded (absolute localModelPath), double 16MB model download (progress_callback), early tap reloaded the page, slow-wifi timeout fell back to keywords (now instant keyword results that upgrade by themselves).
- Deployed to https://compass.timbeach.com: new nginx block (config backed up first), own LE cert, wasm/mjs MIME types, gzip_static (cold load about 26MB). Live check on conference wifi: keyword results 4s, model results 22s, 0 third-party requests.
- Still open: opponents need Timothy's stance labels; persona labels (E2); the final whole-branch review; one unexplained, deferred parity flake; Discord post and organizer note (drafts below, for Timothy to send).


## TSC Compass: survey intake (2026-10-11, Mason)
- Mason asked for the one-question intake to become a real survey so the itinerary is customised, not just matched on one sentence. Branch feat/mason/survey-intake off main at d98389f.
- Seven steps in web/src/ui/survey.ts: interests (up to three, embedded separately, max-fused), where you lean (the existing stance sliders, now in the form), what you're here for (goal preset over the rank config), your fields and fields to visit (affinity lift + preferred serendipity), evidence (methods filter), logistics (types, days left, Zoom-only, posters to shortlist, vary evenings), must-sees (presenter or title search that pins a session).
- Engine: core/survey.ts (new), relevanceMulti in core/retrieval.ts, affinity/prefer in core/rank.ts, allowOption + vary DP in core/itinerary.ts, Query extended in web/src/engine.ts. All ids the e2e suite relies on kept (#q, #go, .types, .days, input[name=m], .stance).
- Verification here: typecheck clean, vitest 135/135 (jsdom added for the form tests), vite build OK. e2e needs web/public/data, which this clone did not have; the pipeline was run locally to build it (see the ledger for the result).
