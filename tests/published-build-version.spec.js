const { test, expect } = require('@playwright/test');

test('published build identifier is visible in the HUD and browser title', async ({ page }) => {
  await page.route('**/src/foundation/deployment-info.js?build=local', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "'use strict'; window.RTS_DEPLOYMENT_INFO = { commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', runNumber: 209, deployedAt: '2026-10-09T12:00:00Z' };"
    })
  );
  await page.goto('/?test=1');
  await expect(page.locator('.version')).toHaveText('v1.3.22-b209');
  await expect(page).toHaveTitle('Napoleonic RTS v1.3.22-b209');
  await expect(page.locator('.version')).toHaveAttribute('title', /build #209.*commit aaaaaaa/);
  await expect(page.locator('#app')).toHaveCSS('visibility', 'visible');
  expect(await page.evaluate(() => window.RTS_VERSION_INFO.buildNumber)).toBe(209);
});
