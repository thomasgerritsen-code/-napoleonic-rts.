const {test,expect}=require('@playwright/test');

test('v268 fired 2D smoke drifts in self-changing wind, while musket drawing preserves unit position',async({page})=>{
  test.setTimeout(130000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_WIND_V267__&&
    window.__COMBAT_ANIMATIONS_V1__&&window.__CHARACTER_VISUALS_V2__&&
    window.__BATTLEFIELD_3D_V1__));
  await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    gameOver=false;
    const smoke=window.__COMBAT_ANIMATIONS_V1__;
    const wind=window.__MAP_AMBIENT_MOTION_V1__;
    const visuals=window.__CHARACTER_VISUALS_V2__;
    const shooter=createUnit('france','infantry',975,700);
    const target=createUnit('britain','infantry',1035,700);
    shooter.reload=-1;target.reload=999;
    const before={x:shooter.x,y:shooter.y};
    const startWind=wind.currentWind();
    fire(shooter,target);shooter.reload=999;
    const poseAtShot=visuals.musketPose(shooter);
    drawUnit(shooter);
    const afterDraw={x:shooter.x,y:shooter.y};
    const origin=smoke.smokeSnapshot().find(s=>s.kind==='musket'&&
      Math.hypot(s.origin.x-shooter.x,s.origin.y-shooter.y)<50);
    const born=origin?.born;
    for(let i=0;i<30;i++){
      window.RTS_SIM.step(.05);
      if(i%4===0)smoke.smokeSnapshot();
    }
    const mid=smoke.smokeSnapshot().find(s=>s.born===born&&s.kind==='musket');
    const poseAfter=visuals.musketPose(shooter);
    for(let i=0;i<30;i++){
      window.RTS_SIM.step(.05);
      if(i%4===0)smoke.smokeSnapshot();
    }
    const end=smoke.smokeSnapshot().find(s=>s.born===born&&s.kind==='musket');
    const endWind=wind.currentWind();
    const beforeFinalDraw={x:shooter.x,y:shooter.y};
    drawUnit(shooter);drawParticles();
    const afterFinalDraw={x:shooter.x,y:shooter.y};
    const first={x:mid.center.x-origin.center.x,y:mid.center.y-origin.center.y};
    const second={x:end.center.x-mid.center.x,y:end.center.y-mid.center.y};
    const forwardFirst=first.x*startWind.x+first.y*startWind.y;
    const forwardSecond=second.x*endWind.x+second.y*endWind.y;
    return{
      before,afterDraw,beforeFinalDraw,afterFinalDraw,
      poseAtShot,poseAfter,startWind,endWind,forwardFirst,forwardSecond,
      first,second,smokeLife:origin.life,
      smokeStats:smoke.smokeStats(),
      windIsAutomatic:wind.automaticWind,
      manualSetterType:typeof wind.setWindDirection,
      windDisplay:window.__TOPDOWN_WIND_V267__?.version
    };
  });
  console.log('V268_AUTO_WIND_SMOKE',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.windDisplay).toBe('268.0');
  expect(result.windIsAutomatic).toBe(true);
  expect(result.manualSetterType).toBe('undefined');
  expect(result.poseAtShot.phase).toBe('fire');
  expect(result.poseAfter.phase).not.toBe('fire');
  expect(result.afterDraw).toEqual(result.before);
  expect(result.afterFinalDraw).toEqual(result.beforeFinalDraw);
  expect(result.smokeLife).toBeGreaterThanOrEqual(6);
  expect(result.forwardFirst).toBeGreaterThan(20);
  expect(result.forwardSecond).toBeGreaterThan(20);
  expect(Math.hypot(result.first.x,result.first.y)).toBeGreaterThan(20);
  expect(result.smokeStats.active).toBeGreaterThan(0);
  expect(result.smokeStats.active).toBeLessThanOrEqual(result.smokeStats.cap);
});

test('v268 wind changes autonomously, smoothly, deterministically with no manual button',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_WIND_V267__&&window.__BATTLEFIELD_3D_V1__));
  await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  const indicator=page.locator('#topdown-wind-direction-v267');
  await expect(indicator).toBeVisible();
  const before=await page.evaluate(()=>{
    const a=window.__MAP_AMBIENT_MOTION_V1__;
    const ui=window.__TOPDOWN_WIND_V267__;
    const heading=w=>Math.atan2(w.y,w.x);
    const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
    const first=heading(a.currentWind(0));
    const later=[25,65,110,170].map(t=>heading(a.currentWind(t)));
    let maxSmallStep=0;
    for(let t=0;t<180;t+=.25){
      maxSmallStep=Math.max(maxSmallStep,
        Math.abs(delta(heading(a.currentWind(t+.25)),heading(a.currentWind(t)))));
    }
    const replay=a.currentWind(65);
    const replayAgain=a.currentWind(65);
    const currentBearing=ui.bearing();
    return{
      tag:document.getElementById('topdown-wind-direction-v267').tagName,
      focusable:document.getElementById('topdown-wind-direction-v267').tabIndex,
      text:document.getElementById('topdown-wind-direction-v267').textContent,
      buttonCount:document.querySelectorAll('button#topdown-wind-direction-v267').length,
      degreesAtZero:first,degreesLater:later.map(v=>delta(v,first)),
      maxSmallStep,deterministic:JSON.stringify(replay)===JSON.stringify(replayAgain),
      currentBearing,manualSetterType:typeof a.setWindDirection
    };
  });
  expect(before.tag).toBe('SPAN');
  expect(before.buttonCount).toBe(0);
  expect(before.focusable).toBe(-1);
  expect(before.text).toMatch(/^Wind [↗→↘↓↙←↖↑]$/);
  expect(before.manualSetterType).toBe('undefined');
  expect(before.deterministic).toBe(true);
  expect(Math.max(...before.degreesLater.map(Math.abs))).toBeGreaterThan(.4);
  expect(before.maxSmallStep).toBeLessThan(.03);
  await indicator.dispatchEvent('click');
  const afterClick=await page.evaluate(()=>window.__TOPDOWN_WIND_V267__.bearing());
  expect(afterClick).toBeCloseTo(before.currentBearing,6);
  const animated=await page.evaluate(()=>{
    const ui=window.__TOPDOWN_WIND_V267__;
    const before=ui.bearing();
    for(let i=0;i<120;i++)window.RTS_SIM.step(.05);
    ui.refresh();
    const indicator=document.getElementById('topdown-wind-direction-v267');
    return{before,after:ui.bearing(),text:indicator.textContent,hidden:indicator.hidden,
      label:indicator.getAttribute('aria-label')};
  });
  expect(animated.after).not.toBeCloseTo(animated.before,2);
  expect(animated.hidden).toBe(false);
  expect(animated.label).toContain('Automatische windrichting');
  await page.evaluate(()=>{window.__BATTLEFIELD_3D_V1__.setEnabled(true);drawParticles();});
  await expect(indicator).toBeHidden();
  expect(errors).toEqual([]);
});
