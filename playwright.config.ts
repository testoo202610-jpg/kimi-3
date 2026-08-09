import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1, // one shared dev server, one world per page — keep runs serial
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
