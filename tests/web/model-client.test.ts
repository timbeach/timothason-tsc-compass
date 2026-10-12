import { describe, expect, test, vi } from "vitest";
import { ModelClient, type WorkerLike } from "../../web/src/model-client";

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: { type: string; id?: number; text?: string; model?: string }[] = [];
  postMessage(m: { type: string; id?: number; text?: string }) { this.sent.push(m); }
  emit(data: unknown) { this.onmessage?.({ data }); }
  lastEmbedId() { return [...this.sent].reverse().find((m) => m.type === "embed")!.id!; }
}

describe("ModelClient", () => {
  test("initialises the worker and resolves vectors once ready", async () => {
    const w = new FakeWorker();
    const c = new ModelClient(w, "m");
    expect(w.sent[0]).toEqual({ type: "init", model: "m" });
    w.emit({ type: "ready" });
    const p = c.embed("hello");
    w.emit({ type: "vec", id: w.lastEmbedId(), vec: new Float32Array([1]) });
    expect(await p).toEqual({ vec: new Float32Array([1]), reason: null });
    expect(c.state).toBe("ready");
  });

  test("a failed load fails every pending and future search with reason 'load'", async () => {
    const w = new FakeWorker();
    const c = new ModelClient(w, "m");
    const p = c.embed("a");
    w.emit({ type: "error", phase: "init", message: "boom" });
    expect(await p).toEqual({ vec: null, reason: "load" });
    expect(await c.embed("b")).toEqual({ vec: null, reason: "load" });
    expect(c.state).toBe("failed");
  });

  test("one failed search does not disable the model (minor: worker error)", async () => {
    const w = new FakeWorker();
    const c = new ModelClient(w, "m");
    w.emit({ type: "ready" });
    const p1 = c.embed("bad");
    w.emit({ type: "error", phase: "embed", id: w.lastEmbedId(), message: "x" });
    expect(await p1).toEqual({ vec: null, reason: "error" });
    const p2 = c.embed("good");
    w.emit({ type: "vec", id: w.lastEmbedId(), vec: new Float32Array([2]) });
    expect((await p2).vec).toEqual(new Float32Array([2]));
    expect(c.state).toBe("ready");
  });

  test("times out only once ready, with reason 'timeout'", async () => {
    vi.useFakeTimers();
    const w = new FakeWorker();
    const c = new ModelClient(w, "m", 1000);
    const loading = c.embed("slow load");
    vi.advanceTimersByTime(5000);
    w.emit({ type: "ready" });
    w.emit({ type: "vec", id: 0, vec: new Float32Array([3]) });
    expect((await loading).vec).toEqual(new Float32Array([3]));
    const p = c.embed("stuck");
    vi.advanceTimersByTime(1001);
    expect(await p).toEqual({ vec: null, reason: "timeout" });
    vi.useRealTimers();
  });

  test("caches vectors by text so slider moves don't re-embed (minor)", async () => {
    const w = new FakeWorker();
    const c = new ModelClient(w, "m");
    w.emit({ type: "ready" });
    const p = c.embed("same");
    w.emit({ type: "vec", id: w.lastEmbedId(), vec: new Float32Array([4]) });
    await p;
    const before = w.sent.length;
    expect((await c.embed("same")).vec).toEqual(new Float32Array([4]));
    expect(w.sent.length).toBe(before);
  });

  test("notifies state changes", () => {
    const w = new FakeWorker();
    const seen: string[] = [];
    new ModelClient(w, "m", 60000, (s) => seen.push(s));
    w.emit({ type: "ready" });
    expect(seen).toEqual(["ready"]);
  });
});
