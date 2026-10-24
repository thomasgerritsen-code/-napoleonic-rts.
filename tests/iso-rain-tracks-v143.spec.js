const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
let context,page,errors;
test.beforeEach(async({browser})=>{
 context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.rainClock=10000;window.runRainRAF=true;performance.now=()=>rainClock;
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(runRainRAF)fn(rainClock);});
 });
 await page.goto('/?view=iso&test=rain-tracks');
 await page.waitForFunction(()=>window.__WEATHER_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready&&window.__ISO_VIEW_V1__.stats().assets.background===0);
 await page.evaluate(()=>{
  window.runRainRAF=false;
  window.rainFrame=()=>{rainClock+=100;window.renderStableFrameV1(()=>{},rainClock);return window.__ISO_VIEW_V1__.stats();};
 });
});
test.afterEach(async()=>{try{expect(errors).toEqual([]);}finally{await context?.close();}});

test('a natural rain shower arrives, wets the field and then fades into a dry spell on mobile',async()=>{
 const r=await page.evaluate(()=>{
  window.__RTS_DEBUG__.tick(81);const cloudy=window.__WEATHER_V1__.state();
  window.__RTS_DEBUG__.tick(49);const rainy=window.__WEATHER_V1__.state(),view=rainFrame();
  const label=document.getElementById('weather-indicator').textContent;
  window.__RTS_DEBUG__.tick(Math.ceil(rainy.until)-elapsed+20);
  return{cloudy,rainy,view,label,after:window.__WEATHER_V1__.state(),afterView:rainFrame(),budget:window.__MOBILE_RENDER_BUDGET_V1__.state()};
 });
 expect(r.cloudy.kind).toBe('overcast');expect(r.rainy.kind).toBe('rain');expect(r.rainy.rain).toBeGreaterThan(.99);
 expect(r.rainy.wetness).toBeGreaterThan(.2);expect(r.view.rainDrops).toBeGreaterThan(0);expect(r.label).toContain('Regen');
 expect(r.after.kind).toBe('overcast');expect(r.after.rain).toBe(0);expect(r.after.wetness).toBeGreaterThan(.3);
 expect(r.afterView.rainDrops).toBe(0);expect(r.view.gpu.active).toBe(false);expect(r.budget.renderDpr).toBe(1.5);
});

test('moving soldiers and horses leave distinct visible tracks that persist after rain and fade away',async()=>{
 const r=await page.evaluate(()=>{
  const W=window.__WEATHER_V1__;W.set('rain',999);W.setWetness(1);window.__RTS_DEBUG__.tick(15);
  const men=[createUnit('france','infantry',950,1300),createUnit('france','cavalry',950,1380),createUnit('france','officer',950,1460)];
  window.__TROOPS_V1__.applyTroop(men[2],'mounted');
  camera.x=1100;camera.y=1380;camera.zoom=1.6;rainFrame();
  for(const u of men){u.targetX=1250;u.targetY=u.y;}
  for(let i=0;i<55;i++){window.__RTS_DEBUG__.tick(.1);rainFrame();}
  const iso=window.__ISO_VIEW_V1__,marks=iso.tracks(),view=rainFrame();
  const image=document.getElementById('game').toDataURL();
  const counts=men.map(u=>({id:u.id,kind:marks.filter(t=>t.unitId===u.id).map(t=>t.kind),steps:marks.filter(t=>t.unitId===u.id).map(t=>t.step)}));
  const emitted=iso.stats().wetTracks.emitted;for(let i=0;i<10;i++)rainFrame();
  const stationary=iso.stats().wetTracks.emitted,reused=iso.stats().trackCacheReuses;
  const cached=iso.stats().trackCacheBuilds;camera.x+=30;const pan=rainFrame();camera.zoom+=.1;const zoom=rainFrame();
  elapsed+=100;const aged=rainFrame();
  W.set('clear',999);window.__RTS_DEBUG__.tick(20);const afterRain=rainFrame(),wetness=W.state().wetness;
  elapsed+=260;W.setWetness(0);const faded=rainFrame();
  return{counts,view,emitted,stationary,afterRain,wetness,faded,image,reused,cached,pan,zoom,aged};
 });
 const imagePath=test.info().outputPath('regen-en-sporen.png');
 require('node:fs').writeFileSync(imagePath,Buffer.from(r.image.split(',')[1],'base64'));
 await test.info().attach('regen-en-sporen',{path:imagePath,contentType:'image/png'});
 expect(r.counts[0].kind.length).toBeGreaterThan(3);expect(r.counts[0].kind.every(k=>k==='boot')).toBe(true);
 expect(new Set(r.counts[0].steps).size).toBe(2);
 for(const c of r.counts.slice(1)){expect(c.kind.length).toBeGreaterThan(1);expect(c.kind.every(k=>k==='hoof')).toBe(true);}
 expect(r.view.tracks).toBeGreaterThan(8);expect(r.view.trackDrawCalls).toBeGreaterThan(0);expect(r.view.trackDrawCalls).toBeLessThanOrEqual(15);
 expect(r.reused).toBeGreaterThanOrEqual(10);
 expect(r.pan.trackCacheBuilds).toBe(r.cached+1);expect(r.zoom.trackCacheBuilds).toBe(r.pan.trackCacheBuilds+1);
 expect(r.aged.trackCacheBuilds).toBe(r.zoom.trackCacheBuilds+1);
 expect(r.stationary).toBe(r.emitted);expect(r.afterRain.rainDrops).toBe(0);expect(r.afterRain.tracks).toBeGreaterThan(0);expect(r.wetness).toBeGreaterThan(.5);
 expect(r.faded.tracks).toBe(0);expect(r.faded.wetTracks.count).toBe(0);
});

