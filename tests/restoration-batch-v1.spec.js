const { test, expect } = require('@playwright/test');

async function openRestoration(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=restore1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__BATTLEFIELD_ECOLOGY_V1__ &&
    window.__GAMEPLAY_BUILDING_SCALE_V1__ &&
    window.__MAP_REALISM_V2__ &&
    window.__NATURAL_RESOURCES_V1__ &&
    window.__CHARACTER_VISUALS_V2__ &&
    window.__ARTILLERY_TOPDOWN_V1__ &&
    window.__ARTILLERY_CREW_APPROACH_V1__ &&
    window.__STUCK_RECOVERY_V1__ &&
    window.__AI_AUTHORITY_V2__ &&
    window.__FORMATION_DRAG_V1__
  ));
  return errors;
}

test('restored world keeps resources clear, berries outside villages, water visible and buildings larger',async({page})=>{
  const errors=await openRestoration(page);
  const result=await page.evaluate(()=>{
    const ecology=window.__BATTLEFIELD_ECOLOGY_V1__;
    const live=resources.filter(r=>!r.dead);
    const food=live.filter(r=>r.type==='food');
    return{
      liveResources:live.length,
      foodCount:food.length,
      resourceBuildingConflicts:live.filter(r=>ecology.buildingConflict(r.type,r.x,r.y)).length,
      resourceVillageHouseConflicts:live.filter(r=>ecology.villageHouseConflict(r.type,r.x,r.y)).length,
      berriesInsideVillage:food.filter(r=>ecology.insideVillage(r.x,r.y)).length,
      foodVisualKinds:[...new Set(food.map(r=>r.visualKind))],
      buildingScale:window.__GAMEPLAY_BUILDING_SCALE_V1__.scale,
      towncenter:window.__GAMEPLAY_BUILDING_SCALE_V1__.types.towncenter,
      map:window.__MAP_REALISM_V2__,
      natural:window.__NATURAL_RESOURCES_V1__,
      activeRoadCount:window.NRTS_ROAD_NETWORK_V7?.length||0
    };
  });
  expect(result.liveResources).toBeGreaterThan(10);
  expect(result.foodCount).toBeGreaterThan(0);
  expect(result.resourceBuildingConflicts).toBe(0);
  expect(result.resourceVillageHouseConflicts).toBe(0);
  expect(result.berriesInsideVillage).toBe(0);
  expect(result.foodVisualKinds).toEqual(['berry-bush']);
  expect(result.buildingScale).toBeGreaterThan(1.3);
  expect(result.towncenter.w).toBeGreaterThan(120);
  expect(result.map.riverRestored).toBe(true);
  expect(result.map.crossingsRestored).toBe(true);
  expect(result.map.blendedJunctions).toBe(true);
  expect(result.map.roadCount).toBe(result.activeRoadCount);
  expect(result.natural.projection).toBe('orthographic-top-down');
  expect(errors).toEqual([]);
});

test('all troop visual authorities are top-down Napoleonic renderers',async({page})=>{
  const errors=await openRestoration(page);
  const result=await page.evaluate(()=>({
    characters:window.__CHARACTER_VISUALS_V2__,
    artillery:window.__ARTILLERY_TOPDOWN_V1__
  }));
  expect(result.characters.projection).toBe('orthographic-top-down');
  expect(result.characters.napoleonicUniforms).toBe(true);
  expect(result.characters.supportedTypes).toEqual(expect.arrayContaining(['infantry','officer','drummer','cavalry','worker']));
  expect(result.artillery.projection).toBe('orthographic-top-down');
  expect(result.artillery.crewUsesNapoleonicRenderer).toBe(true);
  expect(errors).toEqual([]);
});

