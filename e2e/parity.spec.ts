import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = JSON.parse(readFileSync("e2e/parity.fixture.json", "utf8")) as { query: string; kindred: string[] }[];

for (const f of fixture) {
  test(`browser matches node for "${f.query}"`, async ({ page }) => {
    await page.goto("/");
    // The fixture is built with no day filter; the form defaults to the days left, so open every day first.
    for (const box of await page.locator(".days input").all()) await box.check();
    await page.fill("#q", f.query);
    await page.click("#go");
    const cards = page.locator('[data-list="kindred"]');
    await expect(cards.first()).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId("loading-banner")).toHaveCount(0, { timeout: 90000 }); // wait for the final, model-based list
    const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
    // WASM vs native ONNX can differ in the last float bits: require the same top 3 and 6 of 8 overlap.
    expect(ids.slice(0, 3)).toEqual(f.kindred.slice(0, 3));
    expect(ids.filter((id) => f.kindred.includes(id!)).length).toBeGreaterThanOrEqual(6);
  });
}
