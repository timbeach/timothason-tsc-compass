import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { cachedFetch } from "../../pipeline/fetch";
import { listAbstractSlugs } from "../../pipeline/scrape";

test("cachedFetch hits the network once, then reads the cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tscc-"));
  const fetchFn = vi.fn(async () => new Response("<html>ok</html>", { status: 200 }));
  const file = join(dir, "a.html");
  expect(await cachedFetch("https://tsc2026.org/a.html", file, { fetchFn, delayMs: 0 })).toBe("<html>ok</html>");
  expect(await cachedFetch("https://tsc2026.org/a.html", file, { fetchFn, delayMs: 0 })).toBe("<html>ok</html>");
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(readFileSync(file, "utf8")).toBe("<html>ok</html>");
  const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^tsc-compass\//);
});

test("cachedFetch throws on non-200 and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tscc-"));
  const fetchFn = vi.fn(async () => new Response("nope", { status: 404 }));
  await expect(cachedFetch("https://tsc2026.org/x.html", join(dir, "x.html"), { fetchFn, delayMs: 0 })).rejects.toThrow(/404/);
});

test("cachedFetch refuses hosts other than tsc2026.org", async () => {
  await expect(cachedFetch("https://example.org/elsewhere", "/tmp/never.html", { delayMs: 0 })).rejects.toThrow(/tsc2026\.org/);
});

test("listAbstractSlugs dedupes and sorts across pages", () => {
  const a = '<a href="abstracts_html/b-two.html">x</a><a href="abstracts_html/a-one.html#x">y</a>';
  const b = '<a href="abstracts_html/b-two.html">z</a>';
  expect(listAbstractSlugs([a, b])).toEqual(["a-one", "b-two"]);
});
