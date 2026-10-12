import { expect, test, vi } from "vitest";
import { chunkWords, embedDocText, embedQuery, type EmbedFn } from "../../core/embedtext";
import { modelByKey } from "../../core/models";

const fake: EmbedFn = async (texts) => texts.map((t) => new Float32Array([t.split(" ").length, 1]));

test("chunkWords splits with overlap and keeps short text whole", () => {
  expect(chunkWords("a b c", 180, 30)).toEqual(["a b c"]);
  const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const chunks = chunkWords(words, 180, 30);
  expect(chunks).toHaveLength(3);
  expect(chunks[1].split(" ")[0]).toBe("w150");
  expect(chunks[2].split(" ").at(-1)).toBe("w399");
});

test("embedDocText truncate embeds once; chunk mean-pools and normalizes", async () => {
  const spy = vi.fn(fake);
  const long = Array.from({ length: 400 }, () => "x").join(" ");
  await embedDocText(spy, long, "truncate");
  expect(spy).toHaveBeenLastCalledWith([long]);
  const v = await embedDocText(spy, long, "chunk");
  expect(spy.mock.lastCall![0]).toHaveLength(3);
  expect(Math.hypot(...v)).toBeCloseTo(1);
});

test("embedQuery: short query gets the model prefix, long query is chunked whole", async () => {
  const spy = vi.fn(fake);
  const bge = modelByKey("bge-small");
  await embedQuery(spy, "microtubules", bge);
  expect(spy.mock.lastCall![0]).toEqual([bge.queryPrefix + "microtubules"]);
  const long = Array.from({ length: 1500 }, (_, i) => `w${i}`).join(" ");
  await embedQuery(spy, long, bge);
  const sent = spy.mock.lastCall![0];
  expect(sent.length).toBeGreaterThan(5);
  expect(sent.join(" ")).toContain("w1499");
  expect(sent[0].startsWith(bge.queryPrefix)).toBe(false);
});
