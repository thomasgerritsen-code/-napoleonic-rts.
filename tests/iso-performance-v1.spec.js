const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function open(page,query='test=perf&view=iso'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/play.html?'+query);
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready);
 return errors;
}
test('critical images gate the live battle and expose a recoverable loading error',async({page})=>{
 let release;const gate=new Promise(r=>release=r);
 await page.route('**/fr_iso_infantry_atlas_half.webp',async route=>{await gate;await route.continue();});
 await page.goto('/play.html?view=iso',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#isoLoading')).toBeVisible();
 const before=await page.evaluate(()=>elapsed);await page.waitForTimeout(300);
 expect(await page.evaluate(()=>elapsed)).toBe(before);
 expect(await page.evaluate(()=>window.__ISO_ASSETS_READY__)).toBe(false);
 release();await expect(page.locator('#isoLoading')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>elapsed)).toBeGreaterThan(before);
});
test('missing critical artwork keeps the game paused and offers retry',async({page})=>{
 await page.route('**/fr_iso_infantry_atlas_half.webp',route=>route.abort());
 await page.goto('/play.html?view=iso');
 await expect(page.getByRole('button',{name:'Opnieuw laden'})).toBeVisible();
 expect(await page.evaluate(()=>elapsed)).toBe(0);
 expect(await page.evaluate(()=>window.__ISO_ASSETS_READY__)).toBe(false);
});
test('static obstacle index follows village replacements and live player buildings',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  const old=window.VILLAGE_SCENERY_V4;
  window.VILLAGE_SCENERY_V4=[{houses:[{id:'test',x:4000,y:1500,w:100,h:100,angle:Math.PI/4}]}];
  const api=window.__STUCK_RECOVERY_V2__,a={x:3900,y:1500},b={x:4100,y:1500};
  const before=api.stats();const blocked=api.segmentBlocked(a,b);
  for(let i=0;i<100;i++)api.segmentBlocked({x:7000,y:4000},{x:7010,y:4000});
  const after=api.stats();window.VILLAGE_SCENERY_V4=[];const cleared=api.segmentBlocked(a,b);
  const building=createBuilding('france','house',4000,1500,true);
  const built=api.segmentBlocked(a,b);building.dead=true;const destroyed=api.segmentBlocked(a,b);
  window.VILLAGE_SCENERY_V4=old;
  return{blocked,cleared,built,destroyed,builds:after.obstacleBuilds-(before.obstacleBuilds||0),candidates:after.obstacleCandidates-(before.obstacleCandidates||0)};
 });
 expect(result).toEqual({blocked:true,cleared:false,built:true,destroyed:false,builds:1,candidates:1});expect(errors).toEqual([]);
});
test('scenery and cloud caches are bounded, reused and invalidated on new battle and resize',async({page})=>{
 const errors=await open(page);
 await page.waitForFunction(()=>window.__STATIC_SPRITE_CACHE_V1__.stats().hits>20 && window.__ISO_VIEW_V1__.stats().cloudReuses>5);
 const cache=await page.evaluate(()=>window.__STATIC_SPRITE_CACHE_V1__.stats());
 expect(cache.bytes).toBeLessThanOrEqual(cache.budget);
 const clouds=await page.evaluate(()=>window.__ISO_VIEW_V1__.stats().cloudBuilds);
 await page.setViewportSize({width:1100,height:720});
 await expect.poll(()=>page.evaluate(()=>window.__ISO_VIEW_V1__.stats().cloudBuilds)).toBeGreaterThan(clouds);
 await page.getByRole('button',{name:'Nieuwe slag',exact:true}).click();
 // Since f71f25a both sides start with six workers; the French six are in view.
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__.stats().sprites>=6);
 expect(errors).toEqual([]);
});
test('normal runtime runs queued AI work without piling up a backlog',async({page})=>{
 const errors=await open(page,'view=iso');
 const initial=await page.evaluate(()=>window.__AI_AUTHORITY_V2__.stats());
 await page.evaluate(()=>{aiDecisionClock=2;aiAttackClock=8;});
 await expect.poll(()=>page.evaluate(()=>window.__AI_AUTHORITY_V2__.stats().developmentTicks)).toBeGreaterThan(initial.developmentTicks);
 await expect.poll(()=>page.evaluate(()=>window.__AI_AUTHORITY_V2__.stats().militaryTicks)).toBeGreaterThan(initial.militaryTicks);
 await expect.poll(()=>page.evaluate(()=>window.__FRAME_WORK_V1__.stats().keys.filter(k=>k.startsWith('ai:')).length)).toBe(0);
 expect(await page.evaluate(()=>window.__FRAME_WORK_V1__.stats().failed)).toBe(0);
 expect(errors).toEqual([]);
});

test('520 units stay valid with the isometric renderer and obstacle cache active',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  window.__RTS_DEBUG__.runScenario('performance-520');window.__GAME_HEALTH__.reset();
  window.__RTS_DEBUG__.tick(1);
  const own=livingUnits('france'),center=centroid(own);
  camera.x=center.x;camera.y=center.y;camera.zoom=.72;clampCamera();
  return {count:units.filter(u=>!u.dead).length,report:window.__GAME_HEALTH__.sample()};
 });
 expect(result.count).toBeGreaterThanOrEqual(500);
 expect(result.report.counters.invalidPositions).toBe(0);
 expect(result.report.counters.outsideWorld).toBe(0);
 expect(result.report.counters.runtimeErrors).toBe(0);
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__.stats().sprites>0);
 const cache=await page.evaluate(()=>window.__STATIC_SPRITE_CACHE_V1__.stats());
 expect(cache.bytes).toBeLessThanOrEqual(cache.budget);expect(errors).toEqual([]);
});
