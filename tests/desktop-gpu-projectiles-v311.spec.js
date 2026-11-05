const {version:currentReleaseVersion}=require('../package.json');
const {test,expect}=require('@playwright/test');

test('v311 musket and cannon projectiles use the existing smoke GPU batch and retain actual positions',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_SMOKE_V309__&&window.__COMBAT_ANIMATIONS_V1__));
  const result=await page.evaluate(()=>{
    const gpu=__GPU_SMOKE_V309__;
    const shot={x:camera.x+8,y:camera.y,artillery:false};
    const cannon={x:camera.x-6,y:camera.y+4,artillery:true};
    const beforeCount=projectiles.length;
    projectiles.push(shot,cannon);
    const start=gpu.metrics();
    const oldArc=ctx.arc;
    let canvasShotArcs=0;
    ctx.arc=function(...args){canvasShotArcs++;return oldArc.apply(this,args);};
    try{
      drawProjectile(shot);
      drawProjectile(cannon);
    }finally{ctx.arc=oldArc;}
    // The smoke renderer runs even with no black-powder cloud active; real
    // projectile positions are appended after billows to its same GPU batch.
    const ok=gpu.draw([],elapsed,{});
    const after=gpu.metrics();
    projectiles.length=beforeCount;
    return{start,after,ok,canvasShotArcs,version:RTS_VERSION_INFO.version,
      canvasCount:document.querySelectorAll('#game-smoke-gpu').length,
      noAdditionalProjectileCanvas:!document.getElementById('game-projectiles-gpu')};
  });
  expect(result.version).toBe(currentReleaseVersion);
  expect(result.canvasCount).toBe(1);
  expect(result.noAdditionalProjectileCanvas).toBe(true);
  if(result.after.active){
    expect(result.ok).toBe(true);
    expect(result.canvasShotArcs).toBe(0);
    expect(result.after.lastProjectiles).toBe(2);
    expect(result.after.projectileDraws-result.start.projectileDraws).toBe(2);
    expect(result.after.projectileFrames).toBeGreaterThan(result.start.projectileFrames);
    expect(result.after.drawCalls).toBeGreaterThan(result.start.drawCalls);
    expect(result.after.lastBillows).toBe(0);
    expect(result.after.shaderFailures).toBe(0);
  }else{
    expect(result.canvasShotArcs).toBe(2);
    expect(result.after.projectileDraws).toBe(result.start.projectileDraws);
  }
  expect(errors).toEqual([]);
});

test('v311 gpuSmoke=off keeps the original Canvas circles and no second GPU layer',async({page})=>{
  await page.goto('/?test=v071&gpuSmoke=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_SMOKE_V309__));
  const result=await page.evaluate(()=>{
    const oldArc=ctx.arc;let arcs=0;
    ctx.arc=function(...args){arcs++;return oldArc.apply(this,args);};
    try{
      drawProjectile({x:camera.x,y:camera.y,artillery:false});
      drawProjectile({x:camera.x,y:camera.y,artillery:true});
    }finally{ctx.arc=oldArc;}
    const gpu=__GPU_SMOKE_V309__;
    return{arcs,metric:gpu.metrics(),projectilesSharedContext:gpu.projectileDotsOnSameGPUContext};
  });
  expect(result.arcs).toBe(2);
  expect(result.metric.active).toBe(false);
  expect(result.metric.projectileDraws).toBe(0);
  expect(result.metric.overlayVisible).toBe(false);
  expect(result.projectilesSharedContext).toBe(true);
});

test('v311 touch device still paints projectile circles through the original 2D canvas',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__GPU_SMOKE_V309__&&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile));
    const result=await page.evaluate(()=>{
      const oldArc=ctx.arc;let count=0;
      ctx.arc=function(...args){count++;return oldArc.apply(this,args);};
      try{drawProjectile({x:camera.x,y:camera.y,artillery:true});}
      finally{ctx.arc=oldArc;}
      return{count,gpu:__GPU_SMOKE_V309__.metrics(),
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(result.count).toBe(1);
    expect(result.gpu.mobile).toBe(true);
    expect(result.gpu.active).toBe(false);
    expect(result.gpu.projectileDraws).toBe(0);
    expect(result.touch).toBe('none');
  }finally{await context.close();}
});
