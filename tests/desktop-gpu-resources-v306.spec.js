const {version:currentReleaseVersion}=require('../package.json');
const {test,expect}=require('@playwright/test');

test('v306 GPU batches exact 2D trees, berry bushes and iron stones without repeated uploads',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__GPU_RESOURCES_V306__ && window.__NATURAL_RESOURCES_V1__ &&
    window.__GPU_TERRAIN_V303__
  ));
  const result=await page.evaluate(()=>{
    const gpu=window.__GPU_RESOURCES_V306__;
    const nat=window.__NATURAL_RESOURCES_V1__;
    const before=resources.length;
    const created=[];
    camera.zoom=.85;
    // Find dry visible positions using the *real* ecology checks, rather
    // than moving objects into the river just to exercise the renderer.
    for(const type of ['wood','food','iron']){
      let candidate=null;
      for(let i=0;i<400&&!candidate;i++){
        const x=camera.x-180+(i%20)*18;
        const y=camera.y-110+Math.floor(i/20)*11;
        const r={id:906000+created.length,type,x,y,amount:100,maxAmount:100,dead:false};
        if(nat.canPaint(r))candidate=r;
      }
      if(candidate){resources.push(candidate);created.push(candidate);}
    }
    draw();
    const first=gpu.metrics();
    draw();
    const second=gpu.metrics();
    if(created[0])created[0].amount=55;
    draw();
    const afterHarvest=gpu.metrics();
    // Test water exclusion independently of GPU capability and texture use.
    const denied={id:999001,type:'wood',x:0,y:0,amount:100,maxAmount:100,dead:true};
    const deadExcluded=nat.canPaint(denied)===false;
    const localExcluded=nat.canPaint({
      id:999002,type:'food',x:camera.x,y:camera.y,amount:50,maxAmount:100,
      dead:false,localVillageBerry:true
    })===false;
    resources.splice(before);
    return{first,second,afterHarvest,created:created.map(r=>r.type),
      deadExcluded,localExcluded,version:window.RTS_VERSION,
      natural:!!nat.offscreenSpriteSource};
  });
  expect(result.version).toBe(currentReleaseVersion);
  expect(result.natural).toBe(true);
  expect(result.deadExcluded).toBe(true);
  expect(result.localExcluded).toBe(true);
  expect(result.created).toContain('wood');
  expect(result.created).toContain('food');
  expect(result.created).toContain('iron');
  if(result.first.active){
    expect(result.first.instances).toBeGreaterThan(0);
    expect(result.first.drawCalls).toBeGreaterThan(0);
    expect(result.first.spriteCount).toBeGreaterThan(2);
    expect(result.second.uploads).toBe(result.first.uploads);
    expect(result.second.drawCalls).toBe(result.first.drawCalls+1);
    expect(result.afterHarvest.repaints).toBeGreaterThan(result.second.repaints);
    expect(result.afterHarvest.failures).toBe(0);
    expect(result.afterHarvest.atlasBytes).toBeGreaterThan(0);
  }else{
    expect(result.first.drawCalls).toBe(0);
    expect(result.afterHarvest.drawCalls).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('v306 GPU props off uses the original canvas natural-resource renderer',async({page})=>{
  await page.goto('/?test=v071&gpuProps=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_RESOURCES_V306__));
  const r=await page.evaluate(()=>{
    draw();
    return {gpu:__GPU_RESOURCES_V306__.metrics(),
      original:__NATURAL_RESOURCES_V1__.treeStyle,
      canvas:!!document.getElementById('game')};
  });
  expect(r.gpu.active).toBe(false);
  expect(r.gpu.drawCalls).toBe(0);
  expect(r.gpu.disabledByQuery).toBe(true);
  expect(r.original).toBe('layered-deciduous-canopy');
  expect(r.canvas).toBe(true);
});

test('v306 mobile stays Canvas2D and does not allocate GPU resource atlas',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(
      window.__GPU_RESOURCES_V306__ &&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile
    ));
    const state=await page.evaluate(()=>{
      draw();
      return {props:__GPU_RESOURCES_V306__.metrics(),
        terrain:__GPU_TERRAIN_V303__.metrics(),
        canvas:document.getElementById('game').getBoundingClientRect().width};
    });
    expect(state.props.mobile).toBe(true);
    expect(state.props.active).toBe(false);
    expect(state.props.drawCalls).toBe(0);
    expect(state.props.atlasBytes).toBe(0);
    expect(state.terrain.active).toBe(false);
    expect(state.canvas).toBeGreaterThan(500);
  }finally{await context.close();}
});
