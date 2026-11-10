const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?test=mounted-movement&view=iso');
 await page.waitForFunction(()=>window.__TROOPS_V1__&&window.__OFFICER_ASSIGNMENT_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
test('a mounted officer alone can gather nearby matching riders through the action button',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{
  const officer=createUnit('france','officer',4000,1850);__TROOPS_V1__.applyTroop(officer,'mounted');
  const riders=Array.from({length:4},(_,i)=>createUnit('france','cavalry',4040+i*30,1850));
  const foot=createUnit('france','officer',3990,1850);
  window.__mountedTest={officer,riders,foot};selectedBuilding=null;selectedUnits.clear();selectedUnits.add(officer);updateHud(true);
 });
 const button=page.locator('[data-action="create-cavalry-regiment"]');
 await expect(button).toBeVisible();await expect(button).toBeEnabled();await button.click();
 expect(await page.evaluate(()=>{const t=__mountedTest,g=selectedRegiments()[0];return{kind:g?.kind,officer:g?.officerId===t.officer.id,riders:t.riders.every(u=>u.regimentId===g?.id),footLoose:!t.foot.regimentId};})).toEqual({kind:'cavalry',officer:true,riders:true,footLoose:true});
 expect(errors).toEqual([]);
});
test('local detours have no leg cutting through their own blocking building',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  const b=createBuilding('france','house',4000,1800,true),a={x:b.x-180,y:b.y},goal={x:b.x+180,y:b.y};
  const route=__STUCK_RECOVERY_V2__.localWaypoint(a,goal);
  const waypoint=route.waypoint;
  return{waypoint,blocked:waypoint&&__STUCK_RECOVERY_V2__.segmentBlocked(a,waypoint)};
 });
 expect(result.waypoint).toBeTruthy();expect(result.blocked).toBe(false);expect(errors).toEqual([]);
});
test('loose friendly soldiers pass head-on without repeated backwards corrections',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  const a=createUnit('france','infantry',3900,1800),b=createUnit('france','infantry',4140,1800);
  a.targetX=4200;a.targetY=1800;b.targetX=3840;b.targetY=1800;
  let backtracks=0,minDistance=Infinity,maxStep=0,pa=a.x,pb=b.x;
  for(let i=0;i<720;i++){
   elapsed+=1/60;rebuildSpatialHash();moveToward(a,a.targetX,a.targetY,1/60);moveToward(b,b.targetX,b.targetY,1/60);resolveUnitOverlaps();
   if(a.x<pa-.1||b.x>pb+.1)backtracks++;
   minDistance=Math.min(minDistance,Math.hypot(a.x-b.x,a.y-b.y));maxStep=Math.max(maxStep,Math.abs(a.x-pa),Math.abs(b.x-pb));pa=a.x;pb=b.x;
  }
  return{ax:a.x,bx:b.x,backtracks,minDistance,maxStep};
 });
 expect(result.ax).toBeGreaterThan(4190);expect(result.bx).toBeLessThan(3850);expect(result.backtracks).toBeLessThan(8);expect(result.minDistance).toBeGreaterThan(10);expect(result.maxStep).toBeLessThan(3);expect(errors).toEqual([]);
});
test('riders keep their own troop type and never recruit distant men or a foot officer',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  const officer=createUnit('france','officer',4000,1800);__TROOPS_V1__.applyTroop(officer,'mounted');
  const add=(x,kind)=>{const u=createUnit('france','cavalry',x,1800);__TROOPS_V1__.applyTroop(u,kind);return u;};
  const riders=[add(4020,'hussar'),add(4040,'hussar')],other=[add(4060,'lancer'),add(4080,'lancer')],distant=add(4700,'hussar');
  const first=__CAVALRY_REGIMENT_V1__.plan([officer,...riders,...other]);
  const foot=createUnit('france','officer',4000,1830);const wrong=__CAVALRY_REGIMENT_V1__.plan([foot,...riders]);
  riders.push(add(4100,'hussar'),add(4120,'hussar'));
  const second=__CAVALRY_REGIMENT_V1__.plan([officer,...riders,...other]);
  return{short:first.ok,wrong:wrong.ok,complete:second.ok,ids:second.riders.map(u=>u.id),expected:riders.map(u=>u.id),distant:distant.regimentId||null};
 });
 expect(result.short).toBe(false);expect(result.wrong).toBe(false);expect(result.complete).toBe(true);expect(result.ids).toEqual(result.expected);expect(result.distant).toBeNull();expect(errors).toEqual([]);
});
test('a stable queues only the missing mounted staff and riders, then forms them through its button',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{
  const stable=createBuilding('france','stable',4400,1800,true);stable.rallyX=4400;stable.rallyY=2000;
  economies.france.food=economies.france.wood=economies.france.iron=10000;economies.france.popCap=1000;
  window.__cavalryStable=stable;selectedUnits.clear();selectedBuilding=stable;updateHud(true);
 });
 const train=page.locator('[data-action="train-cavalry-missing"]');await expect(train).toBeVisible();await train.click();await train.click();
 expect(await page.evaluate(()=>__cavalryStable.queue.map(q=>q.troop||q.type))).toEqual(['mounted','cavalry','cavalry','cavalry','cavalry']);
 await page.evaluate(()=>{for(let i=0;i<5;i++)updateBuildings(100);const b=__cavalryStable;for(const u of units.filter(u=>u.side==='france'&&!u.regimentId&&['cavalry','officer'].includes(u.type)&&Math.hypot(u.x-b.x,u.y-b.y)<700)){u.x=b.rallyX;u.y=b.rallyY;u.targetX=u.x;u.targetY=u.y;}updateHud(true);});
 const form=page.locator('[data-action="quick-cavalry-stable"]');await expect(form).toBeEnabled();await form.click();
 expect(await page.evaluate(()=>{const g=selectedRegiments()[0];return{kind:g?.kind,mounted:units.find(u=>u.id===g?.officerId)?.troop,count:regimentMembers(g).filter(u=>u.type==='cavalry').length};})).toEqual({kind:'cavalry',mounted:'mounted',count:4});expect(errors).toEqual([]);
});
test('infantry and horses round a building without clipping, backwards jumps or repeated replanning',async({page})=>{
 const errors=await open(page);
 const results=await page.evaluate(()=>{
  const b=createBuilding('france','house',4000,1800,true);
  return ['infantry','cavalry'].map(type=>{
   const u=createUnit('france',type,b.x-180,b.y);u.targetX=b.x+180;u.targetY=b.y;
   const before=__STUCK_RECOVERY_V2__.stats().localDetours;
   let backtracks=0,minClear=Infinity,maxStep=0;
   for(let i=0;i<900;i++){
    elapsed+=1/60;const p={x:u.x,y:u.y};rebuildSpatialHash();moveToward(u,u.targetX,u.targetY,1/60);
    if(u.x<p.x-.1)backtracks++;maxStep=Math.max(maxStep,Math.hypot(u.x-p.x,u.y-p.y));
    minClear=Math.min(minClear,Math.hypot(Math.max(0,Math.abs(u.x-b.x)-b.w/2),Math.max(0,Math.abs(u.y-b.y)-b.h/2)));
   }
   u.dead=true;return{distance:Math.hypot(u.x-u.targetX,u.y-u.targetY),backtracks,minClear,maxStep,plans:__STUCK_RECOVERY_V2__.stats().localDetours-before};
  });
 });
 for(const r of results){expect(r.distance).toBeLessThan(6);expect(r.backtracks).toBeLessThan(8);expect(r.minClear).toBeGreaterThan(7);expect(r.maxStep).toBeLessThan(3);expect(r.plans).toBeLessThan(5);}expect(errors).toEqual([]);
});
test('a man already inside a clearance buffer can leave in small legal steps and obey a changed destination',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const b=createBuilding('france','house',4000,1800,true),u=createUnit('france','infantry',b.x-b.w/2-4,b.y);
  const start=u.x;u.targetX=u.x-80;u.targetY=u.y;
  for(let i=0;i<90;i++){elapsed+=1/60;moveToward(u,u.targetX,u.targetY,1/60);}
  const escaped=u.x<start-40;
  u.x=b.x-160;u.y=b.y;u.targetX=b.x+160;u.targetY=b.y;moveToward(u,u.targetX,u.targetY,1/60);
  const detour=!!u.localAvoidanceV2;
  u.targetX=b.x-240;u.targetY=b.y+50;
  for(let i=0;i<240;i++){elapsed+=1/60;moveToward(u,u.targetX,u.targetY,1/60);}
  return{escaped,detour,distance:Math.hypot(u.x-u.targetX,u.y-u.targetY)};
 });expect(r.escaped).toBe(true);expect(r.detour).toBe(true);expect(r.distance).toBeLessThan(6);expect(errors).toEqual([]);
});
