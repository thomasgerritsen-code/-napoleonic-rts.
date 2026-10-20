const {test,expect}=require('@playwright/test');
async function openLab(page,portrait=false){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/graphics-lab/?pixi=off',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__GRAPHICS_LAB_V319__?.getStats().loaded===6);
  return errors;
}
test('graphics lab loads six real independent SVG assets in isolated 2D scene',async({page})=>{
  const errors=await openLab(page);
  const state=await page.evaluate(()=>{
    const stats=window.__GRAPHICS_LAB_V319__.getStats();
    const img=document.getElementById('detail-canvas');
    return{stats,version:window.__GRAPHICS_LAB_V319__.version,href:document.querySelector('.game-link').getAttribute('href'),
      pixel:img.width>0&&img.height>0,assets:window.__GRAPHICS_LAB_V319__.assets,
      gameCanvas:!!document.getElementById('game'),
      title:document.title,
      old:document.getElementById('old-canvas').style.visibility};
  });
  expect(state.version).toBe('319.0');
  expect(state.stats.engine).toContain('Canvas 2D');
  expect(state.stats.loaded).toBe(6);
  expect(state.stats.sprites).toBe(50);
  expect(state.pixel).toBe(true);
  expect(state.gameCanvas).toBe(false);
  expect(state.assets).toContain('battlefield.svg');
  expect(state.assets).toContain('infantry-france.svg');
  expect(state.assets).toContain('infantry-britain.svg');
  expect(state.title).toContain('Graphics Lab');
  expect(state.href).toBe('../');
  expect(errors).toEqual([]);
});
test('graphics lab old-vs-new comparison and sprite-count controls work',async({page})=>{
  const errors=await openLab(page);
  await page.getByRole('button',{name:'Toon oude tekenstijl'}).click();
  const old=await page.evaluate(()=>({mode:window.__GRAPHICS_LAB_V319__.getStats().mode,
    old:document.getElementById('old-canvas').style.visibility,
    new:document.getElementById('detail-canvas').style.visibility}));
  expect(old.mode).toBe('old');
  expect(old.old).toBe('visible');
  expect(old.new).toBe('hidden');
  await page.getByRole('button',{name:'Toon nieuwe sprites'}).click();
  await page.locator('#count').selectOption('128');
  const news=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(news.mode).toBe('new');
  expect(news.sprites).toBe(146);
  await page.locator('#quality').selectOption('quality');
  expect(await page.locator('#resolution').textContent()).toContain('1.5');
  expect(errors).toEqual([]);
});
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
test('portrait mobile can pan, pinch, tap selection and recenter without orders',async({page})=>{
  const errors=await openLab(page,true);
  const initial=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  const view=page.locator('#viewport');
  const rect=await view.boundingBox();
  expect(rect.width).toBeGreaterThan(300);
  await page.touchscreen.tap(rect.x+rect.width*.62,rect.y+rect.height*.55);
  expect(await page.locator('#selection').textContent()).toContain('Brits regiment');
  const cdp=await page.context().newCDPSession(page);
  const a={x:rect.x+130,y:rect.y+170,id:1},b={x:rect.x+245,y:rect.y+170,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    {...a,x:a.x-23},{...b,x:b.x+35}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
  const after=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(after.zoom).toBeGreaterThan(initial.zoom);
  await page.getByRole('button',{name:'Camera centreren'}).click();
  const centered=await page.evaluate(()=>window.__GRAPHICS_LAB_V319__.getStats());
  expect(centered.zoom).toBeCloseTo(initial.zoom,2);
  expect(centered.loaded).toBe(6);
  expect(errors).toEqual([]);
});
