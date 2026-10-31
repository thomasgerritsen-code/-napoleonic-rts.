const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test.describe.configure({timeout:120000});
async function open(browser,viewport={width:844,height:390},mobile=true,query=''){
 const context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.lightClock=10000;window.lightRAF=true;performance.now=()=>lightClock;
  const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(lightRAF)fn(lightClock);});
 });
 await page.goto('/?view=iso&test=day-night'+query);
 await page.waitForFunction(full=>window.__DAY_NIGHT_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready&&(!full||window.__ISO_VIEW_V1__.stats().assets.background===0),!query.includes('gpu=on'));
 await page.evaluate(warmFrames=>{
  window.lightRAF=false;
  if(window.__SEASONS_V1__){const S=window.__SEASONS_V1__;window.__SEASONS_V1__={...S,state:()=>S.at(0)};}
  window.lightFrame=(time=elapsed)=>{elapsed=time;window.__DAY_NIGHT_V1__.refresh();window.renderStableFrameV1(()=>{},lightClock);return window.__ISO_VIEW_V1__.stats();};
  for(let i=0;i<warmFrames;i++)lightFrame();
 },query.includes('gpu=on')?12:120);
 return{context,page,errors};
}
async function attach(name,data){const path=test.info().outputPath(name+'.png');fs.writeFileSync(path,Buffer.from(data.split(',')[1],'base64'));await test.info().attach(name,{path,contentType:'image/png'});}

