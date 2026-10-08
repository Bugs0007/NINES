import { expect, test, type Page } from "@playwright/test";
import { explainAndFinish, passHook, passMechanism } from "./helpers";

/**
 * Accounts without Supabase credentials: the dev email login stands in for Google/email, and the local JSON
 * store stands in for Postgres. Everything else (the prompt, the dialog, validation, rate limiting, deletion,
 * the admin page) is the real code path.
 */

const ONBOARDING_OFF = { cookies: [], origins: [{ origin: `http://localhost:${process.env.E2E_PORT ?? 3100}`, localStorage: [{ name: "nines:ai", value: "off" }, { name: "nines:onboarding", value: "off" }] }] };

async function devSignIn(page: Page, email: string) {
  const r = await page.request.post("/api/dev-login", { data: { email } });
  expect(r.ok()).toBe(true);
}

/** Play Latency Numbers from the hook to the debrief, the way a first-time guest would. */
async function playLevelOne(page: Page) {
  await page.goto("/mission/latency-numbers");
  await page.waitForTimeout(1500);
  await passHook(page);
  await page.getByRole("radio", { name: /50%/ }).click();
  await page.getByRole("button", { name: /lock it in/i }).click();
  await page.getByRole("button", { name: /race them/i }).click();
  await expect(page.getByRole("dialog", { name: /prediction result/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /why\?/i }).click();
  await page.getByRole("button", { name: /^next$/i }).click();
  await passMechanism(page);
  await expect(page.getByRole("heading", { name: /one-second profile/i })).toBeVisible();
  await page.getByRole("button", { name: /take recs off the critical path/i }).click();
  await page.getByRole("button", { name: /serve avatars/i }).click();
  await page.getByRole("button", { name: /ship it/i }).click();
  await page.getByRole("button", { name: /collect/i }).click();
  await explainAndFinish(page);
}

test("guest plays level 1, is asked to save, signs up, keeps their progress, then deletes it", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ storageState: ONBOARDING_OFF });
  const page = await ctx.newPage();
  const email = `signup-${Date.now()}@nines.test`;

  // Level 1 is never behind sign-in: a guest just plays.
  await playLevelOne(page);

  // The nudge appears after the first completed level, and only then.
  const prompt = page.getByRole("region", { name: /save your progress/i });
  await expect(prompt).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/signup-1-prompt-${info.project.name}.png` });
  await prompt.getByRole("button", { name: /save my progress/i }).click();

  // The dialog: consent line, Google/email options, a way to say no.
  const dialog = page.getByRole("dialog", { name: /save it so it's yours/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/by continuing you agree to the/i)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  await expect(dialog.getByRole("button", { name: /not now, keep playing/i })).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/signup-2-dialog-${info.project.name}.png` });
  await dialog.getByRole("textbox", { name: /email address/i }).fill(email);
  await dialog.getByRole("button", { name: /sign in \(development only\)/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // The local progress was migrated to the account as validated rows.
  await expect
    .poll(async () => {
      const j = (await (await page.request.get("/api/progress")).json()) as { rows?: { level: string; status: string }[] };
      return (j.rows ?? []).some((r) => r.level === "latency-numbers" && r.status === "completed");
    }, { timeout: 30_000 })
    .toBe(true);
  const me = (await (await page.request.get("/api/me")).json()) as { status: string; user: { email: string } };
  expect(me.status).toBe("signed-in");
  expect(me.user.email).toBe(email);

  // A second browser signs in and gets the progress back.
  const other = await browser.newContext({ storageState: ONBOARDING_OFF });
  const p2 = await other.newPage();
  await devSignIn(p2, email);
  await p2.goto("/campaign/a1");
  await expect(p2.getByText(/1\s*\/\s*6 services built/i)).toBeVisible({ timeout: 30_000 });
  await other.close();

  // Delete my account and data: two taps, then everything is gone server-side.
  await page.goto("/settings");
  await expect(page.getByText(/signed in as/i)).toBeVisible();
  await page.getByRole("button", { name: /delete my account and data/i }).click();
  await page.getByRole("button", { name: /tap again: delete my account and data/i }).click();
  await expect(page.getByText(/playing as a guest/i)).toBeVisible({ timeout: 30_000 });
  expect((await page.request.get("/api/progress")).status()).toBe(401);
  await devSignIn(page, email);
  const after = (await (await page.request.get("/api/progress")).json()) as { rows: unknown[]; progress: unknown };
  expect(after.rows).toEqual([]);
  expect(after.progress).toBeNull();
  await ctx.close();
});

