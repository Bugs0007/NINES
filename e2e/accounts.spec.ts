import { expect, test, type Page } from "@playwright/test";

async function seedChapter1(page: Page) {
  await page.goto("/dev/seed");
  await page.getByRole("button", { name: /chapter 1 done/i }).click();
  await expect(page.getByText(/seeded/)).toBeVisible();
}

async function devSignIn(page: Page, email: string) {
  await page.goto("/settings");
  await page.getByRole("textbox", { name: /dev login email/i }).fill(email);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 30_000 });
}

test("guests and players see the public edition; the owner sees their own", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(240_000);
  await seedChapter1(page);

  // guest
  await page.goto("/codex/littles-law");
  await expect(page.getByText(/where you.ve seen it/i)).toBeVisible();
  await expect(page.getByText(/gunicorn sync workers on a small EC2 box/i)).toBeVisible();
  await expect(page.getByText(/case intel/i)).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText(/nothing is deployed here/i)).toBeVisible();

  // player
  await devSignIn(page, "player@nines.test");
  await page.goto("/codex/littles-law");
  await expect(page.getByText(/where you.ve seen it/i)).toBeVisible();
  await expect(page.getByText(/case intel/i)).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText(/nothing is deployed here/i)).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByText(/playing as a guest/i)).toBeVisible({ timeout: 20_000 });

  // owner
  await devSignIn(page, "owner@nines.test");
  await expect(page.getByText(/admin page/i)).toBeVisible();
  await page.goto("/codex/littles-law");
  await expect(page.getByText(/case intel/i).first()).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /^admin$/i })).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/admin-${info.project.name}.png` });
});

test("a signed-in player's progress follows them to a new browser", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(240_000);
  const email = `sync-${Date.now()}@nines.test`;

  const a = await browser.newContext();
  const pa = await a.newPage();
  await seedChapter1(pa);
  await devSignIn(pa, email);
  // the first sign-in uploads the local save (the account is new)
  await expect.poll(async () => (await (await pa.request.get("/api/progress")).json()).progress !== null, { timeout: 30_000 }).toBe(true);
  await a.close();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await devSignIn(pb, email);
  // the server save has more progress, so it replaces the empty local one (page reloads)
  await pb.waitForTimeout(4000);
  await pb.goto("/campaign/a1");
  await pb.keyboard.press("Escape");
  await expect(pb.getByText(/6\s*\/\s*6 services built/i)).toBeVisible({ timeout: 30_000 });
  await b.close();
});
