const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
let context,page,errors;
test.beforeEach(async({browser})=>{
 context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.renderClock=10000;window.runRenderRAF=true;performance.now=()=>window.renderClock;
  const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>raf(()=>{if(window.runRenderRAF)fn(window.renderClock);});
 });
 await page.goto('/?view=iso&test=render-reuse');
 await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready&&window.__ISO_VIEW_V1__.stats().assets.background===0);
 await page.evaluate(()=>{
  window.runRenderRAF=false;
  window.renderFrames=(n=1)=>{for(let i=0;i<n;i++){window.renderClock+=400;window.renderStableFrameV1(()=>{},renderClock);}return window.__ISO_VIEW_V1__.stats();};
  renderFrames(4);
 });
});
test.afterEach(async()=>{try{expect(errors).toEqual([]);}finally{await context?.close();}});

test('idle fog geometry is reused while animated clouds keep updating',async()=>{
 const r=await page.evaluate(()=>{const before=renderFrames(2),after=renderFrames(6);return{before,after};});
 expect(r.after.fogSeenBuilds).toBe(r.before.fogSeenBuilds);
 expect(r.after.fogSightBuilds).toBe(r.before.fogSightBuilds);
 expect(r.after.fogGeometryReuses-r.before.fogGeometryReuses).toBe(12);
 expect(r.after.cloudBuilds-r.before.cloudBuilds).toBe(6);
 expect(r.after.gpu.active).toBe(false);expect(r.after.sharpSheets).toBe(0);
});

test('moving sources, changed sight radius and source removal invalidate only current sight',async()=>{
 const r=await page.evaluate(()=>{
  // Armies start with workers only: post a soldier at the French headquarters if needed.
  const hq=buildings.find(b=>!b.dead&&b.side==='france'&&b.type==='towncenter');
  const man=units.find(u=>!u.dead&&u.side==='france'&&u.type==='infantry')||createUnit('france','infantry',hq.x+hq.w/2+60,hq.y);
  camera.x=man.x;camera.y=man.y;const before=renderFrames(2);
  man.x+=7;const moved=renderFrames();
  man.type='cavalry';window.__VISION_EPOCH__=(window.__VISION_EPOCH__||0)+1;const radius=renderFrames();
  man.dead=true;const dead=renderFrames();return{before,moved,radius,dead};
 });
 for(const [a,b] of [[r.before,r.moved],[r.moved,r.radius],[r.radius,r.dead]]){
  expect(b.fogSightBuilds).toBe(a.fogSightBuilds+1);expect(b.fogSeenBuilds).toBe(a.fogSeenBuilds);
 }
 expect(r.dead.fogSources).toBe(r.radius.fogSources-1);
});

test('explored membership changes invalidate the mask even when the set size stays equal',async()=>{
 const r=await page.evaluate(()=>{
  const x=Math.floor(camera.x/EXPLORE_CELL),y=Math.floor(camera.y/EXPLORE_CELL),a=`${x},${y}`,b=`${x+1},${y}`;
  exploredCells.add(a);exploredCells.delete(b);const before=renderFrames(2),size=exploredCells.size;
  exploredCells.delete(a);exploredCells.add(b);const after=renderFrames();
  return{before,after,size,afterSize:exploredCells.size};
 });
 expect(r.afterSize).toBe(r.size);expect(r.after.fogSeenBuilds).toBe(r.before.fogSeenBuilds+1);
 expect(r.after.fogSightBuilds).toBe(r.before.fogSightBuilds);
});

test('panning, zoom, orientation and reset refresh fog geometry and keep input projection current',async()=>{
 const r=await page.evaluate(()=>{
  const before=renderFrames(2);
  for(let i=0;i<6;i++){camera.x+=10;renderFrames();}
  const panning=window.__ISO_VIEW_V1__.stats(),stopped=renderFrames(3);
  camera.zoom+=.1;const zoom=renderFrames(3);return{before,panning,stopped,zoom};
 });
 expect(r.panning.fogSeenBuilds).toBe(r.before.fogSeenBuilds+6);
 expect(r.panning.fogSightBuilds).toBe(r.before.fogSightBuilds+6);
 expect(r.stopped.fogSeenBuilds).toBe(r.panning.fogSeenBuilds);
 expect(r.stopped.fogSightBuilds).toBe(r.panning.fogSightBuilds);
 expect(r.zoom.fogSeenBuilds).toBe(r.stopped.fogSeenBuilds+1);
 expect(r.zoom.fogSightBuilds).toBe(r.stopped.fogSightBuilds+1);
 let before=r.zoom;
 for(const viewport of [{width:390,height:844},{width:391,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  const resized=await page.evaluate(()=>{const p=screenToWorld(150,300),s=worldToScreen(p.x,p.y);return{...renderFrames(3),error:Math.hypot(s.x-150,s.y-300)};});
  expect(resized.error).toBeLessThan(.5);
  expect(resized.fogSeenBuilds).toBe(before.fogSeenBuilds+1);
  expect(resized.fogSightBuilds).toBe(before.fogSightBuilds+1);
  expect(resized.fogGeometryPoints).toBe(resized.fogCells+resized.fogSources);
  before=resized;
 }
 const reset=await page.evaluate(()=>{resetGame();return window.__ISO_VIEW_V1__.stats();});
 expect(reset.fogGeometryPoints).toBe(0);
 const fresh=await page.evaluate(()=>renderFrames(3));
 expect(fresh.fogGeometryPoints).toBeGreaterThan(0);
 expect(fresh.fogSeenBuilds).toBe(before.fogSeenBuilds+1);
 expect(fresh.fogSightBuilds).toBe(before.fogSightBuilds+1);
});
