import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The first run end to end: briefing, then the sign-in prompt, then a username, then the tour, each once. And the
 * ways they used to come back: reloading mid-way, going back, and a saved copy from the server that predates them.
 * First-visit overlays are ON here (the rest of the suite turns them off with nines:onboarding).
 */

const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const FRESH = { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "nines:ai", value: "off" }] }] };
test.use({ storageState: FRESH });

const briefing = (p: Page) => p.getByRole("dialog", { name: /^briefing$/i });
const startPrompt = (p: Page) => p.getByRole("dialog", { name: /create your engineer profile/i });
const usernameDlg = (p: Page) => p.getByRole("dialog", { name: /pick a username/i });
const tour = (p: Page) => p.getByRole("dialog", { name: /guided tour/i });
const noOverlays = async (p: Page, why: string) => {
  await p.waitForTimeout(3500);
  expect(await p.locator('[role="dialog"]').count(), `${why}: no dialog of any kind should be open`).toBe(0);
};

/** Play the first-run steps as a new visitor who signs in with email and picks a username. Returns the username. */
async function firstRunSignedIn(page: Page, email: string, username: string) {
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
  await startPrompt(page).getByRole("textbox", { name: /email address/i }).fill(email);
  await startPrompt(page).getByRole("button", { name: /sign in \(development only\)/i }).click();
  await expect(usernameDlg(page)).toBeVisible({ timeout: 20_000 });
  await usernameDlg(page).getByRole("textbox", { name: /username/i }).fill(username);
  await usernameDlg(page).getByRole("button", { name: /save username/i }).click();
  await expect(usernameDlg(page)).toBeHidden({ timeout: 15_000 });
  await expect(tour(page)).toBeVisible({ timeout: 15_000 });
  await tour(page).getByRole("button", { name: /skip tour/i }).click();
  await expect(tour(page)).toBeHidden();
}

const uniq = () => Date.now().toString(36);

test("sign in right after the lore, pick a username, then the tour, and none of it comes back", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(240_000);
  const stamp = uniq();
  const email = `first-${stamp}@nines.test`;
  const username = `pigeon_${stamp}`.slice(0, 20);

  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByRole("button", { name: /show me hq/i }).click();

  // 1. The sign-in prompt, straight after the lore.
  await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
  await expect(tour(page)).toBeHidden();
  await startPrompt(page).getByRole("textbox", { name: /email address/i }).fill(email);
  await startPrompt(page).getByRole("button", { name: /sign in \(development only\)/i }).click();

  // 2. Signed in: choose a username. Bad names are explained, good ones saved.
  const dlg = usernameDlg(page);
  await expect(dlg).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `e2e/__shots__/username-${info.project.name}.png` });
  const box = dlg.getByRole("textbox", { name: /username/i });
  const save = dlg.getByRole("button", { name: /save username/i });
  for (const [bad, message] of [["ab", /at least 3/], ["admin", /reserved/], ["has space", /letters, numbers and underscores/], ["12345", /letters/]] as const) {
    await box.fill(bad);
    await save.click();
    await expect(dlg.getByRole("alert")).toContainText(message);
  }
  await box.fill(username.toUpperCase()); // typed in capitals: stored in lowercase
  await save.click();
  await expect(dlg).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(`@${username}`) })).toBeVisible();
  expect(((await (await page.request.get("/api/me")).json()) as { user: { username: string } }).user.username).toBe(username);

  // 3. Only now the tour.
  await expect(tour(page)).toBeVisible({ timeout: 15_000 });
  await tour(page).getByRole("button", { name: /skip tour/i }).click();

  // None of it comes back: reloads, client navigation, and the back button.
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await noOverlays(page, `reload ${i + 1}`);
  }
  await page.getByRole("link", { name: new RegExp(`@${username}`) }).click();
  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  await expect(page.getByText(`@${username}`).first()).toBeVisible();
  await page.getByRole("link", { name: /back to hq/i }).click();
  await noOverlays(page, "back at the HQ via a link");
  await page.goBack();
  await page.goForward();
  await noOverlays(page, "history back and forward");

  // Usernames are unique: another player can't take it.
  const other = await browser.newContext({ storageState: FRESH });
  const op = await other.newPage();
  await op.request.post("/api/dev-login", { data: { email: `second-${stamp}@nines.test` } });
  const taken = await op.request.put("/api/profile", { data: { username } });
  expect(taken.status()).toBe(409);
  expect(((await taken.json()) as { message: string }).message).toMatch(/already has that username/);
  await other.close();
});

