import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
process.env.TEST_RUNTIME = "worker";
export default defineConfig({
  ...base,
  timeout: 90000,
  outputDir: "test-results-worker",
  use: { ...base.use, baseURL: "http://127.0.0.1:3103" },
  webServer: {
    command: "node scripts/test-worker-server.mjs",
    url: "http://127.0.0.1:3103/api/me",
    timeout: 90000,
    reuseExistingServer: false,
  },
});
