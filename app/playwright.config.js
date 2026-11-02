import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:3101/api/me",
    env: { PORT: "3101", DB_PATH: "data/e2e.db" },
    reuseExistingServer: false,
  },
});
