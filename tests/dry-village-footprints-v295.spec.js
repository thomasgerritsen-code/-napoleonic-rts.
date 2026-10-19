const {test,expect}=require('@playwright/test');

test('v295 every scaled village house and yard stays clear of water and bridge decks',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=village-v7',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__VILLAGE_COLLISION_V4__?.dryRiverPlots &&
    window.NRTS?.subsystems?.get('building-placement')?.riverShoreClearance));
  const result=await page.evaluate(()=>{
    const c=__VILLAGE_COLLISION_V4__,placement=NRTS.subsystems.get('building-placement');
    const samples=[];
    for(let i=0;i<3;i++){
      if(i)resetGame();
      const houses=VILLAGE_SCENERY_V4.flatMap(v=>v.houses||[]);
      const bad=houses.filter(h=>!c.clearOfRiver(h,h.plotRadius) ||
        (riverHitV067(h.x,h.y)?.distance??Infinity)<RIVER_NAV_HALF_WIDTH_V067+
          Math.hypot(h.w,h.h)*.5+16);
      const buildingsWet=buildings.filter(b=>!b.dead && !placement.clearOfRiver(b.type,b.x,b.y));
      samples.push({houses:houses.length,villages:VILLAGE_SCENERY_V4.length,
        bad:bad.map(h=>({id:h.id,x:h.x,y:h.y})),
        buildingConflicts:buildingsWet.map(b=>({id:b.id,x:b.x,y:b.y,type:b.type})),
        overlapCount:c.overlapCount,
        waterAtHouse:houses.some(h=>waterAtV067(h.x,h.y))});
    }
    const bridge=WATER_CROSSINGS_V067[0];
    const fake={w:58,h:35,x:bridge.x,y:bridge.y};
    const safe=placement.nearestSafe('house',bridge.x,bridge.y);
    return{samples,bridgeRejected:!c.clearOfRiver(fake,Math.hypot(fake.w,fake.h)*.5+40),
      builtBridgeRejected:!placement.clearOfRiver('house',bridge.x,bridge.y),
      safe,valid:safe?placement.validSpot('house',safe.x,safe.y):false,
      bridgeMoved:safe?Math.hypot(safe.x-bridge.x,safe.y-bridge.y):0,
      villageCount:c.villageCount};
  });
  expect(errors).toEqual([]);
  expect(result.samples).toHaveLength(3);
  expect(result.villageCount).toBeGreaterThanOrEqual(4);
  for(const s of result.samples){
    expect(s.houses).toBeGreaterThan(20);
    expect(s.bad).toEqual([]);
    expect(s.buildingConflicts).toEqual([]);
    expect(s.waterAtHouse).toBe(false);
    expect(s.overlapCount).toBe(0);
  }
  expect(result.bridgeRejected).toBe(true);
  expect(result.builtBridgeRejected).toBe(true);
  expect(result.safe).toBeTruthy();
  expect(result.valid).toBe(true);
  expect(result.bridgeMoved).toBeGreaterThan(85);
  expect(errors).toEqual([]);
});