test('unknown enemy movement and soldiers crossing a bridge create no muddy ground tracks',async()=>{
 const r=await page.evaluate(()=>{
  window.__WEATHER_V1__.setWetness(1);
  const enemy=createUnit('britain','infantry',7000,4500);camera.x=enemy.x;camera.y=enemy.y;camera.zoom=1;
  const visible=isVisibleToFrance(enemy);rainFrame();
  for(let i=0;i<10;i++){enemy.x+=15;window.__VISION_EPOCH__=(window.__VISION_EPOCH__||0)+1;rainFrame();}
  const unknown=window.__ISO_VIEW_V1__.tracks().filter(t=>t.unitId===enemy.id).length;
  const bridge=WATER_CROSSINGS_V067.find(b=>b.material==='stone'),u=createUnit('france','infantry',bridge.x,bridge.y);
  camera.x=u.x;camera.y=u.y;rainFrame();let deckSamples=0;
  for(let i=0;i<10;i++){
   u.x=bridge.x+(i%2?6:-6);u.y=bridge.y;
   if(window.__ISO_VIEW_V1__.deckAt(u.x,u.y))deckSamples++;rainFrame();
  }
  return{visible,unknown,deckSamples,bridge:window.__ISO_VIEW_V1__.tracks().filter(t=>t.unitId===u.id).length};
 });
 expect(r.visible).toBe(false);expect(r.unknown).toBe(0);expect(r.deckSamples).toBe(10);expect(r.bridge).toBe(0);
});

test('a large marching army keeps trail storage and draw calls bounded; a new battle clears it',async()=>{
 const r=await page.evaluate(()=>{
  window.__WEATHER_V1__.setWetness(1);const cavalry=[];
  for(let i=0;i<180;i++)cavalry.push(createUnit('france','cavalry',1000+(i%20)*12,1200+Math.floor(i/20)*24));
  camera.x=1150;camera.y=1300;camera.zoom=.65;rainFrame();let maxDrawCalls=0;
  for(let i=0;i<22;i++){
   for(const u of cavalry)u.x+=27;
   camera.x+=27;const s=rainFrame();maxDrawCalls=Math.max(maxDrawCalls,s.trackDrawCalls);
  }
  const before=window.__ISO_VIEW_V1__.stats();resetGame();const reset=window.__ISO_VIEW_V1__.stats();
  return{before,maxDrawCalls,reset,weather:window.__WEATHER_V1__.state()};
 });
 expect(r.before.wetTracks.count).toBe(2600);expect(r.before.wetTracks.emitted).toBeGreaterThan(2600);expect(r.before.tracks).toBeGreaterThan(100);
 expect(r.maxDrawCalls).toBeLessThanOrEqual(15);expect(r.reset.wetTracks.count).toBe(0);expect(r.reset.tracks).toBe(0);
 expect(r.weather.kind).toBe('clear');expect(r.weather.wetness).toBe(0);expect(r.weather.nextRainAt).toBe(105);
});
