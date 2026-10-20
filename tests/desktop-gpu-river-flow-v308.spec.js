const {test,expect}=require('@playwright/test');

test('v308 GPU renders true 2D river flow while retaining bend dynamics and bridge eddies',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_RIVER_FLOW_V308__&&
    !!window.__RIVER_FLOW_2D_V299__&&!!window.__DESKTOP_TERRAIN_TILES_V301__);
  const r=await page.evaluate(()=>{
    const gpu=window.__GPU_RIVER_FLOW_V308__,flow=window.__RIVER_FLOW_2D_V299__;
    const crossing=WATER_CROSSINGS_V067[0];
    const cam={x:camera.x,y:camera.y,zoom:camera.zoom};
    camera.x=crossing.x;camera.y=crossing.y;camera.zoom=.82;
    const before=gpu.metrics();
    draw();const a=gpu.metrics(),first=flow.metrics();
    elapsed+=.16;draw();
    const b=gpu.metrics(),second=flow.metrics();
    const sampleA=flow.sample(18,2),sampleB=flow.sample(18,2.5);
    const speeds={center:flow.speedAt(crossing.y,0),shore:flow.speedAt(crossing.y,.84)};
    camera.x=cam.x;camera.y=cam.y;camera.zoom=cam.zoom;
    return {before,a,b,first,second,sampleA,sampleB,speeds,
      version:window.RTS_VERSION,
      navRenders:window.__RIVER_BANKS_2D_V298__?.twoDOnly,
      geometry:window.__RIVER_SURFACE_V297__?.sharedGeometry};
  });
  expect(r.version).toBe('1.3.56');
  expect(r.navRenders).toBe(true);
  expect(r.geometry).toBe(true);
  expect(r.speeds.center).toBeGreaterThan(r.speeds.shore*1.5);
  expect(r.second.wakes).toBeGreaterThanOrEqual(8);
  expect(Math.hypot(r.sampleB.x-r.sampleA.x,r.sampleB.y-r.sampleA.y)).toBeGreaterThan(.1);
  expect(r.a.shaderFailures).toBe(0);
  if(r.a.active){
    expect(r.a.drawCalls).toBeGreaterThan(r.before.drawCalls);
    expect(r.b.drawCalls).toBeGreaterThan(r.a.drawCalls);
    expect(r.a.lastVisible).toBeGreaterThan(0);
    expect(r.b.wakesOnCanvas).toBeGreaterThan(r.a.wakesOnCanvas);
    expect(r.b.textureBytes).toBe(0);
    expect(r.b.shaderFailures).toBe(0);
  }else{
    expect(r.a.drawCalls).toBe(0);
    expect(r.second.visible).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('v308 disabling GPU water keeps animated Canvas2D flow on cached desktop terrain',async({page})=>{
  await page.goto('/?gpuWater=off&test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_RIVER_FLOW_V308__&&
    !!window.__RIVER_FLOW_2D_V299__&&!!window.__DESKTOP_TERRAIN_TILES_V301__);
  const r=await page.evaluate(()=>{
    const crossing=WATER_CROSSINGS_V067[0];
    camera.x=crossing.x;camera.y=crossing.y;camera.zoom=.85;
    draw();const first=__RIVER_FLOW_2D_V299__.metrics();
    elapsed+=.2;draw();const second=__RIVER_FLOW_2D_V299__.metrics();
    return {gpu:__GPU_RIVER_FLOW_V308__.metrics(),first,second};
  });
  expect(r.gpu.active).toBe(false);
  expect(r.gpu.disabledByQuery).toBe(true);
  expect(r.gpu.drawCalls).toBe(0);
  expect(r.first.visible).toBeGreaterThan(0);
  expect(r.second.visible).toBeGreaterThan(0);
  expect(r.second.wakes).toBeGreaterThanOrEqual(8);
});

test('v308 mobile continues original water/bridge renderer with zero GPU draw calls',async({browser})=>{
  const context=await browser.newContext({
    viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3
  });
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.__GPU_RIVER_FLOW_V308__&&
      !!window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile);
    const r=await page.evaluate(()=>{
      const crossing=WATER_CROSSINGS_V067[0];
      camera.x=crossing.x;camera.y=crossing.y;camera.zoom=1;
      draw();
      return {gpu:__GPU_RIVER_FLOW_V308__.metrics(),
        river:__RIVER_FLOW_2D_V299__.metrics(),
        canvas:document.getElementById('game').getBoundingClientRect().width,
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(r.gpu.active).toBe(false);
    expect(r.gpu.mobile).toBe(true);
    expect(r.gpu.drawCalls).toBe(0);
    expect(r.river.visible).toBeGreaterThan(0);
    expect(r.river.wakes).toBeGreaterThanOrEqual(8);
    expect(r.canvas).toBeGreaterThan(500);
    expect(r.touch).toBe('none');
  }finally{await context.close();}
});
