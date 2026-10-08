import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in suite against a REAL Supabase project (the one in .env), with the real Next server. It creates a few
 * throwaway users with the admin API and deletes them afterwards. Run:   npm run test:e2e:real
 * The main suite (playwright.config.ts) never touches Supabase.
 */
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: the spec skips itself */
}

const PORT = Number(process.env.E2E_REAL_PORT ?? 3102);

export default defineConfig({
  testDir: "./e2e-real",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: "nines:ai", value: "off" }] }] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone-375", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ADMIN_EMAILS: "nines-real-admin@example.com", NEXT_PUBLIC_POSTHOG_KEY: "" },
  },
});
