import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. Boots the real stack via webServer (backend dev server — which
 * loads .env itself and needs the dev Postgres running — plus the Vite dev
 * server) and drives Chromium against http://localhost:5173.
 *
 * Run with: npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  // Journey tests span several real navigations + dev-server cold paths.
  timeout: 60_000,
  // One worker: the suite shares a single Vite dev server, whose one-time
  // dependency-optimization full-reloads broadcast to EVERY connected page —
  // parallel tests can wipe each other's unsaved in-memory canvas state.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:frontend',
      port: 5173,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
