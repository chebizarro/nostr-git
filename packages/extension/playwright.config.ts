import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, 'dist');
const baseUrl = 'http://127.0.0.1:4179/popup.html';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx http-server dist -p 4179 -s',
    cwd: distDir,
    port: 4179,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: baseUrl },
    },
  ],
});
