import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests. By default they build and start the app on :3200
 * with a throwaway database; set E2E_BASE_URL to run against a server you
 * already have running.
 */
const external = process.env.E2E_BASE_URL;
const port = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: external
    ? undefined
    : {
        command: `rm -rf .e2e && npm run build && npx next start -p ${port}`,
        url: `http://localhost:${port}/login`,
        timeout: 240_000,
        reuseExistingServer: false,
        env: { DATABASE_PATH: ".e2e/waypoint.db", UPLOADS_DIR: ".e2e/uploads" },
      },
});
