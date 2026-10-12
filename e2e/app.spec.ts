import { expect, test } from "@playwright/test";

test("query returns kindred matches and an itinerary", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules and anesthesia");
  await page.click("#go");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".itinerary .slot").first()).toBeVisible();
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await expect(page.getByTestId("lexical-banner")).toHaveCount(0);
});

test("no requests leave the origin", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith("http://localhost:4173") && !u.startsWith("blob:") && !u.startsWith("data:")) foreign.push(u); });
  await page.goto("/");
  await page.fill("#q", "dreams");
  await page.click("#go");
  await expect(page.locator('[data-testid="match"]').first()).toBeVisible({ timeout: 90000 });
  expect(foreign).toEqual([]);
});

test("model failure falls back to lexical with a banner (Review Focus 4)", async ({ page }) => {
  await page.route("**/models/**", (r) => r.abort());
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.getByTestId("lexical-banner")).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible();
});

test("gibberish shows the weak-match banner (Review Focus 3)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "zxqv blorp frindle");
  await page.click("#go");
  await expect(page.getByTestId("weak-banner")).toBeVisible({ timeout: 90000 });
});

test("searching before the data finishes loading still works", async ({ page }) => {
  await page.route("**/data/docs.json", async (r) => { await new Promise((res) => setTimeout(res, 3000)); await r.continue(); });
  await page.goto("/", { waitUntil: "commit" });
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible({ timeout: 90000 });
  expect(page.url()).not.toContain("?");
});

test("slow model: instant keyword results, then they upgrade by themselves", async ({ page }) => {
  await page.route("**/models/**", async (r) => { await new Promise((res) => setTimeout(res, 8000)); await r.continue(); });
  await page.goto("/");
  await page.fill("#q", "microtubules and anesthesia");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible();
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await expect(page.getByTestId("lexical-banner")).toHaveCount(0);
});

test("an acronym query finds the talks that mention it, without a weak banner (final review #1)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "IIT");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await expect(page.getByTestId("weak-banner")).toHaveCount(0);
  const first = page.locator('[data-list="kindred"]').first();
  await expect(first).toContainText(/IIT|Integrated Information/i);
});

test("opponents copy is honest while stance axes are unvalidated (final review #2)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".col").nth(1)).not.toContainText("Set your stance below to find opponents");
  await expect(page.locator(".col").nth(1)).toContainText(/switched off|not available yet/i);
});

test("the stance panel stays open while you move sliders (final review #4)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await page.click(".stance summary");
  await page.locator("#ax-ontology").fill("2");
  await page.locator("#ax-ontology").dispatchEvent("change");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible();
  await expect(page.locator("details.stance")).toHaveAttribute("open", "");
});

test("data that fails to load shows a clear message (final review #5)", async ({ page }) => {
  await page.route("**/data/vectors.f32", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await expect(page.getByTestId("data-error")).toBeVisible({ timeout: 30000 });
});

test("the page is not one giant live region (minor: aria-live)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main#app")).not.toHaveAttribute("aria-live", /.*/);
  await expect(page.locator("#status")).toHaveAttribute("role", "status");
});

test("presentation-type filter limits results (minor: spec 5.1)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "consciousness and the brain");
  for (const t of ["Plenary", "Concurrent", "Workshop"]) await page.uncheck(`.types input[value="${t}"]`);
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  const types = await page.locator('[data-testid="match"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-types")));
  expect(types.length).toBeGreaterThan(0);
  for (const t of types) expect(t).toContain("Poster");
});

test("stance rows say where each value comes from, with a clear reset (minor)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await page.click(".stance summary");
  const row = page.locator(".axis").first();
  await expect(row.locator(".source")).toHaveText("Not set");
  await row.locator("input[type=range]").fill("2");
  await row.locator("input[type=range]").dispatchEvent("change");
  await expect(page.locator(".axis").first().locator(".source")).toHaveText("Set by you");
  await page.locator(".axis").first().getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".axis").first().locator(".source")).toHaveText("Not set");
});

test("map has a discipline legend and a hover title (minor)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".map-legend li")).toHaveCount(10);
  await page.locator("#map").scrollIntoViewIfNeeded(); // the map sits below the fold
  const box = (await page.locator("#map").boundingBox())!;
  // Same transform as the map: 12px padding, xy scaled into the remaining box.
  const hit = await page.evaluate(async () => {
    const docs = (await (await fetch("data/docs.json")).json()) as { xy: [number, number] }[];
    const c = document.querySelector("#map") as HTMLCanvasElement;
    return [12 + docs[0].xy[0] * (c.clientWidth - 24), 12 + docs[0].xy[1] * (c.clientHeight - 24)] as [number, number];
  });
  await page.mouse.move(box.x + hit[0], box.y + hit[1]);
  await expect(page.locator(".map-tip")).toBeVisible();
  await expect(page.locator(".map-tip")).not.toBeEmpty();
});

test("first-visit load shows a real progress bar (minor)", async ({ page }) => {
  await page.route("**/models/**", async (r) => { await new Promise((res) => setTimeout(res, 3000)); await r.continue(); });
  await page.goto("/");
  await page.fill("#q", "microtubules");
  await page.click("#go");
  await expect(page.locator("progress#model-progress")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator("progress#model-progress")).toBeHidden();
});

