import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  timeout: 20000,
  use: { browserName: "chromium", headless: true },
  webServer: [
    {
      command: "node --import tsx tests/e2e/server.ts",
      env: { PORT: "3191", BASE_PATH: "/" },
      url: "http://127.0.0.1:3191/api/ready",
      reuseExistingServer: false,
    },
    {
      command: "node --import tsx tests/e2e/server.ts",
      env: { PORT: "3192", BASE_PATH: "/camera/" },
      url: "http://127.0.0.1:3192/camera/api/ready",
      reuseExistingServer: false,
    },
  ],
});
