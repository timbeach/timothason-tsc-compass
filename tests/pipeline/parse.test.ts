import { expect, test } from "vitest";
import { parseAbstractPage, parseDayName, parsePresentation } from "../../pipeline/parse";

const PAGE = `<html><body>
<div class="abstract-wrap">
<div class="speaker-card"><div class="speaker-info">
<h2>Jack Tuszynski</h2>
<div class="affiliation">University of Alberta, Edmonton, Canada</div>
<div class="presentation">Monday, October 12 &middot; <a href="../program_details.html#pl-1">PL-1: Quantum Biophotonics</a> &middot; <a href="../map.html#paradise-ballroom">Paradise Ballroom</a></div>
<div class="tags"><span class="tag tag-plenary">Plenary</span>
<a class="tag tag-workshop" href="../workshops.html#quantum-biology">Workshop: Quantum Biology and the Brain</a></div>
</div></div>
<div class="talk-title">An overview of the experimental tests of the Orch OR theory</div>
<div class="abstract-text"><p>The Orch OR theory suggests consciousness depends on quantum processes.</p><p>Second paragraph.</p></div>
<div class="about-heading">About the speaker</div>
<div class="abstract-text"><p>Professor of physics.</p></div>
</div></body></html>`;

test("parseDayName", () => {
  expect(parseDayName("Monday, October 12")).toBe("2026-10-12");
  expect(parseDayName("Sunday")).toBeNull();
});

test("parsePresentation handles plenary, concurrent (em dash) and posters", () => {
  expect(parsePresentation("Monday, October 12 · PL-1: Quantum Biophotonics · Paradise Ballroom")).toEqual({
    day: "2026-10-12", sessionCode: "PL-1", sessionName: "Quantum Biophotonics", room: "Paradise Ballroom",
  });
  expect(parsePresentation("Thursday, October 15 · THU-6 \u2014 Art, Myth, and Dream · Bay View Room")).toEqual({
    day: "2026-10-15", sessionCode: "THU-6", sessionName: "Art, Myth, and Dream", room: "Bay View Room",
  });
  expect(parsePresentation("Wednesday, October 14 · Poster Session 2 · Mission Bay Room")).toEqual({
    day: "2026-10-14", sessionCode: "PS-2", sessionName: "Poster Session 2", room: "Mission Bay Room",
  });
  expect(parsePresentation("")).toEqual({ day: null, sessionCode: null, sessionName: null, room: null });
});

test("parseAbstractPage extracts every field", () => {
  const r = parseAbstractPage("jack-tuszynski", PAGE);
  expect(r).toEqual({
    id: "jack-tuszynski",
    name: "Jack Tuszynski",
    affiliation: "University of Alberta, Edmonton, Canada",
    title: "An overview of the experimental tests of the Orch OR theory",
    abstract: "The Orch OR theory suggests consciousness depends on quantum processes. Second paragraph.",
    bio: "Professor of physics.",
    url: "https://tsc2026.org/abstracts_html/jack-tuszynski.html",
    day: "2026-10-12",
    sessionCode: "PL-1",
    sessionName: "Quantum Biophotonics",
    room: "Paradise Ballroom",
    types: ["Plenary", "Workshop"],
    workshops: ["quantum-biology"],
  });
});

test("parseAbstractPage throws when title or abstract is missing", () => {
  expect(() => parseAbstractPage("x", "<html><body></body></html>")).toThrow(/x/);
});
