import { expect, test, type Page } from "@playwright/test";
import { noSideScroll, skipIntro } from "./helpers";

/**
 * First-visit experience: the briefing, the guided tour, the "next step" card, section labels, and replays.
 * These tests keep first-visit overlays ON (everything else in the suite turns them off with nines:onboarding).
 */

const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
test.use({ storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "nines:ai", value: "off" }] }] } });

const briefing = (page: Page) => page.getByRole("dialog", { name: /^briefing$/i });
const tour = (page: Page) => page.getByRole("dialog", { name: /guided tour/i });
const startPrompt = (page: Page) => page.getByRole("dialog", { name: /create your engineer profile/i });

/** Close whatever first-visit overlays are up (briefing, sign-in prompt, tour), as a player pressing Escape would. */
async function clearOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    if (!(await page.locator('[role="dialog"]').count())) break;
    await page.keyboard.press("Escape");
  }
}

test("a first-time visitor gets the briefing, then the tour, once", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto("/");

  // Four short screens, in the Pigeon story.
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /welcome to pigeon/i })).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/briefing-1-${info.project.name}.png` });
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByRole("heading", { name: /growing fast, breaking faster/i })).toBeVisible();
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByRole("heading", { name: /keep pigeon online/i })).toBeVisible();
  await page.getByRole("button", { name: /^next$/i }).click();
  await expect(page.getByRole("heading", { name: /five places, five crises/i })).toBeVisible();
  // Every section appears with its department.
  for (const s of ["Core Grid", "Agent Foundry", "Daily Shift", "Incident Room", "Codex"]) await expect(briefing(page).getByText(s, { exact: true })).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/briefing-4-${info.project.name}.png` });
  await page.getByRole("button", { name: /show me hq/i }).click();
  await expect(briefing(page)).toBeHidden();

  // Right after the lore: an invitation to sign in, with a clear way to carry on as a guest.
  await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
  await expect(startPrompt(page).getByRole("button", { name: /continue as a guest/i })).toBeVisible();
  await expect(tour(page)).toBeHidden(); // the tour waits its turn
  await page.screenshot({ path: `e2e/__shots__/start-prompt-${info.project.name}.png` });
  await startPrompt(page).getByRole("button", { name: /continue as a guest/i }).click();

  // Then the one-time tour of the main controls.
  await expect(tour(page)).toBeVisible({ timeout: 10_000 });
  await expect(tour(page).getByText(/1 of 5/)).toBeVisible();
  await page.screenshot({ path: `e2e/__shots__/tour-step-1-${info.project.name}.png` });
  await page.keyboard.press("ArrowRight");
  await expect(tour(page).getByText(/2 of 5/)).toBeVisible();
  await expect(tour(page).getByRole("heading", { name: /your next step/i })).toBeVisible();
  await tour(page).getByRole("button", { name: /skip tour/i }).click();
  await expect(tour(page)).toBeHidden();

  // Neither comes back on reload.
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(briefing(page)).toBeHidden();
  await expect(tour(page)).toBeHidden();
});

test("the briefing can be skipped at any point, and replayed from the Briefing button on every screen", async ({ page }) => {
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(briefing(page)).toBeHidden();
  // Skipping is remembered.
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(briefing(page)).toBeHidden();

  for (const route of ["/", "/campaign/a1", "/foundry", "/shift", "/codex", "/incident", "/settings", "/learn", "/mission/latency-numbers"]) {
    await page.goto(route);
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape"); // a section intro, if one is up
    const btn = page.getByRole("button", { name: /^briefing$/i }).first();
    await expect(btn, `${route} has a Briefing button`).toBeVisible();
    await btn.click();
    await expect(briefing(page), route).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /growing fast/i }), route).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(briefing(page)).toBeHidden();
  }
});

test("the HQ names the next step, labels sections plainly, and explains what is locked", async ({ page }) => {
  await page.goto("/");
  await clearOverlays(page);

  // A brand-new player is told exactly where to start.
  const next = page.getByRole("region", { name: /your next step/i });
  await expect(next).toContainText(/start here/i);
  await expect(next).toContainText(/latency numbers/i);
  await expect(next.getByRole("link", { name: /start level 1/i })).toHaveAttribute("href", "/mission/latency-numbers");

  // The dock uses the plain-language labels; hovering shows what is inside.
  const dock = page.getByRole("navigation", { name: /sections/i });
  const core = dock.getByRole("link", { name: /core grid/i });
  await expect(core).toHaveAttribute("title", /^Core Grid \(System Design: Latency Numbers, Little's Law, Utilization & the Hockey Stick, and \d+ more\)$/);
  await expect(dock.getByRole("link", { name: /agent foundry/i })).toHaveAttribute("title", /^Agent Foundry \(AI Engineering: .+\)$/);
  await expect(dock.getByRole("link", { name: /incident room/i })).toHaveAttribute("title", /^Incident Room \(On-call practice: /);

  // A chapter page: label with a short bracket line, fuller detail on expand, a story line, and reasons for locks.
  await page.goto("/campaign/a1");
  await skipIntro(page);
  await expect(page.getByText(/^\(System Design: Latency Numbers/)).toBeVisible();
  await expect(page.getByText(/Platform Engineering/).first()).toBeVisible();
  await page.getByRole("button", { name: /^details$/i }).click();
  await expect(page.getByText(/A1 · Launch Day/).first()).toBeVisible();
  await expect(page.getByText(/Unlocks after you finish Latency Numbers/).first()).toBeVisible();
});

test("keyboard only: the briefing and tour are operable without a mouse", async ({ page }) => {
  await page.goto("/");
  await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
  // Focus lands on the primary button; arrows move between screens; Enter on the last one finishes.
  await expect(page.getByRole("button", { name: /^next$/i })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /show me hq/i })).toBeFocused();
  await page.keyboard.press("Enter");
  // The sign-in prompt takes focus (the email field); Escape carries on as a guest.
  await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("textbox", { name: /email address/i })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(startPrompt(page)).toBeHidden();
  await expect(tour(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^next$/i })).toBeFocused();
  for (let i = 0; i < 5; i++) await page.keyboard.press("Enter");
  await expect(tour(page)).toBeHidden();
});

for (const [name, w, h] of [["375", 375, 812], ["768", 768, 1024], ["desktop", 1440, 900]] as const) {
  test(`onboarding fits at ${name}px: no sideways scroll, controls reachable`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(briefing(page)).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 3; i++) {
      await noSideScroll(page);
      const next = page.getByRole("button", { name: /^next$/i });
      await expect(next).toBeInViewport();
      await next.click();
    }
    await noSideScroll(page);
    await expect(page.getByRole("button", { name: /show me hq/i })).toBeInViewport();
    await page.getByRole("button", { name: /show me hq/i }).click();
    await expect(startPrompt(page)).toBeVisible({ timeout: 10_000 });
    await noSideScroll(page);
    const guest = startPrompt(page).getByRole("button", { name: /continue as a guest/i });
    await expect(guest).toBeInViewport();
    await expect(startPrompt(page).getByRole("textbox", { name: /email address/i })).toBeInViewport();
    await guest.click();
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 5; i++) {
      await noSideScroll(page);
      const card = tour(page).getByRole("button", { name: /^next$|^done$/i });
      await expect(card).toBeInViewport();
      await card.click();
    }
    await expect(tour(page)).toBeHidden();
    await noSideScroll(page);
    // The header still fits: Briefing, Save progress and Settings are all there.
    for (const label of [/^briefing$/i, /save progress/i, /^settings$/i]) await expect(page.getByRole(label.source.includes("settings") ? "link" : "button", { name: label })).toBeVisible();
  });
}
