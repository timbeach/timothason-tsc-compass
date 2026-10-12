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
