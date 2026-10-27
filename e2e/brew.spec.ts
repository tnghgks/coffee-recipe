import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Seed: "V60 기본 1인분" — 15g, 1:16, steps at 0:00 / 0:40 / 1:10 / 1:40 (2/8/12/16 × dose), ends 2:45.
const RECIPE = "/recipes/00000000-0000-4000-8000-000000000003";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

/** Advance the fake clock by `ms` and let one animation frame run, instead of simulating every frame. */
async function advance(page: Page, ms: number) {
  await page.clock.fastForward(ms - 50);
  await page.clock.runFor(50);
}

test("dials in settings before brewing and keeps them in the URL", async ({ page }) => {
  await page.goto(RECIPE);
  await page.getByRole("link", { name: "추출하기" }).click();
  await expect(page).toHaveURL(/\/brew$/);

  await page.getByRole("textbox", { name: "원두량" }).fill("20");
  await page.getByRole("radiogroup", { name: "온도" }).getByRole("radio", { name: "아이스" }).click();
  await expect(page).toHaveURL(/\/brew\?dose=20&iced=1$/);
  await expect(page.getByTestId("ice-water")).toHaveText("128g");

  // a reload keeps them
  await page.reload();
  await expect(page.getByRole("textbox", { name: "원두량" })).toHaveValue("20");
  await expect(page.getByRole("radio", { name: "아이스" })).toBeChecked();

  await page.getByRole("button", { name: "추출 시작" }).click();
  // 20g iced: 60% hot water → steps 24 / 96 / 144 / 192g
  await expect(page.getByTestId("brew-target")).toHaveText("24");

  // back to the recipe and in again: still 20g iced
  await page.getByRole("link", { name: "추출 그만두고 레시피로" }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+\?dose=20&iced=1$/);
  await page.getByRole("link", { name: "추출하기" }).click();
  await expect(page).toHaveURL(/\/brew\?dose=20&iced=1$/);
  await expect(page.getByRole("textbox", { name: "원두량" })).toHaveValue("20");
});

test("runs through the steps with pause and resume, then finishes", async ({ page }) => {
  await page.goto(`${RECIPE}/brew?dose=20`);
  const elapsed = page.getByTestId("brew-elapsed");
  const stepLabel = page.getByTestId("brew-step");
  const target = page.getByTestId("brew-target");

  await page.getByRole("button", { name: "추출 시작" }).click();
  await expect(stepLabel).toHaveText("뜸 들이기");
  await expect(target).toHaveText("40");
  await expect(page.getByText("이번에 +40g 붓기")).toBeVisible();

  // the clock waits for a tap after entering brew mode
  await expect(page.getByText("준비되면 탭해서 시작")).toBeVisible();
  await advance(page, 10_000);
  await expect(elapsed).toHaveText("0:00");
  await page.getByRole("button", { name: "타이머 시작" }).click();

  await advance(page, 41_000);
  await expect(stepLabel).toHaveText("1차 붓기");
  await expect(target).toHaveText("160");
  await expect(page.getByTestId("brew-next")).toHaveText("2차 붓기 → 240g");

  // paused time does not count
  await page.getByRole("button", { name: "일시정지" }).click();
  await expect(page.getByText("일시정지됨 · 탭해서 계속")).toBeVisible();
  await advance(page, 30_000);
  await expect(elapsed).toHaveText("0:41");

  await page.getByRole("button", { name: "계속" }).click();
  await advance(page, 30_000);
  await expect(elapsed).toHaveText("1:11");
  await expect(stepLabel).toHaveText("2차 붓기");

  await advance(page, 100_000);
  await expect(page.getByRole("heading", { name: "추출 완료" })).toBeVisible();
  await expect(page.getByTestId("brew-summary")).toHaveText("2:45 · 물 320g");
  await expect(page.getByRole("link", { name: "기록 남기기" })).toHaveAttribute(
    "href",
    /^\/me\/logs\/new\?recipe=00000000-0000-4000-8000-000000000003&dose=20&ratio=16&time=165$/,
  );

  // back to the prep view with the same settings
  await page.getByRole("button", { name: "다시 내리기" }).click();
  await expect(page.getByRole("button", { name: "추출 시작" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "원두량" })).toHaveValue("20");
});

test("elapsed time does not lag after time passes without frames (background tab)", async ({ page }) => {
  await page.goto(`${RECIPE}/brew`);
  await page.getByRole("button", { name: "추출 시작" }).click();
  await page.getByRole("button", { name: "타이머 시작" }).click();
  await advance(page, 1_000);

  // Jump 75s without running any animation frames in between, as when the tab is hidden.
  await page.clock.fastForward(75_000);
  await page.clock.runFor(100); // the first frame after coming back
  await expect(page.getByTestId("brew-elapsed")).toHaveText("1:16");
  await expect(page.getByTestId("brew-step")).toHaveText("2차 붓기");
});

test("finish early from pause", async ({ page }) => {
  await page.goto(`${RECIPE}/brew`);
  await page.getByRole("button", { name: "추출 시작" }).click();
  await page.getByRole("button", { name: "타이머 시작" }).click();
  await advance(page, 50_000);
  await page.getByRole("button", { name: "일시정지" }).click();
  await page.getByRole("button", { name: "추출 끝내기" }).click();
  await expect(page.getByTestId("brew-summary")).toHaveText("0:50 · 물 240g");
});

test("no horizontal scroll at 375px in brew mode", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto(`${RECIPE}/brew?dose=60&iced=1`);
  await expect(page.getByRole("button", { name: "추출 시작" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "추출 시작" }).click();
  await expect(page.getByTestId("brew-elapsed")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
