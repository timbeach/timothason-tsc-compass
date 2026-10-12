import { expect, test } from "vitest";
import { checkBundle } from "../../web/src/data";

test("checkBundle accepts consistent parts and names the mismatch otherwise (final review #5)", () => {
  const ok = { nDocs: 2, dim: 3, nVectorFloats: 6, lexN: 2, nConcepts: 4, nConceptFloats: 12 };
  expect(() => checkBundle(ok)).not.toThrow();
  expect(() => checkBundle({ ...ok, nVectorFloats: 9 })).toThrow(/vectors/);
  expect(() => checkBundle({ ...ok, lexN: 3 })).toThrow(/keyword index/);
  expect(() => checkBundle({ ...ok, nConceptFloats: 9 })).toThrow(/concept/);
});
