const {test,expect}=require('@playwright/test');

test('v307 uses exact 2D rooftop art and one cached GPU batch while status stays live',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__GPU_BUILDINGS_V307__ &&
    window.__TOPDOWN_BUILDING_V307__ && window.__GPU_TERRAIN_V303__));
  const result=await page.evaluate(()=>{
    const gpu=window.__GPU_BUILDINGS_V307__;
    const roof=window.__TOPDOWN_BUILDING_V307__;
    const oldSelection=selectedBuilding;
    const previousCamera={x:camera.x,y:camera.y,zoom:camera.zoom};
    const building={id:987654,type:'house',side:'france',x:camera.x+30,y:camera.y+20,
      w:58,h:44,dead:false,complete:true,queue:[],construction:1,production:0,
      hp:100,maxHp:100};
    buildings.push(building);
    camera.x=building.x;camera.y=building.y;camera.zoom=.85;
    const surface=document.createElement('canvas');
    surface.width=surface.height=256;
    const painter=surface.getContext('2d');
    painter.translate(128,128);
    const painted=roof.paintRoof(building,painter);
    const roofPixel=painter.getImageData(128,128,1,1).data;
    draw();
    const initial=gpu.metrics();
    draw();
    const reused=gpu.metrics();
    selectedBuilding=building;building.hp=40;building.queue.push({type:'infantry'});
    building.production=.6;
    draw();
    const damaged=gpu.metrics();
    const controls={selection:roof.hasIndicators(building),
      health:building.hp/building.maxHp,production:building.production};
    building.complete=false;building.queue.length=0;
    building.construction=.3;
    draw();
    const construction=gpu.metrics();
    selectedBuilding=oldSelection;
    buildings.pop();
    camera.x=previousCamera.x;camera.y=previousCamera.y;camera.zoom=previousCamera.zoom;
    return {painted,alpha:roofPixel[3],roof,initial,reused,damaged,
      construction,controls,version:window.RTS_VERSION};
  });
  expect(result.version).toBe('1.3.55');
  expect(result.painted).toBe(true);
  expect(result.alpha).toBeGreaterThan(200);
  expect(result.roof.exactRoofGeometry).toBe(true);
  expect(result.roof.dynamicIndicatorsOnCanvas).toBe(true);
  expect(result.controls).toEqual({selection:true,health:.4,production:.6});
  if(result.initial.active){
    expect(result.initial.roofs).toBeGreaterThan(0);
    expect(result.initial.drawCalls).toBeGreaterThan(0);
    expect(result.initial.cachedVariants).toBeGreaterThan(0);
    expect(result.reused.textureUploads).toBe(result.initial.textureUploads);
    expect(result.reused.spriteReuses).toBeGreaterThan(result.initial.spriteReuses);
    expect(result.damaged.textureUploads).toBe(result.reused.textureUploads);
    expect(result.damaged.overlays).toBeGreaterThan(result.reused.overlays);
    expect(result.construction.textureUploads).toBeGreaterThan(result.damaged.textureUploads);
    expect(result.construction.overlays).toBeGreaterThan(result.damaged.overlays);
    expect(result.construction.failures).toBe(0);
  }else{
    expect(result.initial.roofs).toBe(0);
    expect(result.initial.drawCalls).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('v307 GPU buildings off or close camera uses original 2D building renderer',async({page})=>{
  await page.goto('/?test=v071&gpuBuildings=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__GPU_BUILDINGS_V307__);
  const state=await page.evaluate(()=>{
    const api=__GPU_BUILDINGS_V307__;
    draw();
    return {metrics:api.metrics(),source:__TOPDOWN_BUILDING_V307__.exactRoofGeometry,
      renderer:NRTS.subsystems.get('building-renderer').mode};
  });
  expect(state.metrics.active).toBe(false);
  expect(state.metrics.disabledByQuery).toBe(true);
  expect(state.metrics.drawCalls).toBe(0);
  expect(state.source).toBe(true);
  expect(state.renderer).toBe('strict-top-down');
});

test('v307 mobile never activates building GPU and retains touch canvas',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__GPU_BUILDINGS_V307__ &&
      window.__MOBILE_RENDER_BUDGET_V1__?.state?.()?.mobile));
    const result=await page.evaluate(()=>{
      draw();return{stats:__GPU_BUILDINGS_V307__.metrics(),
        canvas:document.getElementById('game').getBoundingClientRect().width,
        touch:getComputedStyle(document.getElementById('game')).touchAction};
    });
    expect(result.stats.mobile).toBe(true);
    expect(result.stats.active).toBe(false);
    expect(result.stats.atlasBytes).toBe(0);
    expect(result.stats.drawCalls).toBe(0);
    expect(result.canvas).toBeGreaterThan(500);
    expect(result.touch).toBe('none');
  }finally{await context.close();}
});
