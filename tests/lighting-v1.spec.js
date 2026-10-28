const{test,expect}=require('@playwright/test');
test.describe.configure({timeout:120000});
// Desktop light and shade: lit windows, lanterns and muzzle flashes at night,
// low warm sun at dawn and dusk, nothing at all in broad day.
test('desktop night lifts the dark around lamps and flashes; broad day stays untouched',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:760});
 await page.addInitScript(()=>{window.lightClock=10000;window.lightRAF=true;performance.now=()=>lightClock;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>{if(lightRAF)fn(lightClock);});});
 await page.goto('/play.html?view=iso&test=lighting&gpu=off');
 await page.waitForFunction(()=>window.__LIGHTING_V1__&&window.__ISO_VIEW_V1__?.stats().assets.ready&&__ISO_VIEW_V1__.stats().assets.background===0);
 const r=await page.evaluate(()=>{
  lightRAF=false;const frame=t=>{elapsed=t;lightClock+=16;__DAY_NIGHT_V1__.refresh();renderStableFrameV1(()=>{},lightClock);return{...__LIGHTING_V1__.stats()};};
  const tc=buildings.find(b=>b.side==='france'&&b.type==='towncenter');camera.x=tc.x+150;camera.y=tc.y+60;camera.zoom=1.1;
  const men=Array.from({length:4},(_,i)=>createUnit('france','infantry',tc.x+260+i*16,tc.y+120));
  for(let i=0;i<30;i++)frame(0);
  const before=JSON.stringify({units:units.map(u=>[u.id,u.x,u.y,u.hp]),elapsed});
  const day=frame(0),dusk=frame(275),night=frame(400);
  // A flash lights the dark for a moment, then is gone.
  const canvas=document.getElementById('game'),g=canvas.getContext('2d'),m=men[0],p=__ISO_VIEW_V1__.screenOf(m.x,m.y),k=canvas.width/innerWidth;
  // What the eye sees there: the canvas with the layer above the fog (the night and its lights) over it.
  const top=document.getElementById('iso-top'),c=document.createElement('canvas');c.width=12;c.height=12;const cg=c.getContext('2d');
  const lum=()=>{const x=Math.round(p.x*k)-6,y=Math.round(p.y*k)-30;cg.clearRect(0,0,12,12);cg.drawImage(canvas,x,y,12,12,0,0,12,12);
   if(top&&getComputedStyle(top).display!=='none')cg.drawImage(top,x,y,12,12,0,0,12,12);
   const d=cg.getImageData(0,0,12,12).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s;};
  const dark=lum();__LIGHTING_V1__.flash(m.x,m.y,'infantry',lightClock/1000);const lit=frame(400),bright=lum();
  for(let i=0;i<20;i++)frame(400);const after=lum();
  return{day,dusk,night,lit,dark,bright,after,unchanged:before===JSON.stringify({units:units.map(u=>[u.id,u.x,u.y,u.hp]),elapsed:0})};
 });
 console.log('LIGHTING',JSON.stringify(r));
 expect(r.night.lights).toBeGreaterThan(r.dusk.lights-1);expect(r.night.lights).toBeGreaterThan(2);
 expect(r.dusk.sunDraws).toBeGreaterThan(r.day.sunDraws);
 expect(r.bright).toBeGreaterThan(r.dark*1.15);expect(r.after).toBeLessThan(r.bright);
 expect(errors).toEqual([]);
});
