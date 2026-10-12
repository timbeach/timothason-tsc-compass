# Codex review: matching and evaluation (2026-10-04)

Scope: core/{retrieval,stance,rank,explain,itinerary,lexical,embedtext}.ts, eval/{metrics,e1,run,label-personas}.ts, pipeline/{axes,enrich}.ts. Codex made no edits.

Codex found no problems in the ridge/Cholesky, Spearman-with-ties or nDCG math, and reported no tuning versus held-out leakage or E1/E2 circularity.

| # | Where | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | core/rank.ts:31 | important | All-tied relevance normalizes to rNorm=1, so zero-signal queries yield confident opponents | Fixed: no-signal results are empty and weak; lexical-only candidates need r>0 |
| 2 | core/rank.ts:42 | important | Kindred is filled with arbitrary docs when every r is 0 | Fixed with #1 |
| 3 | core/rank.ts:70 | important | Serendipity passes the floor=0 when every score is 0 | Fixed with #1 |
| 4 | core/embedtext.ts:31 | important | BGE prefix applies to short queries only; long queries are embedded as passages | Not changed (ruling): this is by design. BGE recommends the instruction for short query-to-passage retrieval and no instruction for passage-to-passage similarity, and a pasted abstract is a passage. Documented in code |
| 5 | eval/run.ts:44 | important | E1 uses stored doc vectors, so it bypasses the runtime query path | Not changed (ruling): E1 is a doc-to-doc proxy by design; E2 (personas) exercises the runtime query path. The report now says so |
| 6 | eval/metrics.ts:20 | important | bootstrapCI([]) returns NaN | Fixed: formatCI returns "n/a" for empty input |
| 7 | eval/run.ts:23 | minor | Pool depth 10 vs the spec's top-20 | Ledgered ruling (labeling budget); comment and report wording corrected |
| 8 | core/stance.ts:66 | minor | cvRidge crashes when n < folds | Deferred: the pipeline guards with MIN_LABELS=20 |
| 9 | core/itinerary.ts:17 | minor | buildItinerary crashes on a slot with no options | Deferred: the parsers never emit an option-less slot |
