import { defineConfig, devices } from "@playwright/test";

const localChrome = process.platform === "win32" && !process.env.CI
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: localChrome ? { executablePath: localChrome } : undefined,
  },
  webServer: {
    command: "pnpm run preview --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
