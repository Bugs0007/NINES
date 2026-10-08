import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * The real stack: a real browser, the real Next server, the real Supabase project. Sign-in goes through the app's
 * own dialog and Supabase's own emailed-code mechanism (verifyOtp); the only thing replaced is the email delivery
 * (the "send" request is answered locally, the code comes from the admin API). Throwaway users are deleted after.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.skip(!url || !anon || !service, "needs NEXT_PUBLIC_SUPABASE_URL, a public key and SUPABASE_SERVICE_ROLE_KEY in .env");

const admin = url && service ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) : null!;
const created: string[] = [];
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

test.afterAll(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  for (const u of data?.users ?? []) if (u.email && created.includes(u.email)) await admin.auth.admin.deleteUser(u.id);
  const left = await admin.from("profiles").select("id").in("email", created);
  expect(left.data ?? [], "throwaway users cleaned up").toEqual([]);
});

const briefing = (p: Page) => p.getByRole("dialog", { name: /^briefing$/i });
const startPrompt = (p: Page) => p.getByRole("dialog", { name: /create your engineer profile/i });
const usernameDlg = (p: Page) => p.getByRole("dialog", { name: /pick a username/i });
const tour = (p: Page) => p.getByRole("dialog", { name: /guided tour/i });
const noOverlays = async (p: Page, why: string) => {
  await p.waitForTimeout(3500);
  expect(await p.locator('[role="dialog"]').count(), `${why}: no dialog should be open`).toBe(0);
};

