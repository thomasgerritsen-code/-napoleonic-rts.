const{test,expect}=require('@playwright/test');

test('v269 black-powder plume is a directed muzzle jet followed by rolling billows and wind drift',async({page})=>{
  test.setTimeout(100000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__COMBAT_ANIMATIONS_V1__&&!!window.__BATTLEFIELD_3D_V1__);
  await page.evaluate(()=>window.__BATTLEFIELD_3D_V1__.setEnabled(false));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const effects=window.__COMBAT_ANIMATIONS_V1__,wind=window.__MAP_AMBIENT_MOTION_V1__;
    const shooter=createUnit('france','infantry',975,700);
    const target=createUnit('britain','infantry',1040,700);
    shooter.reload=-1;target.reload=999;
    const before={x:shooter.x,y:shooter.y};
    const baseline=effects.smokeStats();
    fire(shooter,target);shooter.reload=999;
    const muzzle=effects.smokeSnapshot().at(-1);
    let drawn=0;
    const originalEllipse=ctx.ellipse;
    ctx.ellipse=function(...args){drawn++;return originalEllipse.apply(this,args)};
    const frames=[{age:0,profile:muzzle.profile,center:muzzle.center}];
    for(const [steps,age] of [[3,.15],[10,.65],[33,2.3],[41,4.35]]){
      while(elapsed-muzzle.born<age-.00001){window.RTS_SIM.step(.05)}
      const snap=effects.smokeSnapshot().find(s=>s.born===muzzle.born&&s.kind==='musket');
      drawParticles();
      frames.push({age:Math.round((elapsed-muzzle.born)*100)/100,profile:snap?.profile,center:snap?.center});
    }
    ctx.ellipse=originalEllipse;
    const final={x:shooter.x,y:shooter.y};
    const state=effects.smokeStats();
    return{before,final,baseline,state,frames,drawn,wind:wind.currentWind(),
      features:[...effects.features],mouth:muzzle.origin,life:muzzle.life};
  });
  console.log('V269_SMOKE_STAGES',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.life).toBeGreaterThan(6);
  expect(result.final).toEqual(result.before);
  expect(result.frames.map(f=>f.profile.stage)).toEqual([
    'muzzle-jet','muzzle-jet','billowing','wind-drift','wind-drift']);
  expect(result.frames[1].profile.jetReach).toBeGreaterThan(50);
  expect(result.frames[2].profile.jetReach).toBeLessThan(result.frames[1].profile.jetReach);
  expect(result.frames[3].profile.breadth).toBeGreaterThan(result.frames[1].profile.breadth);
  expect(result.frames[3].profile.radius).toBeGreaterThan(result.frames[1].profile.radius);
  expect(result.frames[3].profile.opacity).toBeGreaterThan(result.frames[4].profile.opacity);
  expect(result.frames[0].profile.panIntensity).toBe(1);
  expect(result.frames[2].profile.panIntensity).toBeGreaterThan(0);
  expect(result.frames[3].profile.panIntensity).toBe(0);
  expect(result.frames[4].center.x).not.toBeCloseTo(result.frames[0].center.x,1);
  expect(result.drawn).toBeGreaterThan(20);
  expect(result.state.active).toBeLessThanOrEqual(result.state.cap);
  expect(result.features).toContain('flintlock-pan-puff');
  expect(result.features).toContain('directed-jet-then-billow');
});

test('v269 pooled regiment volleys create one broad smoke bank and cannon remains separately pooled',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__COMBAT_ANIMATIONS_V1__&&!!window.__BATTLEFIELD_3D_V1__);
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    window.__BATTLEFIELD_3D_V1__.setEnabled(false);
    const api=window.__COMBAT_ANIMATIONS_V1__;
    const target=createUnit('britain','infantry',1200,800);
    target.reload=1000;
    const shooters=[];
    for(let i=0;i<16;i++){
      const u=createUnit('france','infantry',1030,645+i*15);
      u.regimentId=999999;
      u.reload=-1;
      shooters.push(u);
    }
    for(const u of shooters){fire(u,target);u.reload=999}
    const smoke=api.smokeSnapshot(),bank=smoke.find(s=>s.kind==='musket'&&s.count===16);
    const cannon=createUnit('france','artillery',900,900);
    const cannonShape=api.smokeProfile({kind:'artillery',life:7.1,count:1},.15);
    const soldierShape=api.smokeProfile({kind:'musket',life:6.1,count:1},.15);
    drawParticles();
    return{smokeCount:smoke.length,bank,bankLength:bank?.count,
      stats:api.smokeStats(),cannonShape,soldierShape,
      muzzleOrigins:shooters.map(u=>[u.x,u.y])};
  });
  console.log('V269_VOLLEY_BANK',JSON.stringify({bankLength:result.bankLength,bankProfile:result.bank?.profile,stats:result.stats}));
  expect(errors).toEqual([]);
  expect(result.bankLength).toBe(16);
  expect(result.stats.maxPooledShots).toBeGreaterThanOrEqual(16);
  expect(result.bank.profile.breadth).toBeGreaterThan(result.soldierShape.breadth);
  expect(result.bank.profile.panIntensity).toBe(1);
  expect(result.cannonShape.jetReach).toBeGreaterThan(result.soldierShape.jetReach);
  expect(result.stats.active).toBeLessThanOrEqual(result.stats.cap);
});
