const {test,expect}=require('@playwright/test');

test('v297 2D river uses six soft layers and animated current following the shared v296 tangent',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_SURFACE_V297__?.flowingRipples&&window.__RIVER_GEOMETRY_V296__));
  const result=await page.evaluate(()=>{
    const v=window.__RIVER_SURFACE_V297__,g=window.__RIVER_GEOMETRY_V296__;
    const before=v.flowSample(7,0),after=v.flowSample(7,5.3);
    const direction=g.tangentAt(before.y);
    const signedAdvance=(after.x-before.x)*direction.x+(after.y-before.y)*direction.y;
    const previous=elapsed;elapsed=12;drawTerrain();elapsed=previous;
    const crossings=WATER_CROSSINGS_V067.map(c=>({
      id:c.id,water:waterAtV067(c.x,c.y),
      centerError:Math.abs(g.centerAt(c.y)-c.x)}));
    return{layers:v.surfaceLayers,count:v.sampleCount,from:before,to:after,signedAdvance,
      crossings,waterCenterIsWet:waterAtV067(g.centerAt(2900),2900),
      drawName:drawRiverV067.name,navigationShared:v.sharedGeometry,
      channelWithinNavigation:v.channelWithinNavigation};
  });
  expect(errors).toEqual([]);
  expect(result.layers).toBe(6);
  expect(result.count).toBeGreaterThan(150);
  expect(result.from).not.toEqual(result.to);
  expect(result.signedAdvance).toBeGreaterThan(30);
  expect(result.navigationShared).toBe(true);
  expect(result.channelWithinNavigation).toBe(true);
  expect(result.drawName).toBe('drawRiverNaturalV297');
  expect(result.crossings).toHaveLength(5);
  for(const crossing of result.crossings){
    expect(crossing.water).toBe(false);
    expect(crossing.centerError).toBeLessThan(5);
  }
  expect(result.waterCenterIsWet).toBe(true);
});

test('v297 3D river has one animated surface and two low shoreline meshes following navigation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__BATTLEFIELD_3D_WATER_V297__?.activeCurrent),
    null,{timeout:30000});
  const first=await page.evaluate(()=>{
    const w=window.__BATTLEFIELD_3D_WATER_V297__;
    const group=window.__NRTS_THREE_SCENE__.getObjectByName('natural-river-3d-v297');
    const mesh=group?.getObjectByName('flowing-water-v297');
    const world=window.NRTS_3D_SOURCE.staticWorld().river;
    return{
      api:w.diagnostics(),offset:w.flowUV(),samples:world.samples.length,
      children:group?.children?.length||0,
      mesh:mesh?.geometry?.attributes.position.count||0,
      index:mesh?.geometry?.index?.count||0,
      texture:mesh?.material?.map?.isTexture===true,
      originalCrossings:world.crossings.length,
      navHalfWidth:world.navHalfWidth,
      hooks:window.__BATTLEFIELD_3D_V1__.diagnostics().riverFlowHooks
    };
  });
  await page.waitForTimeout(650);
  const second=await page.evaluate(()=>window.__BATTLEFIELD_3D_WATER_V297__.flowUV());
  expect(errors).toEqual([]);
  expect(first.samples).toBeGreaterThan(150);
  expect(first.children).toBe(3);
  expect(first.mesh).toBe(first.samples*5);
  expect(first.index).toBeGreaterThan(1000);
  expect(first.texture).toBe(true);
  expect(first.originalCrossings).toBe(5);
  expect(first.navHalfWidth).toBe(72);
  expect(first.hooks).toBe(1);
  expect(Math.abs(second-first.offset)).toBeGreaterThan(.002);
});