test("reloading in the middle of the tour doesn't make it play again", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
  await startPrompt(page).getByRole("button", { name: /continue as a guest/i }).click();
  await expect(tour(page)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("ArrowRight"); // step 2 of 5, then leave without finishing
  await page.reload();
  await noOverlays(page, "after reloading mid-tour");
  await page.goto("/settings");
  await page.goto("/");
  await noOverlays(page, "after leaving and coming back");
});

test("reloading in the middle of the briefing doesn't replay it either", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("ArrowRight");
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(briefing(page)).toBeHidden();
});

async function wipeSave(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const req = indexedDB.deleteDatabase("nines");
        req.onsuccess = req.onerror = req.onblocked = () => done();
      }),
  );
}

test("a saved copy from the server that predates the tour can't bring it back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(240_000);
  const stamp = uniq();
  await firstRunSignedIn(page, `sync-${stamp}@nines.test`, `sync_${stamp}`.slice(0, 20));
  // Wait for the account's save to exist on the server.
  await expect.poll(async () => ((await (await page.request.get("/api/progress")).json()) as { progress: unknown }).progress !== null, { timeout: 30_000 }).toBe(true);

  // Replace the server copy with a NEWER one that has never heard of the briefing, prompt or tour: exactly what an
  // older device would leave behind. The browser will import it (newer wins) and reload.
  const current = ((await (await page.request.get("/api/progress")).json()) as { progress: { blob: { profile: { seen: string[] } } } }).progress.blob;
  const future = Date.now() + 10 * 60_000;
  const stale = { ...current, profile: { ...current.profile, seen: [] as string[] } };
  expect((await page.request.put("/api/progress", { data: { blob: stale, savedAt: future } })).ok()).toBe(true);

  await page.reload();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("nines:savedAt")), { timeout: 30_000, message: "the browser should have imported the server copy" }).toBe(String(future));
  await noOverlays(page, "after importing a server copy with an empty seen list");

  // Even if the whole local save is wiped (a reset, cleared site data for IndexedDB only), the flags on this browser hold.
  await wipeSave(page);
  await page.reload();
  await noOverlays(page, "after the local save was wiped");
});

async function playerWithName(browser: Browser, email: string, name: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "nines:ai", value: "off" }, { name: "nines:onboarding", value: "off" }] }] } });
  await ctx.request.post(`${ORIGIN}/api/dev-login`, { data: { email } });
  const r = await ctx.request.put(`${ORIGIN}/api/profile`, { data: { username: name } });
  return { ctx, status: r.status() };
}

test("/api/profile: only signed-in players, valid names only, unique, and rate limited", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  const stamp = uniq();
  const guest = await browser.newContext({ storageState: FRESH });
  expect((await guest.request.put(`${ORIGIN}/api/profile`, { data: { username: "somebody" } })).status()).toBe(401);
  await guest.close();

  const a = await playerWithName(browser, `api-a-${stamp}@nines.test`, `api_a_${stamp}`.slice(0, 20));
  expect(a.status).toBe(200);
  const put = (data: unknown) => a.ctx.request.put(`${ORIGIN}/api/profile`, { data });
  for (const bad of ["ab", "admin", "x".repeat(21), "bad name", "naïve"]) expect((await put({ username: bad })).status(), bad).toBe(400);
  expect((await put({ username: "fine_name", extra: 1 })).status()).toBe(400); // unknown fields refused
  expect((await put({ nope: true })).status()).toBe(400);
  const b = await playerWithName(browser, `api-b-${stamp}@nines.test`, `api_a_${stamp}`.slice(0, 20));
  expect(b.status, "someone else's name").toBe(409);
  await b.ctx.close();
  // Changing your own name is fine, and the new one frees the old.
  expect((await put({ username: `api_a2_${stamp}`.slice(0, 20) })).status()).toBe(200);
  const statuses: number[] = [];
  for (let i = 0; i < 14; i++) statuses.push((await put({ username: `rl_${i}_${stamp}`.slice(0, 20) })).status());
  expect(statuses).toContain(429);
  await a.ctx.close();
});