test("'Not now' on the first-level prompt is remembered and nothing is locked", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ storageState: ONBOARDING_OFF });
  const page = await ctx.newPage();
  await playLevelOne(page);
  const prompt = page.getByRole("region", { name: /save your progress/i });
  await prompt.getByRole("button", { name: /not now/i }).click();
  await expect(prompt).toBeHidden();
  // Still a guest, still able to play the next level, and Save progress stays one click away in the HQ header.
  await page.goto("/");
  await expect(page.getByRole("button", { name: /save progress/i })).toBeVisible();
  await page.goto("/mission/littles-law");
  await expect(page.getByRole("button", { name: /continue|take it|acknowledge|lock it in/i }).first()).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test("the server refuses progress that can't be real, and rate-limits writes", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  const ctx = await browser.newContext({ storageState: ONBOARDING_OFF });
  const page = await ctx.newPage();
  await devSignIn(page, `cheat-${Date.now()}@nines.test`);
  const put = (rows: unknown[]) => page.request.put("/api/progress", { data: { rows } });
  const row = (level: string, over: Record<string, unknown> = {}) => ({ section: "a1", level, status: "completed", score: 100, attempts: 1, ...over });

  // Skipping straight to the boss, a level that doesn't exist, a wrong section: all refused, none stored.
  const r = await (await put([row("boss-launch-day"), row("no-such-level"), row("latency-numbers", { section: "b1" })])).json();
  expect(r.ok).toBe(true);
  expect(r.rows).toBe(0);
  expect((r.rejected as { reason: string }[]).map((x) => x.reason).join("|")).toMatch(/prerequisites.*unknown level.*wrong section/);

  // Impossible numbers or extra fields reject the whole write.
  const bad = await (await put([row("latency-numbers", { score: 500 })])).json();
  expect(bad.rejected[0].reason).toBe("malformed rows");
  const extra = await (await put([row("latency-numbers", { xp: 9999 })])).json();
  expect(extra.rejected[0].reason).toBe("malformed rows");

  // A legitimate level goes in; trying to roll it back doesn't.
  expect((await (await put([row("latency-numbers", { score: 50, attempts: 3 })])).json()).rows).toBe(1);
  await put([row("latency-numbers", { status: "in_progress", score: null, attempts: 1 })]);
  const kept = (await (await page.request.get("/api/progress")).json()) as { rows: { level: string; status: string; score: number; attempts: number }[] };
  expect(kept.rows.find((x) => x.level === "latency-numbers")).toMatchObject({ status: "completed", score: 50, attempts: 3 });

  // Hammering the endpoint is limited per player.
  const statuses: number[] = [];
  for (let i = 0; i < 30; i++) statuses.push((await put([row("latency-numbers")])).status());
  expect(statuses).toContain(429);

  // A guest can't write at all.
  const anon = await (await browser.newContext({ storageState: ONBOARDING_OFF })).request.put("/api/progress", { data: { rows: [] } });
  expect(anon.status()).toBe(401);
  await ctx.close();
});

test("/admin is for admins only and shows signups, players and the funnel", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  const guest = await browser.newContext({ storageState: ONBOARDING_OFF });
  const gp = await guest.newPage();
  expect((await gp.goto("/admin"))?.status()).toBe(404);

  const player = await browser.newContext({ storageState: ONBOARDING_OFF });
  const pp = await player.newPage();
  await devSignIn(pp, "player@nines.test");
  expect((await pp.goto("/admin"))?.status()).toBe(404);
  expect((await pp.goto("/dev/seed"))?.status()).toBeLessThan(500);

  const admin = await browser.newContext({ storageState: ONBOARDING_OFF });
  const ap = await admin.newPage();
  await devSignIn(ap, "admin@nines.test");
  await ap.goto("/admin");
  await expect(ap.getByRole("heading", { name: /^admin$/i })).toBeVisible();
  for (const label of [/signups/i, /funnel/i, /^visited$/i, /signed up/i, /finished level 1/i, /finished launch day/i, /finished tokens & context/i]) await expect(ap.getByText(label).first()).toBeVisible();
  await expect(ap.getByRole("heading", { name: /players \(/i })).toBeVisible();
  await ap.screenshot({ path: `e2e/__shots__/admin-${info.project.name}.png`, fullPage: true });
  await guest.close();
  await player.close();
  await admin.close();
});

test("settings: sign-in lives in one place, and privacy shows the contact line", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(/playing as a guest/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /sign in to save progress/i }).click();
  await expect(page.getByRole("dialog", { name: /save your progress/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /save your progress/i })).toBeHidden();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /^contact$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /your own api key/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /deleting your data/i })).toBeVisible();
});
