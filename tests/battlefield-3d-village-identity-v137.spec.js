const { test, expect } = require('@playwright/test');

test('3D village identity HUD summarizes archetypes and follows render mode', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__BATTLEFIELD_3D_VILLAGE_IDENTITY_V1__ && window.__BATTLEFIELD_3D_EXPERIENCE_V1__);

  const state = await page.evaluate(() => {
    const api = window.__BATTLEFIELD_3D_VILLAGE_IDENTITY_V1__;
    const panel = document.getElementById('villageIdentity3d');
    return {
      version: api.version,
      villages: api.villages,
      archetypes: api.archetypes,
      counts: api.counts,
      dominant: api.dominant,
      landmarks: api.landmarks,
      panelVersion: panel?.dataset.version,
      hidden: panel?.dataset.hidden,
      text: panel?.textContent || ''
    };
  });

  expect(state.version).toBe('battlefield-3d-village-identity-v1');
  expect(state.villages).toBeGreaterThan(0);
  expect(state.archetypes.length).toBeGreaterThanOrEqual(4);
  expect(Object.values(state.counts).reduce((a, b) => a + b, 0)).toBe(state.villages);
  expect(typeof state.dominant).toBe('string');
  expect(state.landmarks.chapels + state.landmarks.inns + state.landmarks.barns).toBeGreaterThan(0);
  expect(state.panelVersion).toBe('v1');
  expect(state.text).toContain('3D dorpskarakter');

  const before = await page.evaluate(() => window.__BATTLEFIELD_3D_VILLAGE_IDENTITY_V1__.collapsed());
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => ({
    collapsed: window.__BATTLEFIELD_3D_VILLAGE_IDENTITY_V1__.collapsed(),
    stored: localStorage.getItem('nrts-3d-village-identity-collapsed')
  }));
  expect(after.collapsed).toBe(!before);
  expect(after.stored).toBe(after.collapsed ? '1' : '0');

  const initialMode = await page.evaluate(() => window.__BATTLEFIELD_3D_EXPERIENCE_V1__.mode());
  await page.keyboard.down('Alt');
  await page.keyboard.press('Digit3');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(50);
  const visibility = await page.evaluate(() => ({
    mode: window.__BATTLEFIELD_3D_EXPERIENCE_V1__.mode(),
    hidden: document.getElementById('villageIdentity3d')?.dataset.hidden
  }));
  expect(visibility.mode).not.toBe(initialMode);
  expect(visibility.hidden).toBe(visibility.mode === '3d' ? 'false' : 'true');
});
