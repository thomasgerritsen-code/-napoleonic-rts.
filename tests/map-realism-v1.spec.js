const { test, expect } = require('@playwright/test');

test('Map Realism v1 owns battlefield visuals without changing navigation terrain', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__MAP_REALISM_V1__&&window.NRTS?.subsystems.has('map-renderer')));

  const result=await page.evaluate(()=>{
    const api=window.__MAP_REALISM_V1__;
    const samples=[
      {x:700,y:900},
      {x:1900,y:890},
      {x:590,y:430},
      {x:1200,y:500},
      {x:2600,y:1070}
    ].map(p=>({
      ...p,
      terrain:terrainAtV06(p.x,p.y),
      road:Boolean(roadNetworkAtV066(p.x,p.y))
    }));
    draw();
    return {
      version:api.version,
      fieldCount:api.fieldCount,
      roadCount:api.roadCount,
      preservesNavigation:api.preservesNavigation,
      samples,
      subsystem:window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='map-renderer')
    };
  });

  expect(result.version).toBe('map-realism-v1');
  expect(result.fieldCount).toBeGreaterThanOrEqual(12);
  expect(result.roadCount).toBeGreaterThan(5);
  expect(result.preservesNavigation).toBe(true);
  expect(result.subsystem?.meta?.phase).toBe('architecture-v2');
  expect(result.subsystem?.meta?.legacyBridge).toBe(false);
  expect(result.samples.filter(s=>s.road).length).toBeGreaterThan(1);
  expect(result.samples.every(s=>typeof s.terrain==='string')).toBe(true);
  expect(errors).toEqual([]);
});
