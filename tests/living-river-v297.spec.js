const {test,expect}=require('@playwright/test');

test('v297 river shading follows smooth water geometry and does not alter bridge rules',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__LIVING_RIVER_V297__&&window.__RIVER_GEOMETRY_V296__));
  const result=await page.evaluate(()=>{
    const flow=window.__LIVING_RIVER_V297__,geometry=window.__RIVER_GEOMETRY_V296__;
    const centers=geometry.samples.filter((_,i)=>i%16===0);
    const crossings=WATER_CROSSINGS_V067.map(c=>({id:c.id,pass:crossingAtV067(c.x,c.y)?.id===c.id,
      dry:!waterAtV067(c.x,c.y)}));
    const dry=VILLAGE_SCENERY_V4.flatMap(v=>v.houses||[]).every(h=>
      __VILLAGE_COLLISION_V4__.clearOfRiver(h,h.plotRadius));
    const point=RIVER_POINTS_V067[12];
    elapsed=4.2;drawRiverV067();
    elapsed=8.6;drawRiverV067();
    const obeys=centers.filter(p=>WATER_CROSSINGS_V067.every(c=>
      !crossingPassageContainsV067(c,p.x,p.y))).every(p=>waterAtV067(p.x,p.y));
    return{flow:{version:flow.version,animated:flow.animatedFlow,banks:flow.visibleBankShading,
      nav:flow.sharedRiverGeometry,viewport:flow.mobileBoundedHighlights,halfWidth:flow.waterHalfWidth,
      drawMatch:flow.draw===drawRiverV067},
      geometryCount:geometry.samples.length,obeys,crossings,dry};
  });
  expect(errors).toEqual([]);
  expect(result.flow).toEqual({version:'river-surface-v297',animated:true,banks:true,nav:true,
    viewport:true,halfWidth:72,drawMatch:true});
  expect(result.geometryCount).toBeGreaterThan(180);
  expect(result.obeys).toBe(true);
  expect(result.crossings.every(x=>x.pass&&x.dry)).toBe(true);
  expect(result.dry).toBe(true);
});

test('v297 3D river has shallow/muddy banks and animated ripple instances',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(
    window.__BATTLEFIELD_3D_V1__?.diagnostics()?.riverAnimationClock>0 &&
    window.__NRTS_THREE_SCENE__?.getObjectByName('river-moving-ripples-v297')
  ),null,{timeout:30000});
  const first=await page.evaluate(()=>{
    const scene=window.__NRTS_THREE_SCENE__,d=__BATTLEFIELD_3D_V1__.diagnostics();
    const names=['river-damp-embankment-v297','river-silt-shore-v297',
      'river-shallow-water-v297','river-deep-water-v297','river-moving-ripples-v297'];
    return{t:d.riverAnimationClock,count:d.riverSurfaceSegments,instances:d.riverRippleInstances,
      visible:d.riverRibbonVisible,
      objects:names.map(n=>({name:n,found:!!scene.getObjectByName(n),
        triangles:scene.getObjectByName(n)?.geometry?.index?.count||0}))};
  });
  await page.waitForTimeout(180);
  const second=await page.evaluate(()=>__BATTLEFIELD_3D_V1__.diagnostics().riverAnimationClock);
  expect(errors).toEqual([]);
  expect(first.count).toBeGreaterThan(180);
  expect(first.instances).toBe(48);
  expect(first.visible).toBe(true);
  expect(first.objects.every(o=>o.found)).toBe(true);
  expect(first.objects.slice(0,4).every(o=>o.triangles>600)).toBe(true);
  expect(second).toBeGreaterThan(first.t);
});
