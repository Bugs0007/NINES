import { expect, test } from "@playwright/test";

// The quality bar: 60fps with ~2,000 particles on screen. Needs a hardware GPU: headless Chromium's
// software compositor caps every page (even an empty one) near 30fps, which says nothing about the renderer.
test.use({ launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] } });

test("renderer holds 60fps with ~2,000 particles", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(120_000);
  await page.goto("/dev/perf?n=2000");
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
  });
  test.skip(/swiftshader|none|llvmpipe/i.test(renderer), `no hardware GPU (${renderer})`);
  await expect(page.getByTestId("perf")).toContainText("particles", { timeout: 30_000 });
  await page.waitForTimeout(12_000); // let the fleet fill up
  const s = await page.evaluate(() => window.__perf!);
  console.log(`perf on ${renderer}: ${JSON.stringify(s)}`);
  await page.screenshot({ path: `e2e/__shots__/perf-${info.project.name}.png` });
  expect(s.particles).toBeGreaterThan(1500);
  expect(s.fps).toBeGreaterThan(57);
  expect(s.p95FrameMs).toBeLessThan(18);
});
