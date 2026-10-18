import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility tests in a real browser (npm run test:a11y): axe-core on every
 * main screen in both themes, plus keyboard-only and screen-reader checks.
 * The app's backend calls are blocked in the tests (e2e/fixtures.ts), so test
 * runs never create guest accounts.
 */
const PORT = 5179;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    viewport: { width: 375, height: 812 },
    hasTouch: false,
    isMobile: false,
  },
  projects: [
    { name: 'dark', use: { colorScheme: 'dark' } },
    { name: 'light', use: { colorScheme: 'light' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
