const { test, expect } = require('@playwright/test');

test('buildings are top-down and no building footprint may occupy a road', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=v071', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.NRTS?.subsystems.has('building-placement') &&
    window.NRTS?.subsystems.has('building-renderer') &&
    window.RTS_SIM?.version === '0.7.1'
  ));

  const result = await page.evaluate(() => {
    const placement = window.NRTS.subsystems.get('building-placement');
    const diagnostics = window.NRTS.diagnostics.snapshot();
    const renderer = diagnostics.subsystems.find(s => s.name === 'building-renderer');
    const placementMeta = diagnostics.subsystems.find(s => s.name === 'building-placement');

    const mainRoadPoint = { x:700, y:900 };
    const blocked = placement.validSpot('house', mainRoadPoint.x, mainRoadPoint.y);
    const roadClearance = placement.roadClearance('house', mainRoadPoint.x, mainRoadPoint.y);

    const initial = buildings.filter(b => !b.dead).map(b => ({
      id:b.id,
      type:b.type,
      x:b.x,
      y:b.y,
      clearance:placement.roadClearance(b.type, b.x, b.y)
    }));

    const direct = createBuilding('france', 'house', mainRoadPoint.x, mainRoadPoint.y, true);
    const directClearance = direct ? placement.roadClearance(direct.type, direct.x, direct.y) : -Infinity;

    return {
      blocked,
      roadClearance,
      initial,
      direct:direct && { x:direct.x, y:direct.y, clearance:directClearance },
      rendererPhase:renderer?.meta?.phase,
      rendererLegacy:renderer?.meta?.legacyBridge,
      placementPhase:placementMeta?.meta?.phase,
      placementLegacy:placementMeta?.meta?.legacyBridge
    };
  });

  expect(result.blocked).toBe(false);
  expect(result.roadClearance).toBeLessThan(0);
  expect(result.initial.length).toBeGreaterThanOrEqual(2);
  expect(result.initial.every(b => b.clearance >= 9.9)).toBe(true);
  expect(result.direct).toBeTruthy();
  expect(result.direct.clearance).toBeGreaterThanOrEqual(9.9);
  expect(Math.hypot(result.direct.x - 700, result.direct.y - 900)).toBeGreaterThan(1);
  expect(result.rendererPhase).toBe('architecture-v2');
  expect(result.rendererLegacy).toBe(false);
  expect(result.placementPhase).toBe('architecture-v2');
  expect(result.placementLegacy).toBe(false);
  expect(errors).toEqual([]);
});
