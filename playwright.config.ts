import { defineConfig } from "@playwright/test";
const previewUrl = process.env.FRANKENSHELL_PREVIEW_URL;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: previewUrl ?? "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1100 },
    launchOptions:
      process.platform === "win32"
        ? {
            executablePath:
              "C:/Program Files/Google/Chrome/Application/chrome.exe",
          }
        : {},
    trace: "off",
  },
  webServer: previewUrl
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
      },
});
