const {test,expect}=require('@playwright/test');

test('v294 harvestable trees and berries stay clear of all riverbanks and bridges after multiple resets',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__BATTLEFIELD_ECOLOGY_V1__?.treeBerryShoreExclusion &&
    window.__NATURAL_RESOURCES_V1__?.riverRenderGuard &&
    window.__MAP_REALISM_V2__?.waterVegetationClearance
  ));
  const state=await page.evaluate(()=>{
    const eco=window.__BATTLEFIELD_ECOLOGY_V1__,view=window.__NATURAL_RESOURCES_V1__;
    function audit(phase){
      const nature=resources.filter(r=>!r.dead&&r.amount>0&&['wood','food'].includes(r.type));
      const conflicts=nature.filter(r=>eco.riverbankConflict(r.type,r.x,r.y)||
        waterAtV067(r.x,r.y)||eco.roadConflict(r.type,r.x,r.y));
      const baseBerries=buildings.filter(b=>!b.dead&&b.type==='towncenter')
        .map(tc=>({side:tc.side,count:nature.filter(r=>r.type==='food'&&
          r.localVillageBerry===true&&r.homeSide===tc.side&&
          Math.hypot(r.x-tc.x,r.y-tc.y)<260).length}));
      return {phase,nature:nature.length,trees:nature.filter(r=>r.type==='wood').length,
        berries:nature.filter(r=>r.type==='food').length,
        conflicts:conflicts.map(r=>({type:r.type,x:r.x,y:r.y})),
        baseBerries,
        badMarks:nature.filter(r=>r.visualKind!==(r.type==='wood'?'deciduous-tree':'berry-bush')).length};
    }
    const snapshots=[audit('start')];
    resetGame();snapshots.push(audit('reset one'));
    resetGame();snapshots.push(audit('reset two'));
    const river=RIVER_POINTS_V067[11],bridge=WATER_CROSSINGS_V067[0];
    const attempts=[];
    for(const type of ['wood','food']){
      for(const at of [{x:river.x,y:river.y},
        {x:river.x+RIVER_NAV_HALF_WIDTH_V067+8,y:river.y},
        {x:bridge.x,y:bridge.y}]){
        const initialConflict=eco.riverbankConflict(type,at.x,at.y);
        const r=createResource(type,at.x,at.y,270);
        attempts.push({type,initialConflict,spawned:!!r,
          moved:r?Math.hypot(r.x-at.x,r.y-at.y):0,
          dry:r?!eco.riverbankConflict(type,r.x,r.y):false,
          valid:r?eco.validSpot(type,r.x,r.y,r):false,
          hidden:r?view.overlapsRiver(r):false});
      }
    }
    snapshots.push(audit('newly spawned'));
    const invalidTree={type:'wood',x:river.x,y:river.y,amount:300,maxAmount:300};
    const invalidBerry={type:'food',x:river.x,y:river.y,amount:300,maxAmount:300};
    return {snapshots,attempts,
      rendererRejects:[view.overlapsRiver(invalidTree),view.overlapsRiver(invalidBerry)],
      decorativeRejects:!window.__MAP_REALISM_V2__.dryCanopy(river.x,river.y,9),
      flags:{eco:eco.allResourceRiverbankExclusion,visual:view.riverRenderGuard}};
  });
  expect(errors).toEqual([]);
  expect(state.flags).toEqual({eco:true,visual:true});
  expect(state.decorativeRejects).toBe(true);
  expect(state.rendererRejects).toEqual([true,true]);
  for(const snapshot of state.snapshots){
    expect(snapshot.nature).toBeGreaterThan(90);
    expect(snapshot.trees).toBeGreaterThan(30);
    expect(snapshot.berries).toBeGreaterThan(20);
    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.badMarks).toBe(0);
    expect(snapshot.baseBerries).toHaveLength(2);
    for(const base of snapshot.baseBerries)
      expect(base.count).toBeGreaterThanOrEqual(5);
  }
  expect(state.attempts).toHaveLength(6);
  // Near a congested bridge the correct behavior is to reject the new
  // resource if no safe inland spot exists. Unsafe spawns are never allowed.
  expect(state.attempts.some(a=>a.spawned)).toBe(true);
  for(const attempt of state.attempts){
    expect(attempt.initialConflict).toBe(true);
    if(!attempt.spawned)continue;
    expect(attempt.moved).toBeGreaterThan(20);
    expect(attempt.dry).toBe(true);
    expect(attempt.valid).toBe(true);
    expect(attempt.hidden).toBe(false);
  }
});

test('v294 dry vegetation stays harvestable and hidden from river in 3D scene',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(
    window.NRTS_3D_SOURCE && window.__BATTLEFIELD_ECOLOGY_V1__?.riverbankConflict &&
    window.__BATTLEFIELD_3D_V1__?.diagnostics()
  ),null,{timeout:25000});
  const out=await page.evaluate(()=>{
    const eco=window.__BATTLEFIELD_ECOLOGY_V1__;
    const nature=window.NRTS_3D_SOURCE.resources().filter(r=>
      !r.dead&&['wood','food'].includes(r.type));
    return{total:nature.length,bad:nature.filter(r=>eco.riverbankConflict(r.type,r.x,r.y))
      .map(r=>({id:r.id,type:r.type})),
      trees:nature.filter(r=>r.type==='wood').length,
      berries:nature.filter(r=>r.type==='food').length,
      oreDry:window.NRTS_3D_SOURCE.resources()
        .filter(r=>r.type==='iron'&&!r.dead)
        .every(r=>!eco.oreShoreConflict(r.x,r.y))};
  });
  expect(errors).toEqual([]);
  expect(out.trees).toBeGreaterThan(30);
  expect(out.berries).toBeGreaterThan(20);
  expect(out.bad).toEqual([]);
  expect(out.oreDry).toBe(true);
});
