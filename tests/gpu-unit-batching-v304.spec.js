const {test,expect}=require('@playwright/test');

async function loadArmy(page,query='?test=health'){
  await page.goto('/'+query,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.RTS_SIM&&window.__RTS_DEBUG__?.runScenario&&
    window.__LARGE_ARMY_PERFORMANCE_V1__&&window.__GPU_UNITS_V304__
  ));
  return page.evaluate(()=>{
    window.__RTS_DEBUG__.runScenario('performance-520');
    window.RTS_SIM.step(.05);
    camera.zoom=.55;
    const army=units.filter(u=>!u.dead&&u.side==='france'&&u.type==='infantry');
    const center=army[Math.floor(army.length/2)]||units.find(u=>!u.dead);
    if(center){camera.x=center.x;camera.y=center.y;}
    clampCamera();
    const before=window.__GPU_UNITS_V304__.metrics();
    const perfBefore=window.__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    draw();
    const after=window.__GPU_UNITS_V304__.metrics();
    const perfAfter=window.__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    return {living:units.filter(u=>!u.dead).length,zoom:camera.zoom,
      mobile:window.__MOBILE_RENDER_BUDGET_V1__?.state().mobile,
      before,after,perfBefore,perfAfter,
      overlayVisible:getComputedStyle(document.getElementById('game-units-gpu')).display!=='none',
      mainCanvas:!!document.getElementById('game'),
      threeRenderer:!!window.__BATTLEFIELD_3D_V1__};
  });
}

test('520-unit desktop 2D battle batches distant infantry in one GPU instance draw',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await loadArmy(page);
  expect(result.living).toBeGreaterThan(360);
  expect(result.zoom).toBeLessThan(.82);
  expect(result.mobile).toBe(false);
  expect(result.mainCanvas).toBe(true);
  expect(result.threeRenderer).toBe(false);
  if(result.after.active){
    expect(result.after.frames).toBeGreaterThan(result.before.frames);
    expect(result.after.batches).toBeGreaterThan(result.before.batches);
    expect(result.after.instances).toBeGreaterThan(result.before.instances);
    expect(result.after.peakBatch).toBeGreaterThan(0);
    expect(result.perfAfter.gpuUnits).toBeGreaterThan(result.perfBefore.gpuUnits);
    expect(result.overlayVisible).toBe(true);
  }else{
    // Headless runners without graphics support still have a real Canvas path.
    expect(result.perfAfter.lodUnits).toBeGreaterThan(result.perfBefore.lodUnits);
    expect(result.overlayVisible).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('units=cpu keeps terrain GPU but draws every LOD unit in original Canvas',async({page})=>{
  const r=await loadArmy(page,'?test=health&units=cpu');
  expect(r.after.active).toBe(false);
  expect(r.after.instances).toBe(0);
  expect(r.after.disabled).toBe(true);
  expect(r.overlayVisible).toBe(false);
  expect(r.perfAfter.gpuUnits).toBe(r.perfBefore.gpuUnits);
  expect(r.perfAfter.lodUnits).toBeGreaterThan(r.perfBefore.lodUnits);
});

test('mobile and touch remain 2D Canvas without a GPU unit layer',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    screen:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__));
    const result=await page.evaluate(()=>{
      draw();
      const gpu=window.__GPU_UNITS_V304__.metrics();
      return {gpu,visible:getComputedStyle(document.getElementById('game-units-gpu')).display!=='none',
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(result.gpu.mobile).toBe(true);
    expect(result.gpu.active).toBe(false);
    expect(result.gpu.instances).toBe(0);
    expect(result.visible).toBe(false);
    expect(result.touch).toBe('none');
  }finally{await context.close();}
});
