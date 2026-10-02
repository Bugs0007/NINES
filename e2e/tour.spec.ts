import { expect, test } from "@playwright/test";
import { noSideScroll } from "./helpers";

// Every screen, both widths: no sideways scroll, and a screenshot for visual review.
const ROUTES = [
  "/",
  "/campaign",
  "/campaign/a1",
  "/foundry",
  "/shift",
  "/codex",
  "/codex/littles-law",
  "/codex/context-windows",
  "/incident",
  "/incident/inc-fourth-box",
  "/settings",
  "/mission/latency-numbers",
  "/mission/littles-law",
  "/mission/queueing-utilization",
  "/mission/scale-up-vs-out",
  "/mission/load-balancing",
  "/mission/stateless-services",
  "/mission/tokens",
  "/mission/context-windows",
  "/boss/boss-launch-day",
  "/boss/boss-the-bill",
];

test("tour: every screen fits", async ({ page }, info) => {
  test.setTimeout(600_000);
  await page.goto("/dev/seed");
  await page.getByRole("button", { name: /mixed decay/i }).click();
  await expect(page.getByText(/seeded/)).toBeVisible();
  const problems: string[] = [];
  for (const r of ROUTES) {
    await page.goto(r);
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape"); // chapter intros
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) problems.push(`${r}: ${over}px sideways`);
    const name = r === "/" ? "hq" : r.slice(1).replace(/\//g, "_");
    await page.screenshot({ path: `e2e/__shots__/tour-${name}-${info.project.name}.png` });
  }
  expect(problems, problems.join("\n")).toEqual([]);
  await noSideScroll(page);
});
