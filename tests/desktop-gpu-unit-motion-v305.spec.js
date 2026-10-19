const {test,expect}=require('@playwright/test');

test('v305 GPU gait follows physical displacement, not a distant marching order',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__ &&
    window.__LARGE_ARMY_PERFORMANCE_V1__ && window.__GPU_TERRAIN_V303__));
  const snapshot=await page.evaluate(()=>{
    const gpu=window.__GPU_UNITS_V304__,perf=window.__LARGE_ARMY_PERFORMANCE_V1__;
    v05PeaceMode=true;
    // Make LOD deterministic at low zoom while keeping all troop positions
    // close to the actual expanded-map camera (no fake off-screen movement).
    const cx=camera.x,cy=camera.y;
    while(units.filter(u=>!u.dead).length<390){
      const i=units.length;
      const soldier=createUnit('france','infantry',
        cx+(i%20)*11-100,cy+(Math.floor(i/20)%18)*11-90);
      soldier.targetX=soldier.x;soldier.targetY=soldier.y;
    }
    const testUnit=createUnit('france','infantry',cx+4,cy+3);
    testUnit.targetX=testUnit.x+300;testUnit.targetY=testUnit.y;
    camera.zoom=.68;
    perf.prepareFrameIndexes();
    draw();
    const initial=gpu.gaitFor(testUnit);
    const first=gpu.metrics();
    // The test unit has a real far-away order but has not moved.
    elapsed+=.08;
    draw();
    const waiting=gpu.gaitFor(testUnit);
    // Only a physical displacement is allowed to swing the feet.
    elapsed+=.08;
    testUnit.x+=6;
    draw();
    const walking=gpu.gaitFor(testUnit);
    const afterMove=gpu.metrics();
    // A regiment stopped at a bridge must immediately stop marching in place.
    elapsed+=.08;
    draw();
    const halted=gpu.gaitFor(testUnit);
    // Teleport/recovery should never be misread as dozens of footsteps.
    elapsed+=.08;
    testUnit.x+=65;
    draw();
    const afterTeleport=gpu.gaitFor(testUnit);
    const final=gpu.metrics();
    return{first,afterMove,final,initial,waiting,walking,halted,afterTeleport,
      gpuActive:gpu.active(),lodEnabled:perf.livingUnitCount()>360,
      version:window.RTS_VERSION};
  });
  expect(snapshot.version).toBe('1.3.53');
  expect(snapshot.lodEnabled).toBe(true);
  expect(snapshot.first.failures).toBe(0);
  if(snapshot.gpuActive){
    expect(snapshot.initial?.moving).toBe(false);
    expect(snapshot.waiting?.moving).toBe(false);
    expect(snapshot.walking?.moving).toBe(true);
    expect(snapshot.walking.phase).toBeGreaterThan(snapshot.waiting.phase);
    expect(snapshot.halted?.moving).toBe(false);
    expect(snapshot.halted.phase).toBe(snapshot.walking.phase);
    expect(snapshot.afterTeleport?.moving).toBe(false);
    expect(snapshot.final.ignoredTeleports).toBeGreaterThan(0);
    expect(snapshot.final.walking).toBeGreaterThan(snapshot.first.walking);
    expect(snapshot.final.motionTracked).toBeGreaterThan(300);
    expect(snapshot.final.failures).toBe(0);
  }else{
    expect(snapshot.final.active).toBe(false);
    expect(snapshot.final.drawCalls).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('v305 Canvas fallback remains available without GPU soldiers',async({page})=>{
  await page.goto('/?test=v071&gpuUnits=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__));
  const r=await page.evaluate(()=>({
    state:window.__GPU_UNITS_V304__.metrics(),
    body:!!document.getElementById('game'),
    no3D:!document.getElementById('battlefield3d')
  }));
  expect(r.state.active).toBe(false);
  expect(r.state.disabledByQuery).toBe(true);
  expect(r.body).toBe(true);
  expect(r.no3D).toBe(true);
});

test('v305 mobile retains Canvas2D only and cannot start GPU soldiers',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try {
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__ &&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile));
    const r=await page.evaluate(()=>({
      state:window.__GPU_UNITS_V304__.metrics(),
      mobile:window.__MOBILE_RENDER_BUDGET_V1__.state().mobile,
      canvas:document.getElementById('game')?.getBoundingClientRect().width
    }));
    expect(r.state.active).toBe(false);
    expect(r.state.drawCalls).toBe(0);
    expect(r.mobile).toBe(true);
    expect(r.canvas).toBeGreaterThan(500);
  }finally{await context.close();}
});
