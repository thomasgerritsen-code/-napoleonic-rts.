const {test,expect}=require('@playwright/test');
async function open(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/graphics-lab/iso.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_ISO__?.getStats().loaded===2);
  return errors;
}
const frames=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
test('v324 iso scene loads both Blender atlases and draws every soldier',async({page})=>{
  const errors=await open(page);
  await frames(page);
  const s=await page.evaluate(()=>({...window.__GRAPHICS_LAB_ISO__.getStats(),version:window.__GRAPHICS_LAB_ISO__.version}));
  expect(s.version).toBe('324.0');
  expect(s.terrain).toBe(true);
  expect(s.props).toBeGreaterThan(30);
  expect(s.propsDrawn).toBe(s.props);
  expect(s.units).toBe(64);
  expect(s.drawn).toBe(64);
  expect(await page.locator('#iso-status').textContent()).toContain('gebouwen en terrein');
  expect(errors).toEqual([]);
});
test('v324 octagon march shows all 8 sprite directions; pause freezes the frame',async({page})=>{
  const errors=await open(page);
  const seen=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(r=>requestAnimationFrame(r));
    api.state.paused=true;
    for(let d=0;d<api.getStats().perimeter;d+=2){api.state.travelled=d;await step();}
    return api.getStats().directionsSeen;
  });
  expect(seen).toBe(8);
  const hash=()=>page.evaluate(()=>{const c=document.getElementById('iso-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let h=0;for(let i=0;i<d.length;i+=101)h=(h*31+d[i])>>>0;return h;});
  await frames(page);const a=await hash();await frames(page);const b=await hash();
  expect(a).toBe(b);
  await page.getByRole('button',{name:'Halt'}).click();
  expect((await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).halted).toBe(true);
  expect(errors).toEqual([]);
});
test('v324 volley: regiments halt, face each other, aim, fire once per musket and reload with smoke',async({page})=>{
  const errors=await open(page);
  await page.getByRole('button',{name:'Vuur!'}).click();
  const r=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_ISO__,step=()=>new Promise(res=>requestAnimationFrame(res));
    api.state.paused=true;
    const seen={};let smoke=0;
    const start=api.state.time;
    for(let t=0;t<=2.4;t+=0.04){api.state.time=start+t;await step();
      const s=api.getStats();for(const k of Object.keys(s.animStates))seen[k]=1;smoke=Math.max(smoke,s.smoke);}
    return{seen:Object.keys(seen).sort(),smoke,stats:api.getStats()};
  });
  expect(r.stats.firing).toBe(true);
  expect(r.stats.halted).toBe(true);
  expect(r.seen).toEqual(expect.arrayContaining(['aim','fire','reload']));
  expect(r.seen).not.toContain('march');
  expect(r.stats.muzzleEvents).toBe(64);
  expect(r.smoke).toBeGreaterThanOrEqual(64);
  await page.getByRole('button',{name:'Staakt het vuren'}).click();
  expect((await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).firing).toBe(false);
  expect(errors).toEqual([]);
});
test.describe('phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  test('v324 iso scene pinch-zooms on a phone',async({page})=>{
    const errors=await open(page);
    const before=(await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).zoom;
    const r=await page.locator('#iso-view').boundingBox();
    const cdp=await page.context().newCDPSession(page);
    const a={x:r.x+140,y:r.y+300,id:1},b={x:r.x+240,y:r.y+300,id:2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-40},{...b,x:b.x+40}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
    const after=(await page.evaluate(()=>window.__GRAPHICS_LAB_ISO__.getStats())).zoom;
    expect(after).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
});
