import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { signUpAs } from "./helpers";

// Runs in the "pwa" project against a production build (the service worker is production-only).

// Going offline makes in-flight and background requests fail; those are expected here. ERR_FAILED is
// a Korean font subset that was never needed online (fonts load per unicode range; the text falls back
// to a system font). A missing JS chunk would still fail the test as a ChunkLoadError page error.
test.use({ allowConsoleError: /ERR_INTERNET_DISCONNECTED|ERR_FAILED|status of 503|Failed to fetch/ });

const RECIPE_ID = "00000000-0000-4000-8000-000000000003"; // V60 기본 1인분
const RECIPE_TITLE = "V60 기본 1인분";

async function cached(page: Page, path: string) {
  return page.evaluate(async (url) => !!(await caches.match(url)), path);
}

async function saveRecipeForOffline(page: Page) {
  await signUpAs(page, `/recipes/${RECIPE_ID}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const save = page.getByRole("article").getByRole("button", { name: /^저장/ });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.waitForLoadState("networkidle"); // the save request must finish before we navigate away

  // Opening /me/saved keeps the list and every saved recipe (detail + brew mode) for offline use.
  await page.goto("/me/saved");
  await expect(page.getByTestId("saved-recipe-list")).toContainText(RECIPE_TITLE);
  await expect
    .poll(async () => (await cached(page, "/me/saved")) && (await cached(page, `/recipes/${RECIPE_ID}/brew`)), {
      timeout: 15_000,
    })
    .toBe(true);
}

test("a saved recipe opens and brews in airplane mode", async ({ page, context }) => {
  await saveRecipeForOffline(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "오프라인이에요" })).toBeVisible();

  await page.getByTestId("saved-recipe-list").getByRole("link", { name: new RegExp(RECIPE_TITLE) }).click();
  await expect(page).toHaveURL(`/recipes/${RECIPE_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(RECIPE_TITLE);
  // The photo was kept with the page (one width; offline any cached width is served).
  const photo = page.getByRole("article").locator("img").first();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.getByRole("link", { name: "추출하기" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${RECIPE_ID}/brew`));
  await page.getByRole("button", { name: "추출 시작" }).click();
  await page.getByRole("button", { name: "타이머 시작" }).click();
  await expect(page.getByTestId("brew-elapsed")).not.toHaveText("0:00", { timeout: 5_000 });
  await expect(page.getByTestId("brew-step")).toBeVisible();
});

test("brew mode keeps the chosen dose offline", async ({ page, context }) => {
  await saveRecipeForOffline(page);

  await context.setOffline(true);
  // Cached without the query string; the page re-reads ?dose= in the browser.
  await page.goto(`/recipes/${RECIPE_ID}/brew?dose=20`);
  await expect(page.getByText(/원두 20g/)).toBeVisible();
});

test("an uncached page falls back to the offline page listing saved recipes", async ({ page, context }) => {
  await saveRecipeForOffline(page);

  await context.setOffline(true);
  await page.goto("/explore");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오프라인이에요");
  await expect(page.getByTestId("offline-recipes")).toContainText(RECIPE_TITLE);
});

test("the app is installable: manifest and icons are served", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/", lang: "ko" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});
