import { afterEach, expect, test, vi } from "vitest";
import { prefetch } from "../../web/src/prefetch";

afterEach(() => vi.unstubAllGlobals());
const body = (n: number) => new Response(new Uint8Array(n));

test("reports byte progress across files and ends at 1", async () => {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => body(u.endsWith("a") ? 300 : 100)));
  const seen: number[] = [];
  await prefetch([{ path: "a", bytes: 300 }, { path: "b", bytes: 100 }], (f) => seen.push(f));
  expect(seen.at(-1)).toBe(1);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
});

test("never throws: a failed prefetch just lets the worker download normally", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  const seen: number[] = [];
  const out = await prefetch([{ path: "a", bytes: 10 }], (f) => seen.push(f));
  expect(out.size).toBe(0);
  expect(seen.at(-1)).toBe(1);
});

test("caps progress at 1 when sizes are understated", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => body(500)));
  const seen: number[] = [];
  await prefetch([{ path: "a", bytes: 100 }], (f) => seen.push(f));
  expect(Math.max(...seen)).toBe(1);
});

test("returns the downloaded bytes keyed by path, so nothing is fetched twice", async () => {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => body(u.endsWith("a") ? 3 : 2)));
  const out = await prefetch([{ path: "a", bytes: 3 }, { path: "b", bytes: 2 }], () => {});
  expect(out.get("a")?.byteLength).toBe(3);
  expect(out.get("b")?.byteLength).toBe(2);
});

test("a failed file is simply absent from the result", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  const out = await prefetch([{ path: "a", bytes: 3 }], () => {});
  expect(out.has("a")).toBe(false);
});
