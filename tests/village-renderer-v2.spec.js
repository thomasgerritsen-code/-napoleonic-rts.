const { test, expect } = require('@playwright/test');

test('villages use the authoritative dense roof-only settlement renderer', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v3',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_SCENERY_V2__ &&
    window.__VILLAGE_RENDERER_V2__ &&
    window.__VILLAGE_AUTHORITY_V3__ &&
    window.NRTS?.subsystems.has('village-authority-v3')
  ));

  const result=await page.evaluate(()=>{
    draw();
    return {
      layout:window.__VILLAGE_SCENERY_V2__,
      renderer:window.__VILLAGE_RENDERER_V2__,
      authority:window.__VILLAGE_AUTHORITY_V3__,
      activeAuthority:drawHamletsV066.__nrtsVillageAuthority || null,
      subsystem:window.NRTS.subsystems.get('village-authority-v3')
    };
  });

  expect(result.layout.version).toBe('village-layout-v2');
  expect(result.layout.villageCount).toBeGreaterThanOrEqual(4);
  expect(result.layout.structureCount).toBeGreaterThanOrEqual(result.layout.villageCount*8);
  expect(result.layout.minStructures).toBeGreaterThanOrEqual(6);
  expect(result.layout.kinds.cottage).toBeGreaterThan(0);
  expect(result.layout.kinds.farmhouse).toBeGreaterThan(0);
  expect(result.layout.kinds.barn).toBeGreaterThan(0);
  expect((result.layout.kinds.inn||0)+(result.layout.kinds.chapel||0)).toBeGreaterThanOrEqual(result.layout.villageCount);
  expect(result.layout.navigationUnchanged).toBe(true);

  expect(result.renderer.version).toBe('village-renderer-v2');
  expect(result.renderer.projection).toBe('orthographic-top-down');
  expect(result.renderer.visibleFacades).toBe(false);
  expect(result.renderer.yardDetails).toBe(true);

  expect(result.authority.version).toBe('village-authority-v3');
  expect(result.authority.overridesLegacyV070).toBe(true);
  expect(result.authority.visibleFacades).toBe(false);
  expect(result.activeAuthority).toBe('village-authority-v3');
  expect(result.subsystem.visibleFacades).toBe(false);
  expect(errors).toEqual([]);
});
