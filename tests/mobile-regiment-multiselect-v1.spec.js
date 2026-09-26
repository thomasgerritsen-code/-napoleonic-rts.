const { test, expect } = require('@playwright/test');

async function touchTap(page, x, y, pointerId = 1) {
  for (const type of ['pointerdown', 'pointerup']) {
    await page.locator('#game').evaluate((canvas, data) => {
      canvas.dispatchEvent(new PointerEvent(data.type, {
        bubbles: true,
        cancelable: true,
        pointerId: data.pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: data.type === 'pointerup' ? 0 : 1,
        clientX: data.x,
        clientY: data.y
      }));
    }, { type, pointerId, x, y });
  }
}

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

test('phone tap mode adds and removes whole regiments without clearing the last selection', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__MOBILE_REGIMENT_MULTISELECT_V1__);

  const setup = await page.evaluate(() => {
    const first = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 950, 980);
    const second = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1350, 980);
    window.__RTS_DEBUG__.selectRegiment(first);
    const snapshot = window.RTS_SIM.snapshot();
    const point = id => {
      const unit = snapshot.units.find(candidate => candidate.regimentId === id);
      return window.__RTS_DEBUG__.worldToScreen(unit.x, unit.y);
    };
    return { first, second, firstPoint: point(first), secondPoint: point(second) };
  });

  const toggle = page.locator('#actions [data-action="toggle-regiment-tap-selection"]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await touchTap(page, setup.secondPoint.x, setup.secondPoint.y);
  expect(await page.evaluate(() => window.__MOBILE_REGIMENT_MULTISELECT_V1__.selectedCount())).toBe(2);

  await touchTap(page, setup.firstPoint.x, setup.firstPoint.y);
  const selected = await page.evaluate(() => {
    const snapshot = window.RTS_SIM.snapshot();
    const selectedIds = new Set(snapshot.selection.unitIds);
    return [...new Set(snapshot.units
      .filter(unit => selectedIds.has(unit.id) && unit.regimentId)
      .map(unit => unit.regimentId))];
  });
  expect(selected).toEqual([setup.second]);

  await touchTap(page, setup.secondPoint.x, setup.secondPoint.y);
  expect(await page.evaluate(() => window.__MOBILE_REGIMENT_MULTISELECT_V1__.selectedCount())).toBe(1);
});
