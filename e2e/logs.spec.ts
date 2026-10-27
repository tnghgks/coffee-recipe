import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { completeSetup, devLogin, signUpAs, unique } from "./helpers";

// Seed: "V60 기본 1인분" — 15g, 1:16, ends at 2:45.
const RECIPE_ID = "00000000-0000-4000-8000-000000000003";

/** Runs a brew to the end with the fake clock and lands on the finished screen. */
async function finishBrew(page: Page, query = "?dose=20") {
  await page.clock.install();
  await page.goto(`/recipes/${RECIPE_ID}/brew${query}`);
  await page.getByRole("button", { name: "추출 시작" }).click();
  await page.getByRole("button", { name: "타이머 시작" }).click();
  await page.clock.fastForward(170_000);
  await page.clock.runFor(100);
  await expect(page.getByRole("heading", { name: "추출 완료" })).toBeVisible();
}

test("finish → saved log in three taps", async ({ page }) => {
  await signUpAs(page);
  await finishBrew(page);

  await page.getByRole("link", { name: "기록 남기기" }).click(); // tap 1
  await expect(page).toHaveURL(/\/me\/logs\/new\?recipe=/);
  await expect(page.getByLabel("원두량 (g)")).toHaveValue("20");
  await expect(page.getByLabel("물 (g)")).toHaveValue("320");
  await expect(page.getByLabel("추출 시간 (m:ss)")).toHaveValue("2:45");

  await page.getByRole("radio", { name: "4점" }).click(); // tap 2
  await page.getByRole("button", { name: "기록 저장" }).click(); // tap 3

  await expect(page).toHaveURL(/\/me\/logs$/);
  const card = page.getByTestId("log-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("V60 기본 1인분");
  await expect(card.getByRole("img", { name: "평점 4점" })).toBeVisible();
});

test("a rating is required", async ({ page }) => {
  await signUpAs(page, `/me/logs/new?recipe=${RECIPE_ID}`);
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByText("평점을 골라 주세요")).toBeVisible();
  await expect(page).toHaveURL(/\/me\/logs\/new/);
});

test("the last 'next time' note shows when dialing in the next brew", async ({ page }) => {
  await signUpAs(page, `/me/logs/new?recipe=${RECIPE_ID}`);
  await page.getByRole("radio", { name: "3점" }).click();
  await page.getByLabel("원두 이름").fill("케냐 AA");
  await page.getByLabel("다음엔 이렇게").fill("분쇄도 한 칸 굵게");
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page).toHaveURL(/\/me\/logs$/);

  await page.goto(`/recipes/${RECIPE_ID}/brew`);
  await expect(page.getByTestId("last-adjustment")).toContainText("분쇄도 한 칸 굵게");

  await page.goto(`/recipes/${RECIPE_ID}`);
  const section = page.getByRole("region", { name: "이 레시피로 내린 내 기록" });
  await expect(section.getByTestId("log-card")).toHaveCount(1);
  await expect(section).toContainText("케냐 AA");
});

test("signed-out users log in and come back to the prefilled form", async ({ page }) => {
  await finishBrew(page, "?dose=20&iced=1");
  await page.getByRole("link", { name: "기록 남기기" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fme%2Flogs%2Fnew%3Frecipe%3D/);

  const id = unique();
  await devLogin(page, `log-${id}@test.local`);
  await expect(page).toHaveURL(/\/me\/setup\?next=/);
  await completeSetup(page, `log_${id}`.slice(0, 20));

  await expect(page).toHaveURL(/\/me\/logs\/new\?recipe=/);
  await expect(page.getByLabel("원두량 (g)")).toHaveValue("20");
  await expect(page.getByLabel("물 (g)")).toHaveValue("320");
  await expect(page.getByLabel("아이스로 내렸어요")).toBeChecked();
});

test("filters by bean and keeps logs private", async ({ page, browser }) => {
  await signUpAs(page);
  for (const [bean, stars] of [
    ["에티오피아", "5점"],
    ["콜롬비아", "2점"],
  ] as const) {
    await page.goto(`/me/logs/new?recipe=${RECIPE_ID}`);
    await page.getByLabel("원두 이름").filter({ visible: true }).fill(bean);
    await page.getByRole("radio", { name: stars }).click();
    await page.getByRole("button", { name: "기록 저장" }).click();
    await expect(page).toHaveURL(/\/me\/logs$/);
  }

  const list = page.getByTestId("log-list");
  await expect(list.getByTestId("log-card")).toHaveCount(2);
  await page.getByRole("navigation", { name: "원두 필터" }).getByRole("link", { name: "콜롬비아" }).click();
  await expect(page).toHaveURL(/bean=/);
  await expect(page.getByTestId("log-list").getByTestId("log-card")).toHaveCount(1);
  await expect(page.getByTestId("log-list")).toContainText("콜롬비아");

  const logHref = await page.getByTestId("log-list").getByTestId("log-card").getAttribute("href");

  const other = await browser.newPage();
  await signUpAs(other, "/me/logs");
  await expect(other.getByText("아직 기록이 없어요")).toBeVisible();
  await other.goto(logHref!);
  await expect(other.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeVisible();
  await other.close();
});

test("edits and deletes a log", async ({ page }) => {
  await signUpAs(page, `/me/logs/new?recipe=${RECIPE_ID}`);
  await page.getByRole("radio", { name: "2점" }).click();
  await page.getByRole("button", { name: "기록 저장" }).click();
  await page.getByTestId("log-card").click();

  await expect(page.getByRole("heading", { name: "기록 수정" })).toBeVisible();
  await page.getByRole("radio", { name: "5점" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "기록 저장" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/me\/logs$/);
  await expect(page.getByTestId("log-list").getByRole("img", { name: "평점 5점" })).toBeVisible();

  await page.getByTestId("log-list").getByTestId("log-card").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "기록 삭제" }).click();
  await expect(page).toHaveURL(/\/me\/logs$/);
  await expect(page.getByText("아직 기록이 없어요")).toBeVisible();
});
