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

