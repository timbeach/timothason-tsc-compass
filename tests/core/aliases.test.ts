import { expect, test } from "vitest";
import { expandQuery } from "../../core/aliases";

test("a field term brings in the words the program actually uses", () => {
  expect(expandQuery("psychokinesis")).toMatch(/mind-matter interaction/);
  expect(expandQuery("QRNG")).toMatch(/random number generator/);
  expect(expandQuery("LLM")).toMatch(/large language model/);
  expect(expandQuery("IIT")).toMatch(/integrated information theory/);
});

test("matching is whole-word and case-insensitive, and the original text comes first", () => {
  expect(expandQuery("Orch OR and anesthesia")).toMatch(/^Orch OR and anesthesia/);
  expect(expandQuery("Orch OR and anesthesia")).toMatch(/orchestrated objective reduction/);
  expect(expandQuery("ait")).toBe("ait"); // 'ait' is not 'iit' nor 'ai'
  expect(expandQuery("pkd")).toBe("pkd"); // no 'pk' inside words
});

test("nothing to add leaves the text untouched, and expansions are not repeated", () => {
  expect(expandQuery("microtubules and anesthesia")).toBe("microtubules and anesthesia");
  const out = expandQuery("LLM LLMs large language models");
  expect(out.match(/large language model/g)!.length).toBeLessThanOrEqual(2); // once from the text, once added
});
