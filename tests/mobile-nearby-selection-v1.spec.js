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

test('phone nearby selection never pulls distant loose infantry across the battlefield', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTS_SIM && window.__MOBILE_NEARBY_SELECTION_V1__);

  const setup = await page.evaluate(() => {
    const anchor = units.find(unit =>
      unit.side === 'france' && unit.type === 'infantry' && !unit.regimentId && !unit.dead
    );
    if (!anchor) return null;
    let offset = 0;
    for (const unit of units) {
      if (
        unit !== anchor && unit.side === 'france' && unit.type === 'infantry' &&
        !unit.regimentId && !unit.dead
      ) {
        unit.x = Math.min(WORLD.width - 80, anchor.x + 700 + offset);
        unit.y = Math.min(WORLD.height - 80, anchor.y + (offset % 120));
        unit.targetX = unit.x;
        unit.targetY = unit.y;
        offset += 12;
      }
    }
    window.RTS_SIM.dispatch({ type: 'select-point', x: anchor.x, y: anchor.y });
    return {
      anchorId: anchor.id,
      radius: window.__MOBILE_NEARBY_SELECTION_V1__.nearbyRadius,
      available: window.__MOBILE_NEARBY_SELECTION_V1__.availableCount()
    };
  });
  expect(setup).not.toBeNull();
  expect(setup.radius).toBe(320);
  expect(setup.available).toBe(0);

  const nearby = page.locator('#actions [data-action="select-nearby-infantry"]');
  await expect(nearby).toBeVisible();
  await expect(nearby).toBeDisabled();
  await expect(nearby).toHaveAttribute('title', 'Er zijn geen extra vrije musketiers binnen 320 meter beschikbaar.');

  const result = await page.evaluate(() => ({
    selected: window.RTS_SIM.snapshot().selection.unitIds,
    changed: window.__MOBILE_NEARBY_SELECTION_V1__.selectNearby()
  }));
  expect(result.selected).toEqual([setup.anchorId]);
  expect(result.changed).toBe(false);
});
