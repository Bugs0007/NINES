import { expect, test, type Page } from "@playwright/test";
import { skipIntro } from "./helpers";

async function answerCurrent(page: Page, shot: (n: string) => Promise<unknown>, k: number) {
  const chip = (await page.locator("main").innerText()).toLowerCase();
  if (chip.includes("estimathon")) {
    await page.getByRole("textbox", { name: /your estimate/i }).fill("1000");
    if (k < 20) await shot(`est`);
    await page.getByRole("button", { name: /commit/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    return;
  }
  if (chip.includes("pick the fix")) await page.getByRole("radio").first().click();
  else if (chip.includes("predict the graph")) await page.locator("main button[aria-pressed]").first().click();
  // Nodes, not edges: a horizontal edge's SVG box has zero height, which Playwright treats as invisible.
  else if (chip.includes("spot the flaw")) await page.locator("main svg g[role=button]").first().click();
  else if (chip.includes("estimate")) await page.getByRole("textbox", { name: /your estimate/i }).fill("50");
  else if (chip.includes("tune it")) {
    await page.getByRole("button", { name: /run 60s/i }).click();
    await expect(page.getByText(/→/).first()).toBeVisible({ timeout: 20_000 });
  } else if (chip.includes("explain it")) await page.getByRole("textbox", { name: /your explanation/i }).fill("Because the requests hold workers while they wait on the database, so capacity is workers over time.");
  if (!chip.includes("explain it")) await page.getByRole("radio", { name: /70%/ }).click();
  await shot(`review-${k}`);
  await page.getByRole("button", { name: /^submit$/i }).click();
  if (chip.includes("explain it")) {
    const met = page.getByRole("button", { name: /^met$/i });
    await expect(met.first()).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < (await met.count()); i++) await met.nth(i).click();
    await page.getByRole("button", { name: /record my grade/i }).click();
  }
  await page.getByRole("button", { name: /^continue$/i }).click();
  const why = page.getByText(/^why\?$/i);
  if (await why.isVisible().catch(() => false)) {
    await page.locator("main").getByRole("button").filter({ hasNotText: /continue/i }).first().click();
    await page.getByRole("button", { name: /^continue$/i }).click();
  }
}

test("daily shift with decayed services", async ({ page }, info) => {
  test.setTimeout(240_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/shift-${n}-${info.project.name}.png` });
  await page.goto("/dev/seed");
  await page.getByRole("button", { name: /mixed decay/i }).click();
  await expect(page.getByText(/seeded/)).toBeVisible();
  await page.goto("/shift");
  await skipIntro(page);
  await expect(page.getByRole("heading", { name: /clocking in/i })).toBeVisible();
  await shot("0-brief");
  await page.getByRole("button", { name: /^start$/i }).click();
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(600);
    if (await page.getByText(/shift complete/i).isVisible().catch(() => false)) break;
    await answerCurrent(page, shot, k);
  }
  await expect(page.getByText(/shift complete/i)).toBeVisible();
  await page.waitForTimeout(1200);
  await shot("9-report");
  await page.getByRole("button", { name: /back to hq/i }).click();
  await page.waitForTimeout(2500);
  await shot("10-hq-after");
});
