const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
async function open(page,gpu='off'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__NRTS_HUMAN_BRITAIN__=true;window.buildClock=10000;window.buildRAF=true;performance.now=()=>buildClock;
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(buildRAF)fn(buildClock);});
 });
 await page.goto(`/play.html?view=iso&gpu=${gpu}&test=building-art`);await page.waitForFunction(()=>window.__BUILDING_PRESENTATION_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready&&__ISO_VIEW_V1__.stats().assets.background===0);
 await page.evaluate(()=>{buildRAF=false;window.buildFrame=(ms=1000/60)=>{buildClock+=ms;renderStableFrameV1(()=>{},buildClock);return __ISO_VIEW_V1__.stats();};});return errors;
}
for(const gpu of['off','on'])test(`four construction phases and timed builder strokes stay cosmetic on mobile GPU ${gpu}`,async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});try{
  const page=await c.newPage(),errors=await open(page,gpu);
  const scene=await page.evaluate(()=>{
   let p;for(let x=2200;x<3400&&!p;x+=160)for(let y=1700;y<2700&&!p;y+=140)if(validBuildingSpot('house',x,y)&&__UNIT_PLACEMENT__.clear({x,y},'worker')&&!resources.some(r=>!r.dead&&Math.hypot(r.x-x,r.y-y)<200))p={x,y};
   const u=livingUnits('france')[0],b=p&&constructBuilding('france','house',p.x,p.y,[u]);if(!b)throw Error('No construction');
   u.x=b.x;u.y=b.y+Math.max(b.w,b.h)*.7;u.targetX=u.x;u.targetY=u.y;markExploredV06();window.__VISION_EPOCH__=(window.__VISION_EPOCH__||0)+1;
   camera.x=b.x;camera.y=b.y;camera.zoom=2.2;window.buildScene={u,b};
   for(let i=0;i<20;i++)buildFrame();return {id:b.id,unit:u.id};
  });
  const stages=[];
  for(const p of[.1,.34,.68,.9]){
   stages.push(await page.evaluate(p=>{buildScene.b.construction=p;for(let i=0;i<25;i++)buildFrame();return __BUILDING_PRESENTATION_V1__.inspect(buildScene.b);},p));
   await page.screenshot({path:test.info().outputPath(`building-${gpu}-${Math.round(p*100)}.png`)});
  }
  expect(stages.map(s=>s.stage)).toEqual(['foundation','frame','walls','roof']);expect(stages.every(s=>s.builders===1)).toBe(true);
  const r=await page.evaluate(()=>{
   const snapshot=()=>JSON.stringify({units,buildings,economies,elapsed}),before=snapshot(),frames=[],dust=[];
   for(let i=0;i<60;i++){buildFrame();frames.push(__ISO_VIEW_V1__.frameOf(buildScene.u.id)[2]);dust.push(__BUILDING_PRESENTATION_V1__.stats().dustDraws);}
   const readonly=before===snapshot();buildScene.u.task=null;buildScene.u.buildingTarget=null;
   const paused=JSON.stringify(buildScene.b);for(let i=0;i<30;i++)buildFrame();const stopped=__BUILDING_PRESENTATION_V1__.stats();
   buildScene.b.complete=true;buildScene.b.construction=1;buildFrame();const complete=__BUILDING_PRESENTATION_V1__.inspect(buildScene.b),cache=__BUILDING_PRESENTATION_V1__.stats();
   return{readonly,frames:[...new Set(frames)],dust:Math.max(...dust),stopped,still:paused===JSON.stringify({...buildScene.b,complete:false,construction:.9}),complete,cache};
  });
  expect(r.readonly).toBe(true);expect(r.frames.sort()).toEqual([0,1,2,3]);expect(r.dust).toBeGreaterThan(0);expect(r.stopped.builders).toBe(0);expect(r.stopped.dustDraws).toBe(0);expect(r.still).toBe(true);expect(r.complete.stage).toBe('complete');expect(r.cache.bytes).toBeLessThanOrEqual(r.cache.budget);expect(errors).toEqual([]);console.log('BUILDING_MOBILE',gpu,JSON.stringify(r));
 }finally{await c.close();}
});
test('detailed building art is distinct, reused and bounded while panning and resetting',async({page})=>{
 const errors=await open(page,'off');const r=await page.evaluate(()=>{
  const types=['house','stable','foundry','barracks','hospital','tower'],made=[];
  for(const type of types){let b;for(let i=0;i<40&&!b;i++){const p=findBuildLocation('france',type,i);if(p&&validBuildingSpot(type,p.x,p.y))b=createBuilding('france',type,p.x,p.y,true);}if(!b)throw Error('No '+type);made.push(b);}
  for(let pass=0;pass<2;pass++)for(const b of made){camera.x=b.x;camera.y=b.y;camera.zoom=2;for(let i=0;i<12;i++)buildFrame();}
  const warm=__BUILDING_PRESENTATION_V1__.stats();for(let i=0;i<30;i++)buildFrame();const reused=__BUILDING_PRESENTATION_V1__.stats();
  for(let i=0;i<60;i++){camera.x=300+i*479%7300;camera.y=300+i*233%4200;camera.zoom=i%2?1.8:.5;buildFrame();}
  const travel=__BUILDING_PRESENTATION_V1__.stats();resetGame();buildFrame();const reset=__BUILDING_PRESENTATION_V1__.stats();
  return{warm,reused,travel,reset};
 });
 expect(r.warm.builds).toBeGreaterThanOrEqual(4);expect(r.reused.builds).toBe(r.warm.builds);expect(r.reused.hits).toBeGreaterThan(r.warm.hits);expect(r.travel.bytes).toBeLessThanOrEqual(r.travel.budget);expect(r.reset.builders).toBe(0);expect(errors).toEqual([]);console.log('BUILDING_CACHE',JSON.stringify(r));
});