/** A user that exists, plus the 6-digit code Supabase would have emailed them. */
async function userWithCode(email: string) {
  if (!created.includes(email)) {
    created.push(email);
    const c = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(c.error).toBeNull();
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  expect(link.error).toBeNull();
  return link.data.properties!.email_otp;
}

/** The app asks Supabase to email a code; answer that one request locally so no real email is sent. */
async function swallowOtpEmail(page: Page) {
  await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

async function signInWithCode(page: Page, email: string) {
  const code = await userWithCode(email);
  await swallowOtpEmail(page);
  const dlg = page.getByRole("dialog", { name: /create your engineer profile|save your progress|save it so it's yours/i });
  await dlg.getByRole("textbox", { name: /email address/i }).fill(email);
  await dlg.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(dlg.getByText(/we emailed/i)).toBeVisible();
  // The code is the one Supabase would have put in the email.
  await dlg.getByRole("textbox", { name: /code from the email/i }).fill(code);
  await dlg.getByRole("button", { name: /verify code/i }).click();
}

async function firstRun(page: Page, email: string, username: string) {
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(page)).toBeVisible({ timeout: 15_000 });
  await signInWithCode(page, email);
  await expect(usernameDlg(page)).toBeVisible({ timeout: 30_000 });
  await usernameDlg(page).getByRole("textbox", { name: /username/i }).fill(username);
  await usernameDlg(page).getByRole("button", { name: /save username/i }).click();
  await expect(usernameDlg(page)).toBeHidden({ timeout: 20_000 });
}

test("real sign-in with an emailed code, then a username, then the tour, and nothing replays", async ({ page }, info) => {
  const s = stamp();
  const email = `nines-real-${info.project.name}-${s}@example.com`;
  const username = `real_${s}`.replace(/[^a-z0-9_]/g, "").slice(0, 20);
  await firstRun(page, email, username);

  // Signed in for real: a Supabase session cookie, /api/me on the real server, the username in the real database.
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => /^sb-.*-auth-token/.test(c.name)), "a Supabase session cookie").toBe(true);
  const me = (await (await page.request.get("/api/me")).json()) as { status: string; user: { email: string; username: string; role: string }; auth: { storage: string; dev: boolean } };
  expect(me).toMatchObject({ status: "signed-in", user: { email, username, role: "player" }, auth: { storage: "supabase", dev: false } });
  const row = await admin.from("profiles").select("email,username,display_name").eq("email", email).maybeSingle();
  expect(row.data?.username).toBe(username);
  await expect(page.getByRole("link", { name: new RegExp(`@${username}`) })).toBeVisible();

  // The tour comes only now, and plays once.
  await expect(tour(page)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `e2e/__shots__/real-tour-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(tour(page)).toBeHidden();
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await noOverlays(page, `reload ${i + 1}`);
  }
  await page.goto("/settings");
  await page.getByRole("link", { name: /back to hq/i }).click();
  await noOverlays(page, "back at the HQ");
  await page.screenshot({ path: `e2e/__shots__/real-hq-${info.project.name}.png` });
});

test("a returning player signs back in with a code and is not asked for a username or shown the tour again; progress is kept", async ({ page, browser }, info) => {
  const s = stamp();
  const email = `nines-real-return-${info.project.name}-${s}@example.com`;
  const username = `ret_${s}`.replace(/[^a-z0-9_]/g, "").slice(0, 20);
  await firstRun(page, email, username);
  await expect(tour(page)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");

  // Real progress, validated and stored by the real server.
  const put = await page.request.put("/api/progress", { data: { rows: [{ section: "a1", level: "latency-numbers", status: "completed", score: 50, attempts: 1 }], blob: { version: 1, profile: { seen: ["briefing:v1"] } }, savedAt: Date.now() } });
  expect(((await put.json()) as { rows: number }).rows).toBe(1);

  // Sign out through the app, then in again from a brand-new browser (nothing local at all).
  await page.goto("/settings");
  await page.getByRole("button", { name: /^sign out$/i }).click();
  await expect(page.getByText(/playing as a guest/i)).toBeVisible({ timeout: 20_000 });
  expect(((await (await page.request.get("/api/me")).json()) as { status: string }).status).toBe("guest");

  const fresh = await browser.newContext({ ...(info.project.use as object), storageState: { cookies: [], origins: [{ origin: new URL(info.project.use.baseURL!).origin, localStorage: [{ name: "nines:ai", value: "off" }] }] } });
  const p2 = await fresh.newPage();
  await p2.goto("/");
  await expect(briefing(p2)).toBeVisible({ timeout: 30_000 });
  await p2.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(p2)).toBeVisible({ timeout: 15_000 });
  await signInWithCode(p2, email);
  // Their username is already saved, so there is no username dialog; the server copy brings their progress back.
  await expect(p2.getByRole("link", { name: new RegExp(`@${username}`) })).toBeVisible({ timeout: 30_000 });
  const back = (await (await p2.request.get("/api/progress")).json()) as { rows: { level: string; status: string }[] };
  expect(back.rows).toEqual([expect.objectContaining({ level: "latency-numbers", status: "completed" })]);
  await expect(usernameDlg(p2)).toBeHidden();
  await fresh.close();
});

test("'Continue with Google' reaches Google's sign-in with this project's callback", async ({ page }, info) => {
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(page)).toBeVisible({ timeout: 15_000 });
  await Promise.all([page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 }), startPrompt(page).getByRole("button", { name: /continue with google/i }).click()]);
  const u = new URL(page.url());
  expect(u.hostname).toBe("accounts.google.com");
  expect(u.searchParams.get("redirect_uri")).toBe(`${url}/auth/v1/callback`);
  expect(u.searchParams.get("client_id")).toBeTruthy();
  await expect(page).toHaveTitle(/Sign in - Google Accounts/i);
  await page.screenshot({ path: `e2e/__shots__/real-google-${info.project.name}.png` });
});

test("inside LinkedIn's in-app browser Google is hidden and the email code is offered", async ({ browser }, info) => {
  const origin = new URL(info.project.use.baseURL!).origin;
  const ctx = await browser.newContext({
    ...(info.project.use as object),
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 LinkedInApp",
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "nines:ai", value: "off" }] }] },
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /skip briefing/i }).click();
  await expect(startPrompt(page)).toBeVisible({ timeout: 15_000 });
  await expect(startPrompt(page).getByRole("button", { name: /continue with google/i })).toHaveCount(0);
  await expect(startPrompt(page).getByText(/doesn't work inside this app's built-in browser/i)).toBeVisible();
  await expect(startPrompt(page).getByRole("button", { name: /email me a sign-in link/i })).toBeVisible();
  await ctx.close();
});
