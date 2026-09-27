import { expect, test } from "@playwright/test";

for (const kind of ["fresh", "decay"] as const) {
  test(`hq · ${kind}`, async ({ page }, info) => {
    await page.goto("/dev/seed");
    await page.getByRole("button", { name: kind === "fresh" ? /fresh player/i : /mixed decay/i }).click();
    await expect(page.getByText(/seeded/)).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/uptime/i).first()).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `e2e/__shots__/hq-${kind}-${info.project.name}.png` });
  });
}
