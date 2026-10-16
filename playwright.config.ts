import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end acceptance tests. They need the app running against a database
 * that can be freely modified — normally the local stack:
 *   npm run stack:reset   (terminal 1)
 *   npm run build && npm start   (terminal 2)
 *   npm run test:e2e
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Most tests run as returning visitors: the welcome intro and the skin-analysis launch pop-up have already been seen. */
export const RETURNING_VISITOR = {
  cookies: [],
  origins: [
    {
      origin: baseURL,
      localStorage: [
        { name: "mivora.welcome.v1", value: "1" },
        { name: "mivora.skinPopup.v1", value: JSON.stringify({ dismissedAt: Date.now() }) },
      ],
    },
  ],
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    storageState: RETURNING_VISITOR,
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
