const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__NRTS_HUMAN_BRITAIN__=true;window.atmoClock=10000;window.atmoRAF=true;performance.now=()=>atmoClock;
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(atmoRAF)fn(atmoClock);});
 });
 await page.goto('/?view=iso&test=battlefield-atmosphere');
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&__ISO_VIEW_V1__.stats().assets.background===0);
 await page.evaluate(()=>{
  atmoRAF=false;window.atmoFrame=(ms=1000/60)=>{atmoClock+=ms;renderStableFrameV1(()=>{},atmoClock);return __ISO_VIEW_V1__.stats();};
 });return errors;
}
for(const mobile of[true,false])test(`cached ground dressing reuses tiles and stays bounded on ${mobile?'mobile':'desktop'}`,async({browser})=>{
 const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:900}});
 try{
  const page=await context.newPage(),errors=await open(page);
  const r=await page.evaluate(()=>{
   camera.x=3900;camera.y=1800;camera.zoom=1.6;
   const scout=createUnit('france','infantry',3900,1800);scout.reload=100;scout.targetX=scout.x;scout.targetY=scout.y;RTS_SIM.step(.05);
   const before=JSON.stringify(units.map(u=>[u.id,u.x,u.y,u.hp,u.targetX,u.targetY]));
   for(let i=0;i<16;i++)atmoFrame();const warm=__ISO_VIEW_V1__.stats();
   for(let i=0;i<12;i++)atmoFrame();const reused=__ISO_VIEW_V1__.stats();
   const readonly=before===JSON.stringify(units.map(u=>[u.id,u.x,u.y,u.hp,u.targetX,u.targetY]));
   return{warm,reused,readonly};
  });
  expect(r.warm.groundDetailDraws).toBeGreaterThan(0);expect(r.warm.groundDetail.patches).toBeGreaterThan(0);
  expect(r.reused.groundDetail.builds).toBe(r.warm.groundDetail.builds);expect(r.reused.groundDetail.hits).toBeGreaterThan(r.warm.groundDetail.hits);expect(r.readonly).toBe(true);
  await page.screenshot({path:test.info().outputPath(mobile?'ground-detail-mobile.png':'ground-detail-desktop.png')});
  const rest=await page.evaluate(()=>{
   for(let i=0;i<50;i++){camera.x=300+(i*437)%7500;camera.y=300+(i*281)%4000;atmoFrame();}
   const travel=__ISO_VIEW_V1__.stats();camera.zoom=.65;const distant=atmoFrame();
   camera.zoom=1.6;__ISO_VIEW_V1__.setOverview(true);const overview=atmoFrame();
   resetGame();return{travel,distant,overview,reset:__ISO_VIEW_V1__.stats()};
  });
  expect(rest.travel.groundDetail.bytes).toBeLessThanOrEqual(rest.travel.groundDetail.maxBytes);expect(rest.travel.groundDetail.tiles).toBeLessThanOrEqual(rest.travel.groundDetail.maxTiles);
  expect(rest.distant.groundDetailDraws).toBe(0);expect(rest.overview.groundDetailDraws).toBe(0);expect(rest.reset.groundDetail.bytes).toBe(0);expect(rest.reset.groundDetail.tiles).toBe(0);
  if(!mobile){
   await page.setViewportSize({width:3840,height:2160});
   const wide=await page.evaluate(()=>{
    __ISO_VIEW_V1__.setOverview(false);camera.x=3900;camera.y=2200;camera.zoom=.9;
    for(let i=0;i<30;i++)atmoFrame();const a=__ISO_VIEW_V1__.stats();
    for(let i=0;i<12;i++)atmoFrame();return{a,b:__ISO_VIEW_V1__.stats()};
   });
   expect(wide.b.groundDetail.builds).toBe(wide.a.groundDetail.builds);expect(wide.b.groundDetail.bytes).toBeLessThanOrEqual(wide.b.groundDetail.maxBytes);
   console.log('GROUND_WIDE_REUSE',JSON.stringify({before:wide.a.groundDetail,after:wide.b.groundDetail,draws:wide.b.groundDetailDraws}));
  }
  console.log('GROUND_ATMOSPHERE',JSON.stringify({mobile,warm:r.warm.groundDetail,reused:r.reused.groundDetail,travel:rest.travel.groundDetail,readonly:r.readonly}));expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('real musket hits create brief earth or wet-ground effects, wind advects powder smoke, hidden hits and melee do not',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 try{
  const page=await context.newPage(),errors=await open(page);
  const r=await page.evaluate(()=>{
   __WEATHER_V1__.setWetness(0);camera.x=3950;camera.y=1800;camera.zoom=1.8;
   const u=createUnit('france','infantry',3900,1800),e=createUnit('britain','infantry',4000,1800);
   for(const a of[u,e]){a.hp=a.maxHp=10000;a.reload=100;a.targetX=a.x;a.targetY=a.y;}
   atmoFrame();u.reload=0;fire(u,e);u.reload=100;atmoFrame();const first=__ISO_VIEW_V1__.atmosphere().smoke[0];
   let dry=null;for(let i=0;i<100;i++){RTS_SIM.step(1/60);atmoFrame();const hit=__ISO_VIEW_V1__.atmosphere().hits.at(-1);if(hit){dry=hit;break;}}
   const drift=__ISO_VIEW_V1__.atmosphere().smoke[0],hp=e.hp;
   window.__dustActors={u,e};return{first,drift,dry,hp,wind:__MAP_AMBIENT_MOTION_V1__.currentWind()};
  });
  expect(r.hp).toBeLessThan(10000);expect(r.dry?.wet).toBe(false);expect(r.drift.driftX).toBeGreaterThan(0);expect(r.drift.driftY).toBeLessThan(0);expect(r.drift.radius).toBeGreaterThan(r.first.radius);
  await page.screenshot({path:test.info().outputPath('powder-smoke-and-hit-mobile.png')});
  const rest=await page.evaluate(()=>{
   const{u,e}=__dustActors;atmoFrame(800);__WEATHER_V1__.setWetness(1);
   const random=Math.random;Math.random=()=>.99;u.reload=0;try{fire(u,e);}finally{Math.random=random;}u.reload=100;atmoFrame();
   let wet=null;for(let i=0;i<100;i++){RTS_SIM.step(1/60);atmoFrame();wet=__ISO_VIEW_V1__.atmosphere().hits.at(-1);if(wet)break;}
   atmoFrame(1000);const expired=__ISO_VIEW_V1__.atmosphere().hits.length;
   const hidden=createUnit('britain','infantry',7800,4500);atmoFrame();const hiddenVisible=isVisibleToFrance(hidden);applyDamage(hidden,2,0);atmoFrame();const hiddenDust=__ISO_VIEW_V1__.atmosphere().hits.length;
   const a=createUnit('france','infantry',3900,1950),b=createUnit('britain','infantry',3914,1950);
   for(const q of[a,b]){q.hp=q.maxHp=10000;q.reload=100;q.attackMode='bayonet';q.targetX=q.x;q.targetY=q.y;}
   atmoFrame();const balls=projectiles.length;fire(a,b);atmoFrame();
   const meleeDust=__ISO_VIEW_V1__.atmosphere().hits.length,noBall=projectiles.length===balls;
   atmoFrame(10000);const faded=__ISO_VIEW_V1__.stats();resetGame();const reset=__ISO_VIEW_V1__.stats();
   return{wet,expired,hiddenVisible,hiddenDust,meleeDust,noBall,fadedSmoke:faded.smoke,resetSmoke:reset.smoke,resetDust:reset.hitDust};
  });
  expect(rest.wet?.wet).toBe(true);expect(rest.expired).toBe(0);expect(rest.hiddenVisible).toBe(false);expect(rest.hiddenDust).toBe(0);expect(rest.meleeDust).toBe(0);expect(rest.noBall).toBe(true);
  expect(rest.fadedSmoke).toBe(0);expect(rest.resetSmoke).toBe(0);expect(rest.resetDust).toBe(0);
  console.log('POWDER_AND_HITS',JSON.stringify({r,rest}));expect(errors).toEqual([]);
 }finally{await context.close();}
});
