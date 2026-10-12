import { expect, test } from "vitest";
import { nearestDot } from "../../web/src/ui/map";

test("nearestDot finds the closest point within the radius, else -1", () => {
  const pts: [number, number][] = [[10, 10], [50, 50], [52, 49]];
  expect(nearestDot(pts, 11, 9, 8)).toBe(0);
  expect(nearestDot(pts, 53, 49, 8)).toBe(2);
  expect(nearestDot(pts, 200, 200, 8)).toBe(-1);
});
