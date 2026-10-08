import { expect, test } from "@playwright/test";
import { noSideScroll } from "./helpers";

// Most visitors arrive from a phone. Every main screen at 375px, 768px and desktop: no sideways scroll,
// nothing important cut off, and the primary controls reachable. (tour.spec.ts covers the project widths too.)
const WIDTHS = [
  { name: "375", w: 375, h: 812 },
  { name: "768", w: 768, h: 1024 },
  { name: "desktop", w: 1440, h: 900 },
];
const ROUTES = ["/", "/campaign/a1", "/foundry", "/shift", "/codex", "/incident", "/settings", "/learn", "/privacy", "/mission/latency-numbers", "/mission/tokens"];

test("main screens fit at 375, 768 and desktop widths", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sets its own viewports");
  test.setTimeout(300_000);
  await page.goto("/dev/seed");
  await page.getByRole("button", { name: /chapter 1 done/i }).click();
  await expect(page.getByText(/seeded/)).toBeVisible();
  const problems: string[] = [];
  for (const { name, w, h } of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForTimeout(1200);
      await page.keyboard.press("Escape"); // section intros
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) problems.push(`${r} @${name}: ${over}px sideways`);
      // Text under 11px is a design-system violation. (The zoomable map's SVG labels scale with zoom and are excluded.)
      const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => !(e instanceof SVGElement) && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5 && e.offsetParent !== null).length);
      if (tiny > 0) problems.push(`${r} @${name}: ${tiny} elements with text under 11px`);
    }
    await page.goto("/");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `e2e/__shots__/responsive-hq-${name}.png` });
  }
  expect(problems, problems.join("\n")).toEqual([]);
  await noSideScroll(page);
});

test("the HQ header and dock stay usable on a 375px phone", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sets its own viewports");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForTimeout(1500);
  // Every header control is visible and at least 36px tall (touch targets).
  for (const [role, name] of [["button", /^briefing$/i], ["button", /save progress/i], ["link", /^settings$/i]] as const) {
    const el = page.getByRole(role, { name });
    await expect(el).toBeVisible();
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  }
  const dock = page.getByRole("navigation", { name: /sections/i });
  for (const n of ["Core Grid", "Agent Foundry", "Incident Room", "Codex"]) {
    const l = dock.getByRole("link", { name: new RegExp(n, "i") });
    await expect(l).toBeVisible();
    expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
