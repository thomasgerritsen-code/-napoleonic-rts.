const {version:currentReleaseVersion}=require('../package.json');
const {test,expect}=require('@playwright/test');

test('v305 GPU soldiers retain one batch and march only after actual displacement',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_UNITS_V304__&&
    window.__LARGE_ARMY_PERFORMANCE_V1__));
  const result=await page.evaluate(()=>{
    const api=window.__GPU_UNITS_V304__;
    const perf=window.__LARGE_ARMY_PERFORMANCE_V1__;
    const x=camera.x,y=camera.y;
    while(units.filter(u=>!u.dead).length<385){
      const i=units.length;
      createUnit('france','infantry',x+(i%24)*11-132,
        y+(Math.floor(i/24)%18)*11-99);
    }
    camera.zoom=.68;
    perf.prepareFrameIndexes();
    draw();
    const initial=api.metrics();
    const visible=units.filter(u=>!u.dead&&u.side==='france'&&
      u.type==='infantry'&&Math.hypot(u.x-x,u.y-y)<240).slice(0,25);
    // Setting a destination without moving must NOT animate the feet.
    for(const u of visible){u.targetX=u.x+500;u.targetY=u.y;}
    elapsed+=.11;
    draw();
    const waiting=api.metrics();
    for(const u of visible){u.x+=7;}
    elapsed+=.11;
    draw();
    const moved=api.metrics();
    return {initial,waiting,moved,visible:visible.length,
      currentVersion:window.RTS_VERSION,
      cameraZoom:camera.zoom};
  });
  expect(result.currentVersion).toBe(currentReleaseVersion);
  expect(result.visible).toBeGreaterThan(10);
  expect(result.initial.enhancedUniforms).toBeUndefined();
  if(result.initial.active){
    expect(result.initial.failures).toBe(0);
    expect(result.waiting.animatedSoldiers).toBe(result.initial.animatedSoldiers);
    expect(result.moved.animatedSoldiers-result.waiting.animatedSoldiers)
      .toBeGreaterThanOrEqual(10);
    expect(result.moved.motionSamples).toBeGreaterThan(result.waiting.motionSamples);
    expect(result.moved.drawCalls-result.waiting.drawCalls).toBe(1);
    expect(result.moved.failures).toBe(0);
  }else{
    // Full Canvas2D fallback still draws every physical unit.
    expect(result.moved.active).toBe(false);
    expect(result.moved.drawCalls-result.initial.drawCalls).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('v305 retains detailed Canvas soldiers when the GPU unit batch is disabled',async({page})=>{
  await page.goto('/?test=v071&gpuUnits=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_UNITS_V304__);
  const data=await page.evaluate(()=>({
    version:window.__GPU_UNITS_V304__.version,
    uniforms:window.__GPU_UNITS_V304__.enhancedUniforms,
    gait:window.__GPU_UNITS_V304__.actualMovementGait,
    metrics:window.__GPU_UNITS_V304__.metrics(),
    characters:window.__CHARACTER_VISUALS_V2__?.supportedTypes,
    canvas:!!document.getElementById('game')
  }));
  expect(data.version).toBe('305.0');
  expect(data.uniforms).toBe(true);
  expect(data.gait).toBe(true);
  expect(data.metrics.active).toBe(false);
  expect(data.metrics.drawCalls).toBe(0);
  expect(data.characters).toContain('infantry');
  expect(data.characters).toContain('cavalry');
  expect(data.canvas).toBe(true);
});
