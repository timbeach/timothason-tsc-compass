/** Talks to the embedding worker: load state, per-search failures, timeouts, and a small cache. */

export interface WorkerLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export type ModelState = "loading" | "ready" | "failed";
/** Why a search fell back to keywords: the model never loaded, this search timed out, or this search errored. */
export type FallbackReason = "load" | "timeout" | "error";
export interface EmbedResult { vec: Float32Array | null; reason: FallbackReason | null }

type Msg =
  | { type: "ready" }
  | { type: "progress"; fraction: number }
  | { type: "vec"; id: number; vec: Float32Array }
  | { type: "error"; phase: "init" | "embed"; id?: number; message: string };

const CACHE_SIZE = 20;

export class ModelClient {
  state: ModelState = "loading";
  private nextId = 0;
  private pending = new Map<number, (r: EmbedResult) => void>();
  private cache = new Map<string, Float32Array>();
  private started: Promise<void>;
  private isStarted = false;
  /** Download progress (0 to 1) of the model files, reported by the worker. */
  onProgress?: (fraction: number) => void;

  constructor(
    private worker: WorkerLike,
    model: string,
    private timeoutMs = 60000,
    private onState?: (s: ModelState) => void,
    /** Delay loading until this settles (the page prefetches model files with a progress bar first). */
    startAfter?: Promise<unknown>,
    /** Model files the worker downloads itself, with progress, before loading. */
    files?: { path: string; bytes: number }[],
  ) {
    worker.onmessage = (e) => this.handle(e.data as Msg);
    worker.onerror = () => this.fail("worker crashed");
    const start = () => { this.isStarted = true; worker.postMessage(files ? { type: "init", model, files } : { type: "init", model }); };
    if (!startAfter) { start(); this.started = Promise.resolve(); }
    else this.started = startAfter.then(start, start);
  }

  embed(text: string): Promise<EmbedResult> {
    const hit = this.cache.get(text);
    if (hit) return Promise.resolve({ vec: hit, reason: null });
    if (this.state === "failed") return Promise.resolve({ vec: null, reason: "load" });
    if (!this.isStarted) return this.started.then(() => this.embed(text));
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, (r) => {
        if (r.vec) this.remember(text, r.vec);
        resolve(r);
      });
      this.worker.postMessage({ type: "embed", id, text });
      // Only time out once the model is loaded; a first-visit download on slow wifi can take minutes.
      if (this.state === "ready") setTimeout(() => this.settle(id, { vec: null, reason: "timeout" }), this.timeoutMs);
    });
  }

  private handle(m: Msg) {
    if (m.type === "ready") { this.setState("ready"); return; }
    if (m.type === "progress") { this.onProgress?.(m.fraction); return; }
    if (m.type === "vec") { this.settle(m.id, { vec: m.vec, reason: null }); return; }
    if (m.type === "error") {
      console.warn(`Meaning model ${m.phase === "init" ? "unavailable" : "failed on a search"}, using keyword matching:`, m.message);
      if (m.phase === "init") this.fail(m.message);
      else if (m.id !== undefined) this.settle(m.id, { vec: null, reason: "error" });
    }
  }

  private fail(_why: string) {
    this.setState("failed");
    for (const id of [...this.pending.keys()]) this.settle(id, { vec: null, reason: "load" });
  }

  private settle(id: number, r: EmbedResult) {
    const done = this.pending.get(id);
    if (!done) return;
    this.pending.delete(id);
    done(r);
  }

  private remember(text: string, vec: Float32Array) {
    this.cache.set(text, vec);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
  }

  private setState(s: ModelState) {
    if (this.state === s) return;
    this.state = s;
    this.onState?.(s);
  }
}
