const { test, expect } = require('@playwright/test');

test('villages use dense roof-only multi-building settlement layout', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v2',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_SCENERY_V2__ &&
    window.__VILLAGE_RENDERER_V2__ &&
    window.NRTS?.subsystems.has('village-renderer-v2')
  ));

  const result=await page.evaluate(()=>({
    layout:window.__VILLAGE_SCENERY_V2__,
    renderer:window.__VILLAGE_RENDERER_V2__,
    subsystem:window.NRTS.subsystems.get('village-renderer-v2')
  }));

  expect(result.layout.version).toBe('village-layout-v2');
  expect(result.layout.villageCount).toBeGreaterThanOrEqual(4);
  expect(result.layout.structureCount).toBeGreaterThanOrEqual(result.layout.villageCount*8);
  expect(result.layout.minStructures).toBeGreaterThanOrEqual(7);
  expect(result.layout.kinds.cottage).toBeGreaterThan(0);
  expect(result.layout.kinds.farmhouse).toBeGreaterThan(0);
  expect(result.layout.kinds.barn).toBeGreaterThan(0);
  expect((result.layout.kinds.inn||0)+(result.layout.kinds.chapel||0)).toBeGreaterThanOrEqual(result.layout.villageCount);
  expect(result.layout.navigationUnchanged).toBe(true);

  expect(result.renderer.version).toBe('village-renderer-v2');
  expect(result.renderer.projection).toBe('orthographic-top-down');
  expect(result.renderer.visibleFacades).toBe(false);
  expect(result.renderer.yardDetails).toBe(true);
  expect(result.subsystem.visibleFacades).toBe(false);
  expect(errors).toEqual([]);
});
