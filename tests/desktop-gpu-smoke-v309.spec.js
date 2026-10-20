const {test,expect}=require('@playwright/test');

test('v309 GPU black powder smoke follows real combat events, drifting wind and clear frames',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_SMOKE_V309__ &&
    window.__COMBAT_ANIMATIONS_V1__ && window.__MAP_AMBIENT_MOTION_V1__));
  const result=await page.evaluate(()=>{
    v05PeaceMode=true;gameOver=false;
    const gpu=__GPU_SMOKE_V309__,combat=__COMBAT_ANIMATIONS_V1__;
    const shooter=createUnit('france','infantry',camera.x,camera.y);
    const target=createUnit('britain','infantry',camera.x+85,camera.y);
    shooter.reload=-1;target.reload=999;
    const pos={x:shooter.x,y:shooter.y};
    fire(shooter,target);shooter.reload=999;
    const origin=combat.smokeSnapshot().find(e=>e.kind==='musket');
    drawParticles();
    const initial=gpu.metrics();
    for(let i=0;i<30;i++)RTS_SIM.step(.05);
    drawParticles();
    const after=gpu.metrics();
    const moved=combat.smokeSnapshot().find(e=>e.born===origin.born);
    return{origin,moved,initial,after,
      source:combat.smokeStats(),version:RTS_VERSION,
      shooterUnchanged:shooter.x===pos.x&&shooter.y===pos.y,
      no3D:!document.querySelector('#battlefield3d'),
      smokeCanvas:document.querySelectorAll('#game-smoke-gpu').length,
      pointer:getComputedStyle(document.getElementById('game-smoke-gpu')).pointerEvents};
  });
  expect(result.version).toBe('1.3.57');
  expect(result.no3D).toBe(true);
  expect(result.smokeCanvas).toBe(1);
  expect(result.pointer).toBe('none');
  expect(result.shooterUnchanged).toBe(true);
  expect(result.source.musketClouds).toBeGreaterThan(0);
  expect(result.source.cap).toBe(80);
  expect(result.moved.center.x-result.origin.center.x).not.toBe(0);
  if(result.initial.active){
    expect(result.initial.overlayVisible).toBe(true);
    expect(result.initial.drawCalls).toBeGreaterThan(0);
    expect(result.initial.lastBillows).toBeGreaterThan(8);
    expect(result.after.billows).toBeGreaterThan(result.initial.billows);
    expect(result.after.shaderFailures).toBe(0);
  }else{
    expect(result.initial.drawCalls).toBe(0);
    expect(result.after.overlayVisible).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('v309 gpuSmoke=off retains existing detailed Canvas smoke and muzzle flashes',async({page})=>{
  await page.goto('/?test=v071&gpuSmoke=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_SMOKE_V309__);
  const r=await page.evaluate(()=>{
    const shooter=createUnit('france','infantry',camera.x,camera.y);
    const target=createUnit('britain','infantry',camera.x+90,camera.y);
    fire(shooter,target);
    drawParticles();
    const s=__COMBAT_ANIMATIONS_V1__.smokeStats();
    return{gpu:__GPU_SMOKE_V309__.metrics(),s,
      original:__COMBAT_ANIMATIONS_V1__.features.includes('pooled-volley-smoke')};
  });
  expect(r.gpu.active).toBe(false);
  expect(r.gpu.disabledByQuery).toBe(true);
  expect(r.gpu.drawCalls).toBe(0);
  expect(r.gpu.overlayVisible).toBe(false);
  expect(r.original).toBe(true);
  expect(r.s.active).toBeGreaterThan(0);
});

test('v309 mobile uses only the original Canvas smoke, without a GPU context',async({browser})=>{
  const context=await browser.newContext({
    viewport:{width:844,height:390},deviceScaleFactor:3,
    isMobile:true,hasTouch:true
  });
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.__GPU_SMOKE_V309__ &&
      !!window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile);
    const r=await page.evaluate(()=>{
      const shooter=createUnit('france','infantry',camera.x,camera.y);
      const target=createUnit('britain','infantry',camera.x+75,camera.y);
      fire(shooter,target);drawParticles();
      return{gpu:__GPU_SMOKE_V309__.metrics(),
        source:__COMBAT_ANIMATIONS_V1__.smokeStats(),
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(r.gpu.active).toBe(false);
    expect(r.gpu.mobile).toBe(true);
    expect(r.gpu.drawCalls).toBe(0);
    expect(r.gpu.overlayVisible).toBe(false);
    expect(r.source.active).toBeGreaterThan(0);
    expect(r.touch).toBe('none');
  }finally{await context.close();}
});
