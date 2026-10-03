/**
 * Render the app icon SVG to the PNG sizes a PWA install needs: `npx tsx scripts/gen-icons.mts`.
 * Maskable variants keep the mark inside the 80% safe zone.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("src/app/icon.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 0.12],
  ["../../src/app/apple-icon.png", 180, 0],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(
    `<html><body style="margin:0;background:#0f1519;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `) +
      `</body></html>`,
  );
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log("icons written");
