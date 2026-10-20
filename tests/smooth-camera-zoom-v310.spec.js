const {test,expect}=require('@playwright/test');

test('v310 desktop zoom reuses terrain GPU tiles instead of wiping cache every tiny wheel step',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__DESKTOP_TERRAIN_TILES_V301__&&window.__GPU_TERRAIN_V303__));
    const result=await page.evaluate(()=>{
      const tiles=__DESKTOP_TERRAIN_TILES_V301__;
      const gpu=__GPU_TERRAIN_V303__;
      camera.x=1920;camera.y=1280;camera.zoom=1;
      tiles.invalidate();draw();
      const start=tiles.stats();
      for(const zoom of[1.015,1.025,1.04,1.065,1.095]){
        camera.zoom=zoom;draw();
      }
      const smooth=tiles.stats();
      const textureUploadsAtZoom=gpu.metrics().textureUploads;
      camera.zoom=1.4;draw();
      const otherTier=tiles.stats();
      camera.zoom=1.095;draw();
      const restored=tiles.stats();
      camera.zoom=1;
      const clientX=500,clientY=330;
      const before=screenToWorld(clientX,clientY);
      canvas.dispatchEvent(new WheelEvent('wheel',{
        deltaY:1,deltaMode:0,clientX,clientY,bubbles:true,cancelable:true
      }));
      const after=screenToWorld(clientX,clientY);
      return {start,smooth,otherTier,restored,textureUploadsAtZoom,
        cameraZoom:camera.zoom,anchorError:Math.hypot(before.x-after.x,before.y-after.y),
        version:RTS_VERSION_INFO.version};
    });
    expect(result.version).toBe('1.3.58');
    expect(result.start.misses).toBeGreaterThan(0);
    expect(result.smooth.misses).toBe(result.start.misses);
    expect(result.smooth.invalidations).toBe(result.start.invalidations);
    expect(result.smooth.hits).toBeGreaterThan(result.start.hits);
    expect(result.otherTier.zoomProfileSwitches).toBeGreaterThan(result.smooth.zoomProfileSwitches);
    expect(result.otherTier.misses).toBeGreaterThan(result.smooth.misses);
    // The previously populated 1.0 LOD remains cached on a return zoom.
    expect(result.restored.misses).toBe(result.otherTier.misses);
    expect(result.cameraZoom).toBeGreaterThan(.998);
    expect(result.cameraZoom).toBeLessThan(1);
    expect(result.anchorError).toBeLessThan(.1);
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('v310 mobile pinch zoom reprojects cached static 2D map between full snapshots',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,hasTouch:true,isMobile:true});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/?test=v071',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__LARGE_ARMY_PERFORMANCE_V1__&&
      window.__MOBILE_RENDER_BUDGET_V1__?.state()?.mobile));
    const result=await page.evaluate(()=>{
      const perf=__LARGE_ARMY_PERFORMANCE_V1__;
      camera.zoom=.85;
      draw();
      const initial=perf.renderStats();
      camera.zoom=.87;
      draw();
      const preview=perf.renderStats();
      const css=document.getElementById('game-static').style.transform;
      camera.zoom=.62;
      draw();
      const refresh=perf.renderStats();
      const resetCss=document.getElementById('game-static').style.transform;
      return{initial,preview,refresh,css,resetCss,
        mobile:__MOBILE_RENDER_BUDGET_V1__.state().mobile,
        gestures:__PLAYABILITY_CONTROLS_V1__?.mobile?.cameraGestures||0};
    });
    expect(result.mobile).toBe(true);
    expect(result.preview.staticTerrainCaptures).toBe(result.initial.staticTerrainCaptures);
    expect(result.preview.mobileZoomReprojections).toBeGreaterThan(result.initial.mobileZoomReprojections);
    expect(result.css).toContain('scale(');
    expect(result.refresh.staticTerrainCaptures).toBeGreaterThan(result.preview.staticTerrainCaptures);
    expect(result.resetCss).toBe('none');
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('v310 no GPU terrain retains correct zoom / Canvas fallback',async({page})=>{
  await page.goto('/?test=v071&gpu=off',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__DESKTOP_TERRAIN_TILES_V301__&&window.__GPU_TERRAIN_V303__));
  const state=await page.evaluate(()=>{
    const tiles=__DESKTOP_TERRAIN_TILES_V301__;
    camera.zoom=1;tiles.invalidate();draw();
    const start=tiles.stats();
    camera.zoom=1.035;draw();
    return{start,after:tiles.stats(),gpu:__GPU_TERRAIN_V303__.metrics()};
  });
  expect(state.gpu.active).toBe(false);
  expect(state.gpu.fallbackCanvasVisible).toBe(true);
  expect(state.start.misses).toBeGreaterThan(0);
  expect(state.after.invalidations).toBe(state.start.invalidations);
});
