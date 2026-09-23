const { test, expect } = require('@playwright/test');

test('phone can expand one loose musketeer to a nearby 12-man selection', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__MOBILE_NEARBY_SELECTION_V1__);

  const anchorId = await page.evaluate(() => {
    const unit = window.RTS_SIM.snapshot().units.find(candidate =>
      candidate.side === 'france' && candidate.type === 'infantry' && !candidate.regimentId && !candidate.dead
    );
    if (!unit) return null;
    window.RTS_SIM.dispatch({ type: 'select-point', x: unit.x, y: unit.y });
    return unit.id;
  });
  expect(anchorId).not.toBeNull();

  const before = await page.evaluate(() => window.RTS_SIM.snapshot().selection.unitIds);
  expect(before).toEqual([anchorId]);

  const nearby = page.locator('#actions [data-action="select-nearby-infantry"]');
  await expect(nearby).toBeVisible();
  await expect(nearby).toBeEnabled();
  await expect(nearby).toContainText('Selecteer nabij');
  await nearby.scrollIntoViewIfNeeded();
  await nearby.click();

  const after = await page.evaluate(() => {
    const snapshot = window.RTS_SIM.snapshot();
    const ids = snapshot.selection.unitIds;
    const selected = snapshot.units.filter(unit => ids.includes(unit.id));
    return {
      ids,
      types: selected.map(unit => unit.type),
      sides: selected.map(unit => unit.side),
      regimentIds: selected.map(unit => unit.regimentId || null),
      helperCount: window.__MOBILE_NEARBY_SELECTION_V1__.selectedCount()
    };
  });

  expect(after.ids).toHaveLength(12);
  expect(after.ids).toContain(anchorId);
  expect(new Set(after.types)).toEqual(new Set(['infantry']));
  expect(new Set(after.sides)).toEqual(new Set(['france']));
  expect(after.regimentIds.every(id => id === null)).toBe(true);
  expect(after.helperCount).toBe(12);
  await expect(nearby).toHaveCount(0);
});