const { test, expect } = require('@playwright/test');

test('2D regiment visual hierarchy exposes stable zoom LOD without runtime errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/?test=regiment-visual-hierarchy-v1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__REGIMENT_VISUAL_HIERARCHY_V1__));

  const result = await page.evaluate(() => {
    const api = window.__REGIMENT_VISUAL_HIERARCHY_V1__;
    return {
      version: api.version,
      presentationOnly: api.presentationOnly,
      viewportCulled: api.viewportCulled,
      thresholds: api.thresholds,
      lods: [0.35, 0.54, 0.55, 0.72, 0.89, 0.90, 1.2].map(api.lodForZoom),
      registered: window.NRTS.subsystems.has('regiment-visual-hierarchy')
    };
  });

  expect(result.version).toBe('regiment-visual-hierarchy-v1');
  expect(result.presentationOnly).toBe(true);
  expect(result.viewportCulled).toBe(true);
  expect(result.thresholds.massBelow).toBe(0.55);
  expect(result.thresholds.silhouetteBelow).toBe(0.90);
  expect(result.lods).toEqual(['mass','mass','silhouette','silhouette','silhouette','detail','detail']);
  expect(result.registered).toBe(true);
  expect(pageErrors).toEqual([]);
});