test('mobile night is exactly one readable colour layer; dawn/day return without changing the battle',async({browser})=>{
 const {context,page,errors}=await open(browser);
 try{
  const r=await page.evaluate(async()=>{
   const canvas=document.getElementById('game'),api=window.__DAY_NIGHT_V1__;
   const battle=()=>JSON.stringify({men:units.map(u=>[u.id,u.type,u.x,u.y,u.hp,u.dead,u.targetX,u.targetY]),buildings:buildings.map(b=>[b.id,b.x,b.y,b.hp,b.dead])});
   const before=battle(),weather=JSON.stringify(window.__WEATHER_V1__.state());
   const probe=units.find(u=>u.side==='france'&&!u.dead),sight=visionRadius(probe);
   const hud=()=>({color:getComputedStyle(document.querySelector('.topbar')).color,background:getComputedStyle(document.querySelector('.topbar')).backgroundColor});
   const hudBefore=hud(),day=lightFrame(0),dayPNG=canvas.toDataURL();
   const dusk=lightFrame(262.5),duskPNG=canvas.toDataURL();
   const night=lightFrame(400),nightPNG=canvas.toDataURL(),nightState=api.state(),nightGrade=window.__ISO_VIEW_V1__.grade().night;
   const dayGrade=(lightFrame(0),window.__ISO_VIEW_V1__.grade().night);
   const dawn=lightFrame(562.5),returnDay=lightFrame(600),returnPNG=canvas.toDataURL(),returnGrade=window.__ISO_VIEW_V1__.grade().night;
   async function pixels(image){const im=new Image();im.src=image;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return{c,ctx};}
   const a=await pixels(dayPNG),b=await pixels(nightPNG),c=await pixels(returnPNG);
   // The night is one colour layer over the canvas: the canvas itself is the
   // day's, and canvas + layer is the day with the night tint over it.
   const nightCanvas=b.ctx.getImageData(0,0,b.c.width,b.c.height).data,dayCanvas=a.ctx.getImageData(0,0,a.c.width,a.c.height).data;
   let canvasChanged=0;for(let i=0;i<dayCanvas.length;i++)if(dayCanvas[i]!==nightCanvas[i])canvasChanged++;
   const nums=t=>(t.match(/[\d.]+/g)||[]).map(Number),tintNums=nums(nightState.tint),gradeNums=nums(nightGrade);
   const sameColour=tintNums.length===gradeNums.length&&tintNums.every((v,i)=>Math.abs(v-gradeNums[i])<=.0005);
   a.ctx.fillStyle=nightGrade;a.ctx.fillRect(0,0,a.c.width,a.c.height);
   b.ctx.fillStyle=nightGrade;b.ctx.fillRect(0,0,b.c.width,b.c.height);
   const expected=a.ctx.getImageData(0,0,a.c.width,a.c.height).data,actual=b.ctx.getImageData(0,0,b.c.width,b.c.height).data;
   let changed=0,max=0;for(let i=0;i<expected.length;i++){const d=Math.abs(expected[i]-actual[i]);if(d)changed++;max=Math.max(max,d);}
   const original=await pixels(dayPNG),p=original.ctx.getImageData(0,0,original.c.width,original.c.height).data,q=c.ctx.getImageData(0,0,c.c.width,c.c.height).data;
   let returnedChanges=0,dayLight=0,nightLight=0;
   for(let i=0;i<p.length;i+=4){if(p[i]!==q[i]||p[i+1]!==q[i+1]||p[i+2]!==q[i+2])returnedChanges++;dayLight+=p[i]+p[i+1]+p[i+2];nightLight+=actual[i]+actual[i+1]+actual[i+2];}
   return{day,dusk,night,dawn,returnDay,dayPNG,duskPNG,nightPNG,changed,max,returnedChanges,canvasChanged,sameColour,dayGrade,returnGrade,brightness:nightLight/dayLight,
    sameBattle:before===battle(),sameWeather:weather===JSON.stringify(window.__WEATHER_V1__.state()),sameSight:sight===visionRadius(probe),hudBefore,hudAfter:hud()};
  });
  for(const [name,png] of [['dag',r.dayPNG],['avond',r.duskPNG],['nacht',r.nightPNG]])await attach(name,png);
  expect(r.changed).toBe(0);expect(r.max).toBe(0);expect(r.returnedChanges).toBe(0);
  expect(r.canvasChanged).toBe(0);expect(r.sameColour).toBe(true);expect(r.dayGrade).toBe('');expect(r.returnGrade).toBe('');
  expect(r.day.dayNightDraws).toBe(0);expect(r.dusk.dayNightDraws).toBe(1);expect(r.night.dayNightDraws).toBe(1);expect(r.dawn.dayNightDraws).toBe(1);expect(r.returnDay.dayNightDraws).toBe(0);
  expect(r.brightness).toBeGreaterThan(.6);expect(r.brightness).toBeLessThan(.9);
  expect(r.sameBattle).toBe(true);expect(r.sameWeather).toBe(true);expect(r.sameSight).toBe(true);expect(r.hudAfter).toEqual(r.hudBefore);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('the phone clock fits portrait, landscape and the open menu without covering controls',async({browser})=>{
 const {context,page,errors}=await open(browser,{width:390,height:844});
 try{
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>lightFrame(400));
   const boxes=await page.evaluate(()=>{
    const b=document.getElementById('day-night-indicator'),r=b.getBoundingClientRect(),o=document.getElementById('isoOverviewToggle').getBoundingClientRect();
    return{parent:b.parentElement.tagName,box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},overlap:r.left<o.right&&r.right>o.left&&r.top<o.bottom&&r.bottom>o.top,text:b.textContent,pointer:getComputedStyle(b).pointerEvents,budget:window.__MOBILE_RENDER_BUDGET_V1__.state()};
   });
   expect(boxes.parent).toBe('BODY');expect(boxes.box.left).toBeGreaterThanOrEqual(0);expect(boxes.box.right).toBeLessThanOrEqual(viewport.width);expect(boxes.overlap).toBe(false);
   expect(boxes.text).toContain('Nacht 00:00');expect(boxes.pointer).toBe('none');expect(boxes.budget.renderDpr).toBe(1.5);
  }
  await page.locator('#mobileMenuBtn').click();
  const menu=await page.evaluate(()=>{
   const b=document.getElementById('day-night-indicator').getBoundingClientRect(),o=document.getElementById('isoOverviewToggle').getBoundingClientRect(),r=document.getElementById('resetBtn').getBoundingClientRect();
   return{badgeTop:b.top,overviewBottom:o.bottom,resetTarget:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id};
  });
  expect(menu.badgeTop).toBeGreaterThan(menu.overviewBottom);expect(menu.resetTarget).toBe('resetBtn');expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('desktop clock follows simulation time, stays still between ticks and resets to morning',async({browser})=>{
 const {context,page,errors}=await open(browser,{width:1440,height:1000},false);
 try{
  const r=await page.evaluate(()=>{
   const b=document.getElementById('day-night-indicator'),first=b.textContent;for(let i=0;i<10;i++)lightFrame();const paused=b.textContent;
   window.__RTS_DEBUG__.tick(1);window.__DAY_NIGHT_V1__.refresh();const advanced=b.textContent;
   lightFrame(400);return{parent:b.parentElement.className,first,paused,advanced,night:b.textContent,info:b.getAttribute('aria-label')};
  });
  expect(r.parent).toBe('brand');expect(r.first).toContain('08:00');expect(r.paused).toBe(r.first);expect(r.advanced).toContain('08:02');expect(r.night).toContain('Nacht 00:00');expect(r.info).toContain('Dag 2');
  await page.getByRole('button',{name:'Nieuwe slag',exact:true}).click();await page.evaluate(()=>lightFrame());
  await expect(page.locator('#day-night-indicator')).toContainText('Dag 08:00');
  expect(await page.evaluate(()=>window.__DAY_NIGHT_V1__.state().day)).toBe(1);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('soldiers can be selected and ordered to march at night',async({browser})=>{
 const {context,page,errors}=await open(browser);
 try{
  // Armies start with workers only: raise a few soldiers in view first.
  await page.evaluate(()=>{for(let i=0;i<4;i++)createUnit('france','infantry',camera.x-40+i*26,camera.y);lightFrame(400);});
  const body=await page.evaluate(()=>{for(const u of units){if(u.dead||u.side!=='france'||u.type!=='infantry')continue;const p=window.__ISO_VIEW_V1__.bodyOf(u);if(document.elementFromPoint(p.x,p.y)?.id==='game')return{...p,id:u.id};}return null;});
  expect(body).not.toBeNull();await page.mouse.click(body.x,body.y);
  const r=await page.evaluate(id=>{
   const u=units.find(u=>u.id===id),selected=selectedUnits.has(u),before={x:u.x,y:u.y};
   issueMoveWithFacingV06(u.x+120,u.y,.2);window.__RTS_DEBUG__.tick(2);lightFrame();
   return{selected,moved:Math.hypot(u.x-before.x,u.y-before.y),phase:window.__DAY_NIGHT_V1__.state().phase};
  },body.id);
  expect(r.selected).toBe(true);expect(r.moved).toBeGreaterThan(5);expect(r.phase).toBe('night');expect(errors).toEqual([]);
 }finally{await context.close();}
});

for(const gpu of [false,true])test(`night combines with rain and wet tracks on ${gpu?'desktop GPU':'mobile Canvas'}`,async({browser})=>{
  const {context,page,errors}=await open(browser,gpu?{width:1440,height:1000}:{width:844,height:390},!gpu,gpu?'&gpu=on':'');
  try{
   const r=await page.evaluate(()=>{
    window.__WEATHER_V1__.set('rain',999);window.__WEATHER_V1__.setWetness(1);window.__RTS_DEBUG__.tick(15);elapsed=400;
    const u=createUnit('france','infantry',1000,1300);camera.x=1100;camera.y=1300;camera.zoom=1.3;lightFrame();
    for(let i=0;i<12;i++){u.x+=13.5;lightClock+=100;lightFrame();}
    return lightFrame();
   });
   expect(r.dayNight.phase).toBe('night');expect(r.dayNightDraws).toBe(1);expect(r.rainDrops).toBeGreaterThan(0);expect(r.tracks).toBeGreaterThan(0);expect(r.trackDrawCalls).toBeLessThanOrEqual(15);
   expect(r.gpu.active).toBe(gpu);expect(r.gpu.lastError).toBeNull();expect(errors).toEqual([]);
  }finally{await context.close();}
});