test("plug for Mason's talk links the official abstract and can pin the session", async ({ page }) => {
  await page.goto("/");
  const plug = page.getByTestId("featured").locator(".featured-talk").filter({ hasText: "Mason Ulrika Borchard" });
  await expect(plug).toContainText("Mason Ulrika Borchard");
  await expect(plug).toContainText(/Thu.*Oct 15.*5:00 pm.*Dockside Room/);
  await expect(plug.locator("a")).toHaveAttribute("href", "https://tsc2026.org/abstracts_html/mason-ulrika-borchard.html");
  await plug.getByRole("button", { name: "Add to my week" }).click();
  await expect(plug.getByRole("button")).toHaveText("In your week");
  await page.fill("#q", "consciousness");
  await page.click("#go");
  await expect(page.locator('select[data-slot="conc-2026-10-15"]')).toHaveValue("THU-2", { timeout: 90000 });
});

test("plug lists Dani's talk too, in schedule order, each pinnable", async ({ page }) => {
  await page.goto("/");
  const items = page.getByTestId("featured").locator(".featured-talk");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Dani Caputi");
  await expect(items.nth(0)).toContainText(/Wed.*Oct 14.*5:00 pm.*WED-1.*Paradise Ballroom/);
  await expect(items.nth(0).locator("a")).toHaveAttribute("href", "https://tsc2026.org/abstracts_html/dani-caputi.html");
  await expect(items.nth(1)).toContainText("Mason Ulrika Borchard");
  await items.nth(0).getByRole("button", { name: "Add to my week" }).click();
  await expect(items.nth(0).getByRole("button")).toHaveText("In your week");
  await expect(items.nth(1).getByRole("button")).toHaveText("Add to my week");
  await page.fill("#q", "consciousness");
  await page.click("#go");
  await expect(page.locator('select[data-slot="conc-2026-10-14"]')).toHaveValue("WED-1", { timeout: 90000 });
});

test("survey: two interests are both covered in the kindred list (hackathon: survey intake)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "microtubules and anesthesia");
  await page.fill('input[data-topic="2"]', "psychedelics");
  await page.click("#go");
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  const text = (await page.locator('[data-list="kindred"]').allInnerTexts()).join("\n");
  expect(text).toMatch(/microtubul|anesthe|tubulin/i);
  expect(text).toMatch(/psychedelic|psilocybin|DMT|LSD/i);
});

test("survey: Zoom only limits the plan to streamed sessions", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "consciousness and the brain");
  await page.check("#zoom");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  const chosen = await page.locator(".itinerary select[data-slot^='conc-']").evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value));
  expect(chosen.length).toBeGreaterThan(0);
  for (const c of chosen) expect(c).toMatch(/^(MON|TUE|WED|THU)-1$|^$/);
  // A blank plan must not pass: Zoom-only still has matches, and at least one evening is a real pick.
  expect(await page.locator('[data-testid="match"]').count()).toBeGreaterThan(0);
  await expect(page.getByTestId("weak-banner")).toHaveCount(0);
  expect(chosen.some((c) => c !== "")).toBe(true);
  await expect(page.locator(".itinerary a.zoom").first()).toHaveAttribute("href", /zoom\.us/);
  await expect(page.locator(".itinerary select[data-slot^='poster-']")).toHaveCount(0);
});

test("survey: a must-see pins its session and survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.fill("#mustsee", "Borchard");
  const hit = page.locator("#mustsee-hits .hit").first();
  await expect(hit).toContainText("Mason Ulrika Borchard");
  await hit.click();
  await expect(page.locator("#pinned")).toContainText("THU-2");
  await page.fill("#q", "consciousness");
  await page.click("#go");
  await expect(page.locator('select[data-slot="conc-2026-10-15"]')).toHaveValue("THU-2", { timeout: 90000 });
  await page.reload();
  await expect(page.locator("#pinned")).toContainText("THU-2");
  await expect(page.locator("#q")).toHaveValue("consciousness"); // answers are remembered on this device
});

test("survey: goal, fields and vary-evenings are accepted and the plan still fills (hackathon)", async ({ page }) => {
  await page.goto("/");
  await page.fill("#q", "quantum theories of consciousness");
  await page.check('input[name=goal][value="explore"]');
  await page.click("details.fields summary");
  await page.check('input[name=curious][value="arts/humanities"]');
  await page.check("#vary");
  await page.click("#go");
  await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator('[data-list="kindred"]').first()).toBeVisible();
  const chosen = await page.locator(".itinerary select[data-slot^='conc-']").evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value).filter(Boolean));
  expect(chosen.length).toBeGreaterThan(0);
});

test("survey: days default to what is left of the week", async ({ page }) => {
  await page.goto("/");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const states = await page.locator(".days input").evaluateAll((els) => els.map((e) => [(e as HTMLInputElement).value, (e as HTMLInputElement).checked] as [string, boolean]));
  const left = states.filter(([d]) => d >= today);
  if (left.length) for (const [d, on] of states) expect(on).toBe(d >= today);
  else for (const [, on] of states) expect(on).toBe(true);
});
