import { expect, test } from "vitest";
import { e1SessionRecovery } from "../../eval/e1";

test("E1 excludes the query doc and skips docs without session or session-mates", () => {
  const ids = ["a", "b", "c", "d"];
  const sess = ["S1", "S1", "S2", null];
  // Perfect scorer: same session scores 1, others 0, self scores 99 (must be excluded).
  const scoreRow = (i: number) => Float64Array.from(ids.map((_, j) => (j === i ? 99 : sess[j] === sess[i] ? 1 : 0)));
  const r = e1SessionRecovery(ids, sess, scoreRow);
  expect(r.mrr).toEqual([1, 1]); // only a and b qualify (c has no mates, d has no session)
  expect(r.recall10).toEqual([1, 1]);
});
