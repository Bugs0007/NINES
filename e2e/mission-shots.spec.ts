import { expect, test } from "@playwright/test";

test("littles-law mission beats", async ({ page }, info) => {
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/mission-${n}-${info.project.name}.png` });
  await page.goto("/mission/littles-law");
  await page.waitForTimeout(2500);
  await shot("1-hook");
  await page.getByRole("button", { name: /continue|take it|acknowledge/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /continue|take it|acknowledge/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /acknowledge|take it/i }).click();
  await page.waitForTimeout(1200);
  await shot("2-predict");
  // numeric: press End on the slider then arrow back
  const slider = page.getByRole("slider").first();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("radio", { name: /70%/ }).click();
  await page.getByRole("button", { name: /lock it in/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: /workers run out/i }).click();
  await page.getByRole("radio", { name: /90%/ }).click();
  await shot("3-predict2");
  await page.getByRole("button", { name: /lock it in/i }).click();
  await page.waitForTimeout(4000);
  await shot("4-play");
  await expect(page.getByText(/your call/i).first()).toBeVisible();
});
