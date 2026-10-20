const {test,expect}=require('@playwright/test');

test('v313 provides harvestable food for large armies near both camps and across the battlefield',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__BATTLEFIELD_ECOLOGY_V1__?.countrysideBerryStats);
  const state=await page.evaluate(()=>{
    const eco=window.__BATTLEFIELD_ECOLOGY_V1__;
    const food=resources.filter(r=>!r.dead&&r.type==='food'&&r.amount>0);
    const countryside=food.filter(r=>r.countrysideBerryPatch);
    const base=food.filter(r=>r.localVillageBerry);
    const unsafe=countryside.filter(r=>
      !eco.validSpot('food',r.x,r.y,r) ||
      eco.roadConflict('food',r.x,r.y) ||
      eco.riverbankConflict('food',r.x,r.y));
    const before=eco.countrysideBerryStats();
    eco.refreshBaseVillageAccess();
    const after=eco.countrysideBerryStats();
    return {
      min:eco.baseVillageBerryMin,
      base:eco.baseVillageBerryStats(),
      baseCount:base.length,
      countryside:before,
      noDuplicatedPatches:before.count===after.count,
      foodCount:food.length,
      totalFood:food.reduce((sum,r)=>sum+r.amount,0),
      unsafe:unsafe.map(r=>r.id),
      localAmounts:base.map(r=>r.maxAmount),
      patchAmounts:countryside.map(r=>r.maxAmount)
    };
  });
  expect(state.min).toBe(10);
  expect(state.base).toHaveLength(2);
  expect(state.base.every(b=>b.count>=10&&b.blockedApproaches===0&&
    b.roadConflicts===0&&b.houseConflicts===0&&b.buildingConflicts===0)).toBe(true);
  expect(state.baseCount).toBeGreaterThanOrEqual(20);
  expect(state.countryside.count).toBeGreaterThanOrEqual(40);
  expect(state.countryside.perSite).toHaveLength(9);
  expect(state.countryside.perSite.every(n=>n>=4)).toBe(true);
  expect(state.noDuplicatedPatches).toBe(true);
  expect(state.foodCount).toBeGreaterThanOrEqual(85);
  expect(state.totalFood).toBeGreaterThan(40000);
  expect(state.localAmounts.every(n=>n===600)).toBe(true);
  expect(state.patchAmounts.every(n=>n===600)).toBe(true);
  expect(state.unsafe).toEqual([]);
  expect(errors).toEqual([]);
});

test('v313 normal reset seeds countryside food once; depletion does not secretly refill it',async({page})=>{
  await page.goto('/?test=v071',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__BATTLEFIELD_ECOLOGY_V1__?.countrysideBerryStats);
  const result=await page.evaluate(()=>{
    const eco=window.__BATTLEFIELD_ECOLOGY_V1__;
    const before=eco.countrysideBerryStats();
    const depleted=resources.find(r=>r.countrysideBerryPatch&&!r.dead);
    depleted.amount=0;depleted.dead=true;
    eco.refreshBaseVillageAccess();
    const mid=eco.countrysideBerryStats();
    resetGame();
    const after=eco.countrysideBerryStats();
    eco.refreshBaseVillageAccess();
    const again=eco.countrysideBerryStats();
    return{before,mid,after,again,base:eco.baseVillageBerryStats()};
  });
  expect(result.before.count).toBeGreaterThanOrEqual(40);
  expect(result.mid.count).toBe(result.before.count-1);
  expect(result.after.count).toBe(result.before.count);
  expect(result.again.count).toBe(result.after.count);
  expect(result.base.every(b=>b.count>=10&&b.blockedApproaches===0)).toBe(true);
});
