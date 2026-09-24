import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4177",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 812 },
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 4177 --strictPort",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
  },
});
