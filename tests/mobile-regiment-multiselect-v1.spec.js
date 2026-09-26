const { test, expect } = require('@playwright/test');

test('phone adds the nearest regiment to the current selection with one action', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__MOBILE_REGIMENT_MULTISELECT_V1__);

  const regiments = await page.evaluate(() => {
    const first = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 950, 980);
    const second = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1350, 980);
    if (!first || !second) return null;
    window.__RTS_DEBUG__.selectRegiment(first);
    return [first, second];
  });
  expect(regiments).not.toBeNull();

  const addButton = page.locator('#actions [data-action="add-nearest-regiment"]');
  await expect(addButton).toBeVisible();
  await expect(addButton).toBeEnabled();
  await expect(addButton).toContainText('Voeg regiment toe');
  await addButton.scrollIntoViewIfNeeded();
  await addButton.click();

  const result = await page.evaluate(() => {
    const snapshot = window.RTS_SIM.snapshot();
    const selectedIds = new Set(snapshot.selection.unitIds);
    const selectedRegimentIds = snapshot.units
      .filter(unit => selectedIds.has(unit.id) && unit.regimentId)
      .map(unit => unit.regimentId);
    return {
      selectedRegimentIds: [...new Set(selectedRegimentIds)].sort(),
      helperCount: window.__MOBILE_REGIMENT_MULTISELECT_V1__.selectedCount(),
      status: document.getElementById('status').textContent
    };
  });

  expect(result.selectedRegimentIds).toEqual([...regiments].sort());
  expect(result.helperCount).toBe(2);
  expect(result.status).toContain('2 regimenten geselecteerd');
});