test('artillery crew walks to the cannon before compound attachment',async({page})=>{
  const errors=await openRestoration(page);
  const result=await page.evaluate(()=>{
    const cannon=createUnit('france','artillery',1180,2050);
    const a=createUnit('france','infantry',900,1990);
    const b=createUnit('france','infantry',900,2110);
    const before={a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};
    const reg=createArtilleryBatteryV06('france',cannon,[a,b],'Approach test battery');
    const immediate={
      id:reg.id,
      active:reg.crewApproachV1?.active===true,
      aDistance:Math.hypot(a.x-cannon.x,a.y-cannon.y),
      bDistance:Math.hypot(b.x-cannon.x,b.y-cannon.y),
      aStayed:Math.hypot(a.x-before.a.x,a.y-before.a.y)<1,
      bStayed:Math.hypot(b.x-before.b.x,b.y-before.b.y)<1,
      canOperate:canArtilleryOperateV06(cannon)
    };
    window.__RTS_DEBUG__.tick(1.0);
    const afterOne={aDistance:Math.hypot(a.x-cannon.x,a.y-cannon.y),bDistance:Math.hypot(b.x-cannon.x,b.y-cannon.y)};
    window.__RTS_DEBUG__.tick(7.0);
    return{
      immediate,afterOne,
      completed:reg.crewApproachV1?.active===false,
      canOperateAfter:canArtilleryOperateV06(cannon),
      state:window.__ARTILLERY_CREW_APPROACH_V1__.state(reg.id)
    };
  });
  expect(result.immediate.active).toBe(true);
  expect(result.immediate.aStayed).toBe(true);
  expect(result.immediate.bStayed).toBe(true);
  expect(result.immediate.canOperate).toBe(false);
  expect(result.afterOne.aDistance).toBeLessThan(result.immediate.aDistance);
  expect(result.afterOne.bDistance).toBeLessThan(result.immediate.bDistance);
  expect(result.completed).toBe(true);
  expect(result.canOperateAfter).toBe(true);
  expect(errors).toEqual([]);
});

test('long battalion orders use strategic roads and right-drag restores final facing',async({page})=>{
  const errors=await openRestoration(page);
  const result=await page.evaluate(()=>{
    const id=window.__RTS_DEBUG__.createRegimentDirect('france');
    const reg=getRegiment(id);
    window.__RTS_DEBUG__.selectRegiment(id);
    orderGroupPathV06(reg,3020,900,'line',0);
    const route={choice:reg.routePlanV065?.choice||null,roads:(reg.routeRoadsV066||[]).map(r=>r.id),pathLength:reg.path?.length||0};

    const destination=worldToScreen(2100,820),front=worldToScreen(2100,1050),pointerId=77;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId,button:2,clientX:destination.x,clientY:destination.y,bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId,button:2,clientX:front.x,clientY:front.y,bubbles:true}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId,button:2,clientX:front.x,clientY:front.y,bubbles:true}));
    const input=window.__FORMATION_DRAG_V1__.state();
    return{route,input,finalFacing:reg.finalFacing};
  });
  expect(result.route.pathLength).toBeGreaterThan(1);
  expect(result.route.roads.length).toBeGreaterThan(0);
  expect(result.route.choice).toBe('road');
  expect(result.input.orders).toBeGreaterThan(0);
  expect(result.input.lastFacing).not.toBeNull();
  expect(Math.abs(result.finalFacing-result.input.lastFacing)).toBeLessThan(.02);
  expect(errors).toEqual([]);
});

test('final AI and stuck-recovery authorities survive the legacy stack',async({page})=>{
  const errors=await openRestoration(page);
  const result=await page.evaluate(()=>{
    economies.britain.food=5000;economies.britain.wood=5000;
    const before=window.__AI_AUTHORITY_V2__.stats();
    for(let i=0;i<8;i++)aiDevelop();
    aiMilitaryOrder();
    const after=window.__AI_AUTHORITY_V2__.stats();
    return{
      before,after,
      stuck:window.__STUCK_RECOVERY_V1__.stats(),
      aiVersion:window.__AI_AUTHORITY_V2__.version,
      stuckVersion:window.__STUCK_RECOVERY_V1__.version,
      localAvoidance:window.__STUCK_RECOVERY_V2__?.localBuildingAvoidance===true,
      plan:aiPlan
    };
  });
  expect(result.aiVersion).toBe('ai-authority-v2');
  expect(result.stuckVersion).toBe('stuck-recovery-v2');
  expect(result.localAvoidance).toBe(true);
  expect(result.after.developmentTicks-result.before.developmentTicks).toBe(8);
  expect(result.after.militaryTicks-result.before.militaryTicks).toBe(1);
  expect(result.plan.length).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
