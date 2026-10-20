const {test,expect}=require('@playwright/test');
// Real touchscreen injection requires a touch-enabled context; viewport alone is insufficient.
test.use({hasTouch:true});
async function open(page,url='/graphics-lab/?pixi=off'){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats()?.loaded===10);
  return errors;
}
test('v320 realistic scene loads 10 independent image assets; no game simulation is changed',async({page})=>{
  const errors=await open(page);
  const r=await page.evaluate(()=>{
    const api=window.__GRAPHICS_LAB_V319__,s=api.getStats();
    const scene=document.getElementById('scene-host');
    return{version:api.version,loaded:s.loaded,objects:s.sprites,
      smoke:s.animatedSmoke,stands:s.staticTroopsDoNotMarch,
      city:api.assets.includes('supply-wagon.svg'),
      terrain:api.assets.includes('landscape-details.svg'),
      walkFrames:api.assets.filter(x=>x.includes('-march')).length,
      id:!!document.getElementById('atmosphere-canvas'),
      worldGame:!!document.getElementById('game'),
      canvas:!!scene.querySelector('#detail-canvas'),
      source:document.title};
  });
  expect(r.version).toBe('320.0');
  expect(r.loaded).toBe(10);
  expect(r.objects).toBe(53);
  expect(r.smoke).toBe(true);
  expect(r.stands).toBe(true);
  expect(r.city).toBe(true);
  expect(r.terrain).toBe(true);
  expect(r.walkFrames).toBe(2);
  expect(r.id).toBe(true);
  expect(r.worldGame).toBe(false);
  expect(r.source).toContain('v320');
  expect(errors).toEqual([]);
});
test('v320 volley produces translucent smoke only while regiment has halted',async({page})=>{
  const errors=await open(page);
  const painted=await page.evaluate(async()=>{
    const api=window.__GRAPHICS_LAB_V319__,c=document.getElementById('atmosphere-canvas');
    api.state.paused=true;api.state.time=6.4;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const ctx=c.getContext('2d'),image=ctx.getImageData(0,0,c.width,c.height).data;
    let pixels=0;for(let i=3;i<image.length;i+=4)if(image[i]>0)pixels++;
    api.state.time=4.4;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const image2=ctx.getImageData(0,0,c.width,c.height).data;
    let haltedPixels=0;for(let i=3;i<image2.length;i+=4)if(image2[i]>0)haltedPixels++;
    return{smokePixels:pixels,notFiringPixels:haltedPixels,phase:api.getStats().stage};
  });
  expect(painted.smokePixels).toBeGreaterThan(40);
  expect(painted.notFiringPixels).toBe(0);
  expect(painted.phase).toBe('laden / vuren');
  expect(errors).toEqual([]);
});
test('v320 Canvas and GPU path both preserve touch UI on phone',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await open(page);
  expect(await page.locator('#status').textContent()).toContain('Offline');
  const before=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  await page.getByRole('button',{name:'Toon oude tekenstijl'}).click();
  await page.getByRole('button',{name:'Toon nieuwe sprites'}).click();
  const viewport=await page.locator('#viewport').boundingBox();
  await page.touchscreen.tap(viewport.x+viewport.width*.65,viewport.y+viewport.height*.5);
  expect(await page.locator('#selection').textContent()).toContain('Brits regiment');
  const after=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(after.loaded).toBe(10);
  expect(after.mode).toBe('new');
  expect(after.sprites).toBe(before.sprites);
  expect(errors).toEqual([]);
});
test('v320 PixiJS GPU is optional and falls back to textured Canvas if network blocked',async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  const errors=await open(page,'/graphics-lab/');
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats()?.engine.includes('fallback'));
  const state=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(state.engine).toContain('Canvas 2D');
  expect(state.loaded).toBe(10);
  expect(errors).toEqual([]);
});
