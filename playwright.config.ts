import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests: build the site, serve it, and click through the Atlas.
 * Run with `npm run test:e2e` (after `npm run build`).
 * PW_CHROMIUM may point at a preinstalled Chromium instead of Playwright's own.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4174/orbital-ocean/',
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: 'atlas.e2e.ts' },
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' }, testMatch: 'phone.e2e.ts' },
  ],
  webServer: {
    command: 'npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174/orbital-ocean/',
    reuseExistingServer: !process.env.CI,
  },
});
