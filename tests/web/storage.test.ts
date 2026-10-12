import { afterEach, expect, test, vi } from "vitest";
import { safeGet, safeSet } from "../../web/src/storage";

afterEach(() => vi.unstubAllGlobals());

test("safeGet/safeSet survive a throwing localStorage", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
  expect(safeGet("k", { a: 1 })).toEqual({ a: 1 });
  expect(() => safeSet("k", 1)).not.toThrow();
});

test("safeGet returns fallback on corrupt JSON", () => {
  vi.stubGlobal("localStorage", { getItem: () => "{nope", setItem: () => {} });
  expect(safeGet("k", 5)).toBe(5);
});
