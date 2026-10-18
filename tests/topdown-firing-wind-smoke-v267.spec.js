const {test,expect}=require('@playwright/test');

test('v267 2D musket fire pose and wind-advection integrate without moving simulation',async({page})=>{
  test.setTimeout(130000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_WIND_V267__&&window.__COMBAT_ANIMATIONS_V1__&&window.__CHARACTER_VISUALS_V2__&&window.__BATTLEFIELD_3D_V1__));
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
    wind.setWindDirection(0);
    const before={x:shooter.x,y:shooter.y,facing:shooter.facing,
      reload:shooter.reload,enemyHp:target.hp};
    fire(shooter,target);shooter.reload=999;
    const afterFire={x:shooter.x,y:shooter.y};
    const poseAtShot=visuals.musketPose(shooter);
    drawUnit(shooter);
    const afterDraw={x:shooter.x,y:shooter.y};
    const origin=smoke.smokeSnapshot().find(s=>s.kind==='musket'&&
      Math.hypot(s.origin.x-shooter.x,s.origin.y-shooter.y)<50);
    const born=origin?.born;
    for(let i=0;i<30;i++)window.RTS_SIM.step(.05);
    const midway=smoke.smokeSnapshot().find(s=>s.born===born&&s.kind==='musket');
    const poseAfter=visuals.musketPose(shooter);
    const midPosition={x:midway?.center.x,y:midway?.center.y};
    wind.setWindDirection(90);
    for(let i=0;i<30;i++)window.RTS_SIM.step(.05);
    const ending=smoke.smokeSnapshot().find(s=>s.born===born&&s.kind==='musket');
    const endPosition={x:ending?.center.x,y:ending?.center.y};
    const oldPos={x:shooter.x,y:shooter.y};
    drawUnit(shooter);drawParticles();
    const afterFinalDraw={x:shooter.x,y:shooter.y};
    return{before,afterFire,afterDraw,afterFinalDraw,oldPos,
      poseAtShot,poseAfter,midPosition,endPosition,
      displacement:{firstX:midPosition.x-origin?.center.x||0,secondY:endPosition.y-midPosition.y||0,
        secondX:endPosition.x-midPosition.x||0},
      smokeStats:smoke.smokeStats(),windNow:wind.currentWind(),
      oldWindVelocity:origin?.drift,hasDirectionControl:!!document.getElementById('topdown-wind-direction-v267'),
      api:window.__TOPDOWN_WIND_V267__?.version,
      smokeLife:origin?.life,smokeCount:smoke.smokeSnapshot().length};
  });
  console.log('V267_SMOKE_AND_MUSKET',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.api).toBe('267.0');
  expect(result.hasDirectionControl).toBe(true);
  expect(result.poseAtShot.phase).toBe('fire');
  expect(result.poseAtShot.shoulder).toBe(1);
  expect(result.poseAfter.phase).not.toBe('fire');
  expect(result.afterDraw).toEqual(result.afterFire);
  expect(result.afterFinalDraw).toEqual(result.oldPos);
  expect(result.smokeLife).toBeGreaterThanOrEqual(6);
  expect(result.displacement.firstX).toBeGreaterThan(25);
  expect(result.displacement.secondY).toBeGreaterThan(25);
  expect(Math.abs(result.displacement.secondX)).toBeLessThan(1);
  expect(result.smokeStats.active).toBeGreaterThan(0);
  expect(result.smokeStats.active).toBeLessThanOrEqual(result.smokeStats.cap);
  expect(Math.abs(result.windNow.x)).toBeLessThan(.01);
  expect(result.windNow.y).toBeGreaterThan(.99);
});

test('v267 wind button rotates smoke flow 45 degrees only in 2D',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__TOPDOWN_WIND_V267__&&window.__BATTLEFIELD_3D_V1__));
  await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  const button=page.locator('#topdown-wind-direction-v267');
  await expect(button).toBeVisible();
  const first=await page.evaluate(()=>window.__TOPDOWN_WIND_V267__.bearing());
  await button.click();
  const second=await page.evaluate(()=>window.__TOPDOWN_WIND_V267__.bearing());
  expect((second-first+360)%360).toBeCloseTo(45,4);
  const after2d=await button.textContent();
  expect(after2d).toMatch(/^Wind [↗→↘↓↙←↖↑]$/);
  await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.setEnabled(true));
  await button.click();
  const third=await page.evaluate(()=>window.__TOPDOWN_WIND_V267__.bearing());
  expect(third).toBeCloseTo(second,5);
  expect(errors).toEqual([]);
});
