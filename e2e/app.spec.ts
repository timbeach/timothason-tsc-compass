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
