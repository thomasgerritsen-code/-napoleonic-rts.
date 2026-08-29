const { test, expect } = require('@playwright/test');

test('Map Ambient Motion v1 stays visual-only and preserves terrain/navigation', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__MAP_AMBIENT_MOTION_V1__&&window.NRTS?.subsystems.has('map-ambient-motion')));
  const result=await page.evaluate(()=>{
    const api=window.__MAP_AMBIENT_MOTION_V1__;
    const meta=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='map-ambient-motion')?.meta;
    const samples=[{x:700,y:900},{x:590,y:430},{x:1900,y:890}];
    const before=samples.map(p=>({terrain:terrainAtV06(p.x,p.y),road:Boolean(roadAtV064(p.x,p.y))}));
    drawTerrain();
    drawParticles();
    const after=samples.map(p=>({terrain:terrainAtV06(p.x,p.y),road:Boolean(roadAtV064(p.x,p.y))}));
    return {version:api.version,features:[...api.features],visualOnly:api.visualOnly,meta,before,after,wind:api.wind};
  });
  expect(result.version).toBe('map-ambient-motion-v1');
  expect(result.visualOnly).toBe(true);
  expect(result.meta?.phase).toBe('architecture-v2');
  expect(result.meta?.legacyBridge).toBe(false);
  expect(result.features).toEqual(['grass-sway','tree-canopy-sway','field-ripple','smoke-drift']);
  expect(result.after).toEqual(result.before);
  expect(Math.hypot(result.wind.x,result.wind.y)).toBeGreaterThan(0);
  await page.evaluate(()=>window.RTS_SIM.step(.25));
  expect(errors).toEqual([]);
});
