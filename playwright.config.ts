import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const externalBaseUrl = process.env.E2E_BASE_URL
const baseURL = externalBaseUrl ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The dev server does not survive many concurrent fresh signup + Supabase
  // client boots; serialize test runs to keep results deterministic.
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      // These drive PostgREST/Nitro directly, so a second viewport only
      // doubles their runtime.
      testIgnore: /rls-negative|invitation-mail|api-negative/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
