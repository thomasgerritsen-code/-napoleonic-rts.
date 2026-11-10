const {test,expect}=require('@playwright/test'),fs=require('node:fs');
test.describe.configure({timeout:120000});
async function open(browser,{mobile=true,viewport={width:844,height:390},gpu=false,fixedLight=true}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.seasonClock=10000;window.seasonRAF=true;performance.now=()=>seasonClock;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(seasonRAF)fn(seasonClock);});});
 await page.goto('/?view=iso&test=seasons'+(gpu?'&gpu=on':''));
 await page.waitForFunction(full=>window.__SEASONS_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready&&(!full||window.__ISO_VIEW_V1__.stats().assets.background===0),!gpu);
 await page.evaluate(fixed=>{
  window.seasonRAF=false;if(fixed){const D=window.__DAY_NIGHT_V1__;window.__DAY_NIGHT_V1__={...D,state:()=>D.at(0)};}
  window.seasonFrame=(time=elapsed)=>{elapsed=time;window.__DAY_NIGHT_V1__.refresh();window.renderStableFrameV1(()=>{},seasonClock);return window.__ISO_VIEW_V1__.stats();};
 },fixedLight);return{context,page,errors};
}
async function attach(name,data){const p=test.info().outputPath(name+'.png');fs.writeFileSync(p,Buffer.from(data.split(',')[1],'base64'));await test.info().attach(name,{path:p,contentType:'image/png'});}

