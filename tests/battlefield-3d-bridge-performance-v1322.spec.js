const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const bridgePath = path.join(__dirname, '..', 'src', 'systems', 'rendering', 'battlefield-3d-bridge-v1.js');

test('3D bridge keeps hot snapshots single-pass without unsafe reusable arrays', async ({ page }) => {
  const source = fs.readFileSync(bridgePath, 'utf8');
  expect(source).toContain("snapshotAllocationMode: 'single-pass-live-collections'");
  expect(source).toContain('for (const unit of units)');
  expect(source).toContain('for (const building of buildings)');
  expect(source).toContain('for (const unit of selectedUnits)');
  expect(source).not.toContain('units.filter(unit => !unit.dead)');
  expect(source).not.toContain('[...selectedUnits].filter');
  expect(source).not.toContain('resources.filter(resource => !resource.dead).map');

  await page.goto('/?test=3d', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.NRTS_3D_SOURCE);

  const result = await page.evaluate(() => {
    const a = window.NRTS_3D_SOURCE.snapshot();
    const b = window.NRTS_3D_SOURCE.snapshot();
    return {
      allocationMode: window.NRTS_3D_SOURCE.snapshotAllocationMode,
      separateSnapshot: a !== b,
      separateUnits: a.units !== b.units,
      separateBuildings: a.buildings !== b.buildings,
      separateSelectionIds: a.selection.unitIds !== b.selection.unitIds,
      deadUnits: a.units.filter(unit => unit.dead).length,
      deadBuildings: a.buildings.filter(building => building.dead).length
    };
  });

  expect(result.allocationMode).toBe('single-pass-live-collections');
  expect(result.separateSnapshot).toBe(true);
  expect(result.separateUnits).toBe(true);
  expect(result.separateBuildings).toBe(true);
  expect(result.separateSelectionIds).toBe(true);
  expect(result.deadUnits).toBe(0);
  expect(result.deadBuildings).toBe(0);
});
