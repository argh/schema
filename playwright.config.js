import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-browser',
  testMatch: '*.spec.js',
  timeout: 60000,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx serve . -l 8274 --no-clipboard',
    port: 8274,
    reuseExistingServer: !process.env.CI,
  },
});