test('four distinct seasons return to the original spring without altering the battle or weather',async({browser})=>{
 const {context,page,errors}=await open(browser);try{
  const r=await page.evaluate(()=>{
   const battle=()=>JSON.stringify({units:units.map(u=>[u.id,u.type,u.x,u.y,u.hp,u.dead]),buildings:buildings.map(b=>[b.id,b.x,b.y,b.hp,b.dead]),resources:resources.map(r=>[r.id,r.x,r.y,r.amount])});
   const before=battle(),weather=JSON.stringify(window.__WEATHER_V1__.state()),images=[],states=[];
   for(const t of [0,240,480,720,960]){
    for(let i=0;i<120;i++)seasonFrame(t);const s=seasonFrame();
    images.push(document.getElementById('game').toDataURL());states.push(s);
   }
   const firstCreated=window.__SEASONAL_PROPS_V1__.stats().created;
   for(const t of [1440,1680,1920])for(let i=0;i<30;i++)seasonFrame(t);
   return{images,states,firstCreated,afterYears:window.__SEASONAL_PROPS_V1__.stats(),sameBattle:battle()===before,sameWeather:JSON.stringify(window.__WEATHER_V1__.state())===weather};
  });
  for(let i=0;i<4;i++)await attach(['lente','zomer','herfst','winter'][i],r.images[i]);
  expect(r.images[0]).toBe(r.images[4]);expect(new Set(r.images.slice(0,4)).size).toBe(4);expect(r.sameBattle).toBe(true);expect(r.sameWeather).toBe(true);
  expect(r.states.map(s=>s.seasons.key)).toEqual(['spring','summer','autumn','winter','spring']);
  expect(r.states[0].seasonGroundDraws).toBe(0);expect(r.states[3].seasonGroundDraws).toBe(1);
  for(const s of r.states){expect(s.seasonalProps.bytes).toBeLessThanOrEqual(s.seasonalProps.budget);expect(s.seasonalProps.maxCreatedPerFrame).toBeLessThanOrEqual(1);expect(s.seasonalProps.failures).toBe(0);expect(s.gpu.active).toBe(false);}
  expect(r.states[3].seasonalProps.created).toBeGreaterThan(0);expect(r.afterYears.created).toBe(r.firstCreated);expect(r.afterYears.bytes).toBeLessThanOrEqual(r.afterYears.budget);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('winter showers produce bounded snowflakes and soldiers leave tracks even on dry snow',async({browser})=>{
 const {context,page,errors}=await open(browser);try{
  const r=await page.evaluate(()=>{
   elapsed=720;const W=window.__WEATHER_V1__;W.set('rain',999);W.setWetness(1);window.__RTS_DEBUG__.tick(15);
   camera.x=1100;camera.y=1380;camera.zoom=1.4;
   const u=createUnit('france','infantry',1000,1300),horse=createUnit('france','cavalry',1000,1400);
   seasonFrame();for(let i=0;i<15;i++){u.x+=13.5;horse.x+=27;seasonClock+=100;seasonFrame();}
   const snow=seasonFrame(),label=document.getElementById('weather-indicator').title,marks=window.__ISO_VIEW_V1__.tracks();
   W.set('clear',999);W.setWetness(0);window.__RTS_DEBUG__.tick(16);seasonFrame();const emitted=window.__ISO_VIEW_V1__.stats().wetTracks.emitted;
   for(let i=0;i<10;i++){u.x+=13.5;horse.x+=27;seasonFrame();}
   const drySnow=seasonFrame(),image=document.getElementById('game').toDataURL();
   return{snow,label,marks:marks.filter(t=>t.unitId===u.id||t.unitId===horse.id),drySnow,emitted,image};
  });
  await attach('sneeuw-en-sporen',r.image);
  expect(r.snow.rainDrops).toBe(0);expect(r.snow.snowFlakes).toBeGreaterThan(0);expect(r.snow.precipitationParticles).toBe(r.snow.snowFlakes);
  expect(r.snow.precipitationParticles).toBeLessThanOrEqual(Math.round(844*390/3600));expect(r.label).toContain('Sneeuw');
  expect(new Set(r.marks.map(m=>m.kind))).toEqual(new Set(['boot','hoof']));
  expect(r.drySnow.snowFlakes).toBe(0);expect(r.drySnow.tracks).toBeGreaterThan(0);expect(r.drySnow.wetTracks.emitted).toBeGreaterThan(r.emitted);expect(r.drySnow.trackDrawCalls).toBeLessThanOrEqual(15);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('the compact season label fits phone orientations and resets along with snow and palette memory',async({browser})=>{
 const {context,page,errors}=await open(browser,{viewport:{width:390,height:844}});try{
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>{for(let i=0;i<25;i++)seasonFrame(720);});
   const r=await page.evaluate(()=>{const b=document.getElementById('day-night-indicator'),a=b.getBoundingClientRect(),o=document.getElementById('isoOverviewToggle').getBoundingClientRect();return{season:b.dataset.season,text:b.textContent,right:a.right,bottom:a.bottom,overlap:a.left<o.right&&a.right>o.left&&a.top<o.bottom&&a.bottom>o.top,budget:window.__MOBILE_RENDER_BUDGET_V1__.state()};});
   expect(r.season).toBe('winter');expect(r.text).toContain('Winter');expect(r.right).toBeLessThanOrEqual(viewport.width);expect(r.overlap).toBe(false);expect(r.budget.renderDpr).toBe(1.5);
  }
  await page.locator('#mobileMenuBtn').click();await page.getByRole('button',{name:'Nieuwe slag',exact:true}).click();
  const reset=await page.evaluate(()=>seasonFrame());expect(reset.seasons.key).toBe('spring');expect(reset.seasons.year).toBe(1);expect(reset.seasonalProps.bytes).toBe(0);expect(reset.wetTracks.count).toBe(0);
  await expect(page.locator('#day-night-indicator')).toContainText('Lente');expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('palette recolouring preserves alpha, trunks and shadows and stays inside a bounded cache',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).pathname==='/play.html'?r.fulfill({contentType:'text/html',body:'<script>window.NRTS_CONFIG={seasons:{paletteBudgetMiB:1}};</script><script src="/src/systems/rendering/seasonal-props-v1.js"></script>'}):r.continue());
 await page.goto('/play.html');
 const r=await page.evaluate(()=>{
  const api=window.__SEASONAL_PROPS_V1__,image=document.createElement('canvas');image.width=6;image.height=1;const c=image.getContext('2d'),data=c.createImageData(6,1);data.data.set([40,100,30,255,100,60,30,255,0,0,0,80,0,0,0,0,100,100,100,255,220,220,220,255]);c.putImageData(data,0,0);
  const original=[...c.getImageData(0,0,6,1).data];api.beginFrame();const autumn=[...api.source(image,'autumn').getContext('2d').getImageData(0,0,6,1).data];
  api.beginFrame();const winter=[...api.source(image,'winter').getContext('2d').getImageData(0,0,6,1).data];
  for(let i=0;i<20;i++){const im=document.createElement('canvas');im.width=im.height=256;api.beginFrame();api.source(im,'winter');api.source(im,'autumn');}
  const full=api.stats();api.reset();return{original,after:[...c.getImageData(0,0,6,1).data],autumn,winter,full,reset:api.stats()};
 });
 expect(r.after).toEqual(r.original);expect(r.autumn[0]).toBeGreaterThan(r.autumn[1]);expect(r.winter[0]).toBeGreaterThan(100);
 for(const p of[r.autumn,r.winter]){for(let i=3;i<24;i+=4)expect(p[i]).toBe(r.original[i]);expect(p.slice(4,12)).toEqual(r.original.slice(4,12));expect(p.slice(16,24)).toEqual(r.original.slice(16,24));}
 expect(r.full.bytes).toBeLessThanOrEqual(r.full.budget);expect(r.full.evicted).toBeGreaterThan(0);expect(r.full.maxCreatedPerFrame).toBe(1);expect(r.reset.bytes).toBe(0);
});

test('winter painting and snowfall combine with real night lighting on the desktop GPU',async({browser})=>{
 const {context,page,errors}=await open(browser,{mobile:false,viewport:{width:1440,height:1000},gpu:true,fixedLight:false});try{
  const r=await page.evaluate(()=>{
   window.__WEATHER_V1__.set('rain',999);window.__WEATHER_V1__.setWetness(1);window.__RTS_DEBUG__.tick(15);elapsed=900;camera.zoom=.9;
   for(let i=0;i<24;i++)seasonFrame();return seasonFrame();
  });
  expect(r.dayNight.phase).toBe('night');expect(r.dayNightDraws).toBe(1);expect(r.seasons.key).toBe('winter');expect(r.gpu.active).toBe(true);expect(r.gpu.lastError).toBeNull();expect(r.snowFlakes).toBeGreaterThan(0);expect(r.seasonalProps.created).toBeGreaterThan(0);expect(r.seasonalProps.bytes).toBeLessThanOrEqual(r.seasonalProps.budget);expect(errors).toEqual([]);
 }finally{await context.close();}
});
