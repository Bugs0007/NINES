import { expect, test } from "@playwright/test";
import { noSideScroll } from "./helpers";

test("settings: sound, motion, claude, time warp, data", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/settings-${n}-${info.project.name}.png`, fullPage: true });

  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBeTruthy();
  expect((await m.json()).icons.length).toBeGreaterThanOrEqual(3);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  await expect(page.getByText(/connected|offline|off on this device/i).first()).toBeVisible({ timeout: 15_000 });
  await noSideScroll(page);
  await shot("1");

  // time warp persists and shows on the game clock
  const warp = page.getByRole("slider", { name: /days from now/i });
  await warp.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByText("+10 days").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("+10 days").first()).toBeVisible();
  await page.getByRole("button", { name: /back to today/i }).click();
  await expect(page.getByText("today", { exact: true }).first()).toBeVisible();

  // reset needs a second tap
  await page.getByRole("button", { name: /reset progress/i }).click();
  await expect(page.getByRole("button", { name: /tap again/i })).toBeVisible();
  await shot("2-armed");
});
