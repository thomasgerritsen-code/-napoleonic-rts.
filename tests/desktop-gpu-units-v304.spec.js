const {test,expect}=require('@playwright/test');

async function setupLarge2D(page){
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__GPU_UNITS_V304__ && window.__GPU_TERRAIN_V303__ &&
    window.__LARGE_ARMY_PERFORMANCE_V1__
  ));
  return page.evaluate(()=>{
    const perf=window.__LARGE_ARMY_PERFORMANCE_V1__;
    const initial=units.filter(u=>!u.dead).length;
    const center={x:camera.x,y:camera.y};
    while(units.filter(u=>!u.dead).length<390){
      const n=units.length;
      createUnit('france','infantry',
        center.x+(n%22)*11-121,center.y+(Math.floor(n/22)%18)*11-99);
    }
    perf.prepareFrameIndexes();
    camera.zoom=.68;
    const before=perf.renderStats();
    const gpuBefore=window.__GPU_UNITS_V304__.metrics();
    draw();
    const after=perf.renderStats(),gpuAfter=window.__GPU_UNITS_V304__.metrics();
    return{initial,living:perf.livingUnitCount(),
      lod:after.lodUnits-before.lodUnits,
      full:after.fullUnits-before.fullUnits,
      gpuBefore,gpuAfter,
      gpuTerrainActive:window.__GPU_TERRAIN_V303__.active(),
      originalCanvas:!!document.getElementById('game'),
      gpuCanvas:!!document.getElementById('game-terrain-gpu')};
  });
}

test('304 desktop batches distant 2D soldiers into one GPU draw per frame',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const result=await setupLarge2D(page);
  expect(result.living).toBeGreaterThan(360);
  expect(result.lod).toBeGreaterThan(150);
  expect(result.originalCanvas).toBe(true);
  expect(result.gpuCanvas).toBe(true);
  if(result.gpuTerrainActive){
    expect(result.gpuAfter.active).toBe(true);
    expect(result.gpuAfter.soldiers-result.gpuBefore.soldiers).toBeGreaterThan(100);
    expect(result.gpuAfter.drawCalls-result.gpuBefore.drawCalls).toBe(1);
    expect(result.gpuAfter.failures).toBe(0);
  }else{
    expect(result.gpuAfter.active).toBe(false);
    expect(result.gpuAfter.drawCalls-result.gpuBefore.drawCalls).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('304 GPU units off retains original Canvas2D large-army LOD',async({page})=>{
  await page.goto('/?gpuUnits=off&test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_UNITS_V304__&&
    !!window.__LARGE_ARMY_PERFORMANCE_V1__);
  const state=await page.evaluate(()=>{
    while(units.filter(u=>!u.dead).length<375){
      const i=units.length;
      createUnit('france','infantry',camera.x+(i%20)*10-100,
        camera.y+(Math.floor(i/20)%20)*10-100);
    }
    camera.zoom=.68;
    __LARGE_ARMY_PERFORMANCE_V1__.prepareFrameIndexes();
    const before=__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    draw();
    const after=__LARGE_ARMY_PERFORMANCE_V1__.renderStats();
    return{lod:after.lodUnits-before.lodUnits,
      gpu:__GPU_UNITS_V304__.metrics(),
      terrainGpu:__GPU_TERRAIN_V303__.metrics()};
  });
  expect(state.lod).toBeGreaterThan(0);
  expect(state.gpu.active).toBe(false);
  expect(state.gpu.drawCalls).toBe(0);
  expect(state.gpu.disabledByQuery).toBe(true);
});

test('304 mobile stays Canvas2D with no GPU soldiers',async({browser})=>{
  const context=await browser.newContext({
    viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true
  });
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__&&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile));
    const state=await page.evaluate(()=>{
      draw();
      return{gpu:__GPU_UNITS_V304__.metrics(),
        terrain:__GPU_TERRAIN_V303__.metrics(),
        mobile:__MOBILE_RENDER_BUDGET_V1__.state().mobile,
        canvas:document.getElementById('game').getBoundingClientRect().width};
    });
    expect(state.mobile).toBe(true);
    expect(state.gpu.active).toBe(false);
    expect(state.gpu.drawCalls).toBe(0);
    expect(state.terrain.active).toBe(false);
    expect(state.canvas).toBeGreaterThan(500);
  }finally{await context.close();}
});
