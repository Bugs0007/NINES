import { expect, test, type Page } from "@playwright/test";

/** Walk the Little's Law mission end to end, like a player, screenshotting each beat. */
test("littles-law mission: full loop", async ({ page }, info) => {
  test.setTimeout(240_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/mission-${n}-${info.project.name}.png` });

  await page.goto("/mission/littles-law");
  await expect(page.getByRole("heading", { name: /little's law/i })).toBeVisible();
  await page.waitForTimeout(1800);
  await shot("1-hook");

  // Hook: advance until the prediction panel appears.
  for (let i = 0; i < 4 && !(await page.getByText(/your call/i).first().isVisible()); i++) {
    await page.getByRole("button", { name: /continue|take it|acknowledge/i }).click();
    await page.waitForTimeout(700);
  }
  await expect(page.getByRole("button", { name: /lock it in/i })).toBeVisible();
  await shot("2-predict");

  // Prediction 1 (numeric, log slider): nudge it, pick a confidence, lock.
  const numeric = page.getByRole("slider", { name: /drag to set/i });
  await numeric.focus();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("radio", { name: /70%/ }).click();
  await page.getByRole("button", { name: /lock it in/i }).click();

  // Prediction 2 (choice).
  await page.getByRole("radio", { name: /workers run out/i }).click();
  await page.getByRole("radio", { name: /90%/ }).click();
  await shot("3-predict2");
  await page.getByRole("button", { name: /lock it in/i }).click();

  // Play: push arrivals past capacity.
  const arrivals = page.getByRole("slider", { name: /arrivals/i });
  await expect(arrivals).toBeVisible();
  await arrivals.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(3000);
  await shot("4-play");
  await expect(page.getByRole("dialog", { name: /prediction result/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900);
  await shot("5-reveal");
  await page.getByRole("button", { name: /why\?/i }).click();

  // Second observation: moderate traffic, slower database.
  await arrivals.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowRight");
  const db = page.getByRole("slider", { name: /db wait/i });
  await db.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: /prediction result/i })).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /why\?/i }).click();

  // Mechanism captions.
  await expect(page.getByText(/the mechanism/i)).toBeVisible();
  await shot("6-mechanism");
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole("button", { name: /^next$|to the challenge/i });
    const label = (await btn.textContent()) ?? "";
    await btn.click();
    await page.waitForTimeout(300);
    if (/challenge/i.test(label)) break;
  }

  // Challenge: 28 workers (12 + 16), run it.
  await expect(page.getByRole("heading", { name: /size the workers/i })).toBeVisible();
  const workers = page.getByRole("slider", { name: /^workers$/i });
  await workers.focus();
  for (let i = 0; i < 16; i++) await page.keyboard.press("ArrowRight");
  await shot("7-challenge-setup");
  await page.getByRole("button", { name: /deploy & take traffic/i }).click();
  await page.waitForTimeout(8000);
  await shot("8-challenge-running");
  await expect(page.getByRole("button", { name: /collect/i })).toBeVisible({ timeout: 90_000 });
  await shot("9-challenge-won");
  await page.getByRole("button", { name: /collect/i }).click();

  // Explain it back (no API key in tests: self-graded path).
  await explain(page);
  await expect(page.getByText(/service built/i)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2000);
  await shot("10-debrief");
});

async function explain(page: Page) {
  const box = page.getByRole("textbox", { name: /your explanation/i });
  await expect(box).toBeVisible();
  const skip = page.getByRole("button", { name: /^skip$/i });
  if (await skip.isVisible()) {
    await skip.click();
    return;
  }
  await box.fill("Little's law says in flight equals arrival rate times time in system, so workers not CPU cap throughput and a slow database raises W until workers run out.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  for (const name of [/^met$/i]) {
    const buttons = page.getByRole("button", { name });
    const n = await buttons.count();
    for (let i = 0; i < n; i++) await buttons.nth(i).click();
  }
  await page.getByRole("button", { name: /continue/i }).click();
}
