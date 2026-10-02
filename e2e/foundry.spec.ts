import { expect, test, type Page } from "@playwright/test";
import { explainAndFinish, noSideScroll, passHook, passMechanism } from "./helpers";

async function lockChoice(page: Page, option: RegExp) {
  await page.getByRole("radio", { name: option }).click();
  await page.getByRole("radio", { name: /70%/ }).click();
  await page.getByRole("button", { name: /lock it in/i }).click();
}

async function reveal(page: Page, shot?: () => Promise<unknown>) {
  await expect(page.getByRole("dialog", { name: /prediction result/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  if (shot) await shot();
  await page.getByRole("button", { name: /why\?/i }).click();
}

async function nudge(page: Page, slider: RegExp, key: "ArrowLeft" | "ArrowRight", n: number) {
  await page.getByRole("slider", { name: slider }).focus();
  for (let i = 0; i < n; i++) await page.keyboard.press(key);
}

test("tokens", async ({ page }, info) => {
  test.setTimeout(180_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/tokens-${n}-${info.project.name}.png` });
  await page.goto("/mission/tokens");
  await passHook(page);
  await lockChoice(page, /2 to 3 times/i);
  await lockChoice(page, /small json object/i);
  await page.getByRole("tab", { name: /telugu/i }).click();
  await page.getByRole("textbox", { name: /guess the token count/i }).fill("20");
  await page.getByRole("button", { name: /slice it/i }).click();
  await reveal(page, () => shot("1-telugu"));
  await page.getByRole("tab", { name: /json/i }).click();
  await page.getByRole("button", { name: /slice it/i }).click();
  await reveal(page, () => shot("2-json"));
  await passMechanism(page);
  for (const edit of [/preamble/i, /2 example replies/i, /fields the task never uses/i, /shorten json keys/i, /minify/i, /only the latest order/i]) {
    await page.getByRole("button", { name: edit }).click();
  }
  await shot("3-diet");
  await noSideScroll(page);
  await page.getByRole("button", { name: /ship the prompt/i }).click();
  await expect(page.getByRole("button", { name: /collect/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
});

test("context-windows", async ({ page }, info) => {
  test.setTimeout(180_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/context-${n}-${info.project.name}.png` });
  await page.goto("/mission/context-windows");
  await passHook(page);
  await lockChoice(page, /about 260,000/i);
  await lockChoice(page, /never sees it/i);
  // full history, drag the chat past turn 20
  await nudge(page, /^turn$/i, "ArrowRight", 14);
  await reveal(page, () => shot("1-history"));
  // keep the last 10 turns, drag past turn 30: the allergy is gone
  await page.getByRole("radio", { name: /^last n turns$/i }).click();
  await nudge(page, /^turn$/i, "ArrowRight", 12);
  await reveal(page, () => shot("2-forgot"));
  await passMechanism(page);
  await page.getByRole("radio", { name: /pinned \+ last n/i }).click();
  await nudge(page, /keep the last/i, "ArrowLeft", 4);
  await shot("3-policy");
  await noSideScroll(page);
  await page.getByRole("button", { name: /ship this policy/i }).click();
  await expect(page.getByRole("button", { name: /collect/i })).toBeVisible({ timeout: 15_000 });
  await shot("4-won");
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
});

test("boss: the bill", async ({ page }, info) => {
  test.setTimeout(180_000);
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/bill-${n}-${info.project.name}.png` });
  await page.goto("/dev/seed");
  await page.getByRole("button", { name: /foundry b1 missions done/i }).click();
  await expect(page.getByText(/seeded/)).toBeVisible();
  await page.goto("/foundry");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await shot("0-chapter");
  await page.getByRole("button", { name: /cut the bill/i }).click();
  await page.waitForTimeout(1200);
  await shot("1-intro");
  await page.getByRole("button", { name: /skip/i }).click();
  await page.waitForTimeout(800);
  // pinned profile + last 6, cached prefix, routed
  await page.getByRole("radio", { name: /pinned \+ last n/i }).click();
  await nudge(page, /keep the last/i, "ArrowLeft", 28);
  await page.getByRole("checkbox", { name: /cache the stable prefix/i }).check();
  await page.getByRole("radio", { name: /^router$/i }).click();
  await shot("2-design");
  await noSideScroll(page);
  await nudge(page, /forecast/i, "ArrowLeft", 1);
  await page.getByRole("radio", { name: /50%/ }).click();
  await page.getByRole("button", { name: /lock the forecast/i }).click();
  await page.getByRole("button", { name: /ship this policy/i }).click();
  await expect(page.getByRole("button", { name: /^debrief$/i })).toBeVisible({ timeout: 30_000 });
  await shot("3-won");
  await page.getByRole("button", { name: /^debrief$/i }).click();
  await page.getByRole("textbox", { name: /your explanation/i }).fill("The bill is tokens times price times volume. I pinned the profile and kept six turns, cached the identical prefix, and routed only hard turns to the big model.");
  await page.getByRole("button", { name: /^submit$/i }).click();
  const met = page.getByRole("button", { name: /^met$/i });
  await expect(met.first()).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < (await met.count()); i++) await met.nth(i).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /skip/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot("4-debrief");
  await expect(page.getByText(/boss survived/i).first()).toBeVisible();
});
