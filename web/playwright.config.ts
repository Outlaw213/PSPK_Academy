import { defineConfig } from "@playwright/test";

// End-to-end tests of the panel on the real API. `npm run e2e` starts a throwaway stack (e2e/run.sh).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8090",
    locale: "pl-PL",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "telefon", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "komputer", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
