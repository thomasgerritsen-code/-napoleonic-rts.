const {test,expect}=require('@playwright/test');

test('v297 water shows layered silt banks and tangent-aligned animated current in 2D',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_RENDER_V297__?.flowingRipples&&window.__RIVER_GEOMETRY_V296__?.samples?.length));
  const result=await page.evaluate(()=>{
    camera.x=1500;camera.y=900;
    const old=elapsed;
    elapsed=30;drawRiverV067();const at30=__RIVER_RENDER_V297__.lastDrawn;
    elapsed=40;drawRiverV067();const at40=__RIVER_RENDER_V297__.lastDrawn;
    elapsed=old;
    const g=__RIVER_GEOMETRY_V296__;
    return {render:__RIVER_RENDER_V297__,count:g.samples.length,
      at30,at40,originalCrossings:g.crossingCount,
      navHalf:g.navHalfWidth,bankWidth:175,
      banks:RIVER_POINTS_V067.slice(1,6).map(p=>({
        wet:waterAtV067(p.x,p.y),dry:!waterAtV067(p.x-200,p.y)
      }))};
  });
  expect(errors).toEqual([]);
  expect(result.render.muddyBanks).toBe(true);
  expect(result.render.shallowWater).toBe(true);
  expect(result.render.deepChannel).toBe(true);
  expect(result.at30).toBeGreaterThan(0);
  expect(result.at40).toBeGreaterThan(0);
  expect(result.count).toBeGreaterThan(180);
  expect(result.originalCrossings).toBe(5);
  expect(result.navHalf).toBe(72);
  expect(result.banks.filter(x=>x.wet).length).toBeGreaterThanOrEqual(3);
});

test('v297 3D river is visible, follows shared 296 samples and current animates',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__NRTS_THREE_SCENE__?.getObjectByName('river-current-v297')&&
    window.__BATTLEFIELD_3D_V1__?.diagnostics()?.riverWaterMesh),null,{timeout:30000});
  const before=await page.evaluate(()=>{
    const sc=window.__NRTS_THREE_SCENE__;
    const water=sc.getObjectByName('river-water-v297');
    const current=sc.getObjectByName('river-current-v297');
    const banks=sc.getObjectByName('river-banks-v297');
    return{geo:water?.geometry?.attributes?.position?.count,
      ribbons:current?.geometry?.attributes?.position?.count,
      currentMaterial:current?.material?.type,
      bankCount:banks?.children?.length,
      time:current?.material?.uniforms?.time?.value,
      samples:window.__RIVER_GEOMETRY_V296__.samples.length};
  });
  await page.waitForTimeout(180);
  const now=await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.diagnostics());
  expect(errors).toEqual([]);
  expect(before.geo).toBe(before.samples*2);
  expect(before.ribbons).toBe(before.geo);
  expect(before.currentMaterial).toBe('ShaderMaterial');
  expect(before.bankCount).toBe(2);
  expect(now.riverShoreBands).toBe(2);
  expect(now.riverCurrentTime).toBeGreaterThan(before.time);
  expect(now.riverWaterMesh).toBe(true);
});
