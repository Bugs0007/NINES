import { expect, type Page } from "@playwright/test";

export async function passHook(page: Page) {
  for (let i = 0; i < 5 && !(await page.getByRole("button", { name: /lock it in/i }).isVisible()); i++) {
    await page.getByRole("button", { name: /continue|take it|acknowledge/i }).click();
    await page.waitForTimeout(600);
  }
  await expect(page.getByRole("button", { name: /lock it in/i })).toBeVisible();
}

export async function passMechanism(page: Page) {
  await expect(page.getByText(/the mechanism/i)).toBeVisible();
  for (let i = 0; i < 8; i++) {
    const btn = page.getByRole("button", { name: /^next$|to the challenge/i });
    const label = (await btn.textContent()) ?? "";
    await btn.click();
    await page.waitForTimeout(250);
    if (/challenge/i.test(label)) break;
  }
}

export async function explainAndFinish(page: Page) {
  const box = page.getByRole("textbox", { name: /your explanation/i });
  await expect(box).toBeVisible();
  const skip = page.getByRole("button", { name: /^skip$/i });
  if (await skip.isVisible()) {
    await skip.click();
  } else {
    await box.fill("Network round trips dominate, so count and remove them before adding CPU; the waterfall shows where the time goes.");
    await page.getByRole("button", { name: /^submit$/i }).click();
    const met = page.getByRole("button", { name: /^met$/i });
    await expect(met.first()).toBeVisible({ timeout: 15_000 });
    const n = await met.count();
    for (let i = 0; i < n; i++) await met.nth(i).click();
    await page.getByRole("button", { name: /continue/i }).click();
  }
  await expect(page.getByText(/service built|service re-run/i)).toBeVisible({ timeout: 15_000 });
}

/** The page must never scroll sideways (390px phones included). */
export async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "horizontal overflow in px").toBeLessThanOrEqual(1);
}
