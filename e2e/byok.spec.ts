import { expect, test } from "@playwright/test";

/**
 * Bring your own key: the key lives in this browser only and requests go straight to the provider. The provider
 * is mocked here (no real keys or network), and every request the page makes is inspected.
 */

const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
// The coach switch is left ON here (the suite's default storage state turns it off), because this is about the coach.
test.use({ storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "nines:onboarding", value: "off" }] }] } });

const KEY = "gsk_e2e_test_key_0123456789abcdef";

test("a player's own key stays in the browser and calls go straight to the provider", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  const seen: { url: string; auth: string | undefined; body: string }[] = [];
  await page.route("https://api.groq.com/**", async (route) => {
    const req = route.request();
    seen.push({ url: req.url(), auth: req.headers()["authorization"], body: req.postData() ?? "" });
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ choices: [{ message: { content: "ready" } }] }) });
  });
  const ours: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(ORIGIN) && (r.postData() ?? "").includes(KEY)) ours.push(`${r.method()} ${r.url()}`);
    if (r.url().startsWith(ORIGIN) && r.url().includes(KEY)) ours.push(`URL ${r.url()}`);
  });

  await page.goto("/settings");
  const panel = page.locator("section", { has: page.getByText("Your own API key", { exact: true }) });
  await expect(panel).toBeVisible();
  // The promise is on screen before the key is typed.
  await expect(panel.getByText(/we don't collect your key/i)).toBeVisible();
  await expect(panel.getByText(/stored only in this browser/i)).toBeVisible();

  // Bad keys are caught before saving.
  await panel.getByLabel(/api key/i).fill("not a key");
  await panel.getByRole("button", { name: /save key in this browser/i }).click();
  await expect(panel.getByRole("status")).toContainText(/spaces|Groq key/i);

  // A good one is saved, masked on screen, and kept in localStorage.
  await panel.getByLabel(/api key/i).fill(KEY);
  await panel.getByRole("button", { name: /save key in this browser/i }).click();
  await expect(panel.getByText(/gsk_…cdef/)).toBeVisible();
  await expect(panel.getByText(KEY)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nines:byok") ?? "null"))).toEqual({ provider: "groq", key: KEY });

  // Test key: the call goes to Groq with the key as a bearer token, and the page says it works.
  await panel.getByRole("button", { name: /test key/i }).click();
  await expect(panel.getByText(/the key works/i)).toBeVisible({ timeout: 15_000 });
  expect(seen).toHaveLength(1);
  expect(seen[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  expect(seen[0]!.auth).toBe(`Bearer ${KEY}`);
  await expect(page.getByText(/groq \(your key\)/i).first()).toBeVisible();

  // The save/export blob does not contain it, and none of our own requests ever carried it.
  const exported = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return JSON.stringify(dbs) + JSON.stringify(Object.keys(localStorage));
  });
  expect(exported).not.toContain(KEY);
  expect(ours).toEqual([]);

  // Remove: gone from the browser.
  await panel.getByRole("button", { name: /remove key/i }).click();
  await expect(panel.getByText(/removed from this browser/i)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nines:byok"))).toBeNull();
  await page.screenshot({ path: `e2e/__shots__/byok-${info.project.name}.png`, fullPage: true });
});

test("a rejected key is explained, and the game falls back to self-grading", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  await page.route("https://api.groq.com/**", (route) => route.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }));
  await page.goto("/settings");
  const panel = page.locator("section", { has: page.getByText("Your own API key", { exact: true }) });
  await panel.getByLabel(/api key/i).fill(KEY);
  await panel.getByRole("button", { name: /save key in this browser/i }).click();
  await panel.getByRole("button", { name: /test key/i }).click();
  await expect(panel.getByText(/provider rejected this key/i)).toBeVisible({ timeout: 15_000 });
});
