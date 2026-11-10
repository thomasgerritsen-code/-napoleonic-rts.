const {version:currentReleaseVersion}=require('../package.json');
const {test,expect}=require('@playwright/test');

test('desktop boots strictly in 2D without 3D renderer, mode toggle or external Three.js',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const responses=[];
  page.on('request',request=>{if(/three\.module|battlefield-3d-/i.test(request.url()))responses.push(request.url());});
  await page.goto('/?test=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__LARGE_ARMY_PERFORMANCE_V1__?.twoDDefault &&
    window.__MAP_REALISM_V2__?.viewportCulling));
  const result=await page.evaluate(()=>{
    draw();
    return {
      canvas:document.querySelector('#game')?.getBoundingClientRect().width,
      modeButtons:document.querySelectorAll('#renderModeBtn').length,
      battlefield3D:document.querySelectorAll('#battlefield3d').length,
      staticCanvas:!!document.querySelector('#game-static'),
      threeLoaded:typeof window.THREE !== 'undefined',
      threeBridge:typeof window.__BATTLEFIELD_3D_V1__ !== 'undefined',
      runtimeVersion:window.RTS_VERSION,
      currentRiver:window.__RIVER_FLOW_2D_V299__?.travelTimeFlow
    };
  });
  expect(result.canvas).toBeGreaterThan(200);
  expect(result.modeButtons).toBe(0);
  expect(result.battlefield3D).toBe(0);
  expect(result.threeLoaded).toBe(false);
  expect(result.threeBridge).toBe(false);
  expect(result.staticCanvas).toBe(true);
  expect(result.currentRiver).toBe(true);
  expect(result.runtimeVersion).toBe(currentReleaseVersion);
  expect(responses).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile remains 2D-only with unchanged touch canvas',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto('/?test=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.__PLAYABILITY_CONTROLS_V1__?.mobile?.enabled));
    const result=await page.evaluate(()=>({
      canvas:!!document.querySelector('#game'),
      threeCanvas:!!document.querySelector('#battlefield3d'),
      modeButton:!!document.querySelector('#renderModeBtn'),
      mobile:window.__MOBILE_RENDER_BUDGET_V1__?.state()?.mobile,
      touchAction:getComputedStyle(document.querySelector('#game')).touchAction
    }));
    expect(result).toEqual({canvas:true,threeCanvas:false,modeButton:false,
      mobile:true,touchAction:'none'});
  }finally{await context.close();}
});
