import { expect, test, type Page } from "@playwright/test";
import { explainAndFinish, passHook, passMechanism } from "./helpers";

async function lockChoice(page: Page, option: RegExp) {
  await page.getByRole("radio", { name: option }).click();
  await page.getByRole("radio", { name: /70%/ }).click();
  await page.getByRole("button", { name: /lock it in/i }).click();
}

async function reveal(page: Page, shot?: () => Promise<unknown>) {
  await expect(page.getByRole("dialog", { name: /prediction result/i })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(700);
  if (shot) await shot();
  await page.getByRole("button", { name: /why\?/i }).click();
}

async function winChallenge(page: Page, run: RegExp) {
  await page.getByRole("button", { name: run }).click();
  await expect(page.getByRole("button", { name: /collect/i })).toBeVisible({ timeout: 120_000 });
}

test("scale-up-vs-out", async ({ page }, info) => {
  test.setTimeout(300_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/scale-${n}-${info.project.name}.png` });
  await page.goto("/mission/scale-up-vs-out");
  await passHook(page);
  await lockChoice(page, /one big box/i);
  await lockChoice(page, /total outage until/i);
  const load = page.getByRole("slider", { name: /how busy/i });
  await load.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // 0.5 -> 0.85
  await page.waitForTimeout(6000);
  await shot("1-compare");
  await reveal(page);
  await page.getByRole("button", { name: /kill the box/i }).click();
  await page.getByRole("button", { name: /kill one box/i }).click();
  await page.waitForTimeout(4000);
  await shot("2-killed");
  await reveal(page);
  await passMechanism(page);
  await page.getByRole("radio", { name: /^large$/i }).click();
  const count = page.getByRole("slider", { name: /how many/i });
  await count.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight"); // 2 -> 5
  await shot("3-plan");
  await page.getByRole("button", { name: /post to hacker news/i }).click();
  await page.waitForTimeout(20000);
  await shot("4-hug");
  await expect(page.getByRole("button", { name: /collect/i })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
});

test("load-balancing", async ({ page }, info) => {
  test.setTimeout(300_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/lb-${n}-${info.project.name}.png` });
  await page.goto("/mission/load-balancing");
  await passHook(page);
  await lockChoice(page, /about a quarter/i);
  await lockChoice(page, /drops back/i);
  await page.waitForTimeout(8000);
  await page.getByRole("button", { name: /^slow$/i }).first().click();
  await page.waitForTimeout(8000);
  await shot("1-slow-rr");
  await reveal(page);
  await page.getByRole("button", { name: /least outstanding/i }).click();
  await reveal(page, () => shot("2-lor"));
  await passMechanism(page);
  await page.getByRole("button", { name: /least outstanding/i }).click();
  await page.getByRole("checkbox", { name: /passive ejection/i }).check();
  await winChallenge(page, /start the night shift/i);
  await shot("3-won");
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
});

test("stateless-services", async ({ page }, info) => {
  test.setTimeout(300_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/sessions-${n}-${info.project.name}.png` });
  await page.goto("/mission/stateless-services");
  await passHook(page);
  await lockChoice(page, /about half/i);
  await lockChoice(page, /about two-thirds/i);
  await page.waitForTimeout(3000);
  await shot("1-local");
  await reveal(page);
  await page.getByRole("button", { name: /sticky \+ memory/i }).click();
  await page.waitForTimeout(12000);
  await page.getByRole("radio", { name: /3 boxes/i }).click();
  await reveal(page, () => shot("2-reshuffle"));
  await passMechanism(page);
  await page.getByRole("button", { name: /^redis/i }).click();
  await winChallenge(page, /ship deploy v42/i);
  await shot("3-won");
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
});
