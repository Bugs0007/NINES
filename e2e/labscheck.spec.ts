import { test } from "@playwright/test";

const cfg = (o: object) => encodeURIComponent(JSON.stringify(o));
const LABS: [string, object, string][] = [
  ["fanout-lab", { median: 0.02, p99: 0.12, calls: 40, minCalls: 10, maxCalls: 200 }, "play"],
  ["pool-lab", { appWorkers: 16, poolPerWorker: 10, start: { workers: 16, perWorker: 10 } }, "challenge"],
  ["autoscale-lab", {}, "play"],
  ["viral-lab", {}, "challenge"],
  ["estimate-lab", { title: "Pigeon · peak messages", answerLabel: "Peak messages per second", answerMin: 1, answerMax: 1e6, mode: "faded", given: ["secondsPerDay"], steps: [{ id: "dau", label: "Daily active users", min: 1e4, max: 1e9, truth: 2e6 }, { id: "perUser", label: "Messages per user", min: 1, max: 1000, truth: 40 }, { id: "secondsPerDay", label: "Seconds in a day", min: 1e4, max: 2e5, truth: 86400, inverse: true }, { id: "peak", label: "Peak ratio", min: 1, max: 20, truth: 3, fmt: "x" }] }, "play"],
];
for (const [id, config, mode] of LABS) {
  test(`lab ${id}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`/dev/widget/${id}?mode=${mode}&config=${cfg(config)}`);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `e2e/__shots__/lab-${id}-${info.project.name}.png`, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(id, info.project.name, "overflow", over, "errors", errors.slice(0, 3));
  });
}
