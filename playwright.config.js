const { defineConfig, devices } = require('@playwright/test');

const releaseRun = process.env.CI_RELEASE === '1';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Keep tests within one file sequential, but let independent spec files share
  // two Chromium workers in CI. This gives most of the speed-up without making
  // timing-sensitive simulation tests compete across too many browser processes.
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  // Fast PR feedback should fail immediately. Only the definitive release run on
  // main gets one retry to protect deployment from an incidental runner hiccup.
  retries: process.env.CI ? (releaseRun ? 1 : 0) : 0,
  // v0.6.7 has direct replacements for the two old tests whose only obsolete part is the v0.6.6 release label.
  grepInvert: /v0\.6\.6 loads with simulation facade|F3 test lab exposes diagnostics and v0\.6\.6 bug reports/,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
