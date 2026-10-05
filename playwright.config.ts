import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4310);
const media = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // A stuck click should fail with Playwright's reason (not stable, covered, …), not eat the test timeout.
    actionTimeout: 20_000,
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: { args: media }
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 }, permissions: ['camera', 'microphone'], launchOptions: { args: media } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, permissions: ['camera', 'microphone'], launchOptions: { args: media } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], permissions: ['camera', 'microphone'], launchOptions: { args: media } } }
  ],
  webServer: {
    command: 'node server/src/server.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT), NODE_ENV: 'development', RATE_LIMIT_DISABLED: 'true', MONGODB_URI: '', GEMINI_API_KEY: '', ML_SERVICE_URL: process.env.ML_SERVICE_URL || '' }
  }
});
