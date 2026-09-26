import { test } from "@playwright/test";

const cfg = (o: object) => encodeURIComponent(JSON.stringify(o));

test("queue-lab little renders", async ({ page }, info) => {
  await page.goto(`/dev/widget/queue-lab?config=${cfg({ variant: "little", io: { kind: "lognormal", median: 0.19, p99: 0.3 }, workers: 4, cores: 2, rps: 24 })}`);
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `e2e/__shots__/dev-queue-little-${info.project.name}.png`, fullPage: true });
});
