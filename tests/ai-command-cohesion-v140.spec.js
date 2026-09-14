const { test, expect } = require('@playwright/test');

test('AI command cohesion suppresses duplicate regiment intent and registers diagnostics', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COHESION_V140__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2350,850);
    const reg=getRegiment(id);
    window.__AI_COHESION_V140__.resetOrderCache();
    eval('elapsed=100');
    aiOrderReg(reg,{x:2100,y:820},'line',0);
    aiOrderReg(reg,{x:2106,y:824},'line',0.03);
    const stats=window.__AI_COHESION_V140__.stats();
    const diag=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='ai-command-cohesion-v140');
    return {stats,diag};
  });

  expect(result.stats.issued).toBeGreaterThanOrEqual(1);
  expect(result.stats.suppressed).toBeGreaterThanOrEqual(1);
  expect(result.stats.cachedOrders).toBeGreaterThanOrEqual(1);
  expect(result.diag?.meta?.phase).toBe('gameplay-v141');
  expect(errors).toEqual([]);
});

test('AI can leave MASS early once formations are actually assembled', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COHESION_V140__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    v05PeaceMode=false;
    const ids=[
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,760),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,1040)
    ];
    for(const u of units){
      if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;u.morale=30;}
      if(u.side==='britain'&&u.type!=='worker'){u.morale=100;u.hp=u.maxHp;}
    }
    eval('elapsed=100');
    window.__AI_COMMANDER_V1__.forceState('MASS');
    window.__AI_COMMANDER_V1__.tick();
    const rally=window.__AI_COMMANDER_V1__.state().regroupPoint;
    ids.forEach((id,i)=>{
      const reg=getRegiment(id);
      regimentMembers(reg).forEach((u,j)=>{
        u.x=rally.x+(i-1)*35+(j%3)*2;
        u.y=rally.y+(Math.floor(j/3)-1)*2;
        u.targetX=u.x;u.targetY=u.y;
      });
    });
    eval('elapsed=106.5');
    window.__AI_COMMANDER_V1__.tick();
    const state=window.__AI_COMMANDER_V1__.state();
    const stats=window.__AI_COHESION_V140__.stats();
    v05PeaceMode=true;
    return {state:state.state,stats,rally};
  });

  expect(result.rally).toBeTruthy();
  expect(result.state).toBe('ADVANCE');
  expect(result.stats.earlyAdvance).toBeGreaterThanOrEqual(1);
  expect(result.stats.lastReadiness).toBeGreaterThanOrEqual(.75);
});

test('AI chooses the less congested flank from actual enemy deployment', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COHESION_V140__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    v05PeaceMode=false;
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2360,900);
    const frenchId=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1600,900);
    const frenchReg=getRegiment(frenchId);
    eval('elapsed=130');
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    const target=window.__AI_COMMANDER_V1__.state().target;
    const tc=livingBuildings('britain').find(b=>b.type==='towncenter'&&b.complete);
    const d=aiDirection(tc,target);
    const members=regimentMembers(frenchReg);
    members.forEach((u,i)=>{
      const lateral=120+(i%5)*16;
      u.x=target.x-d.y*lateral;
      u.y=target.y+d.x*lateral;
      u.targetX=u.x;u.targetY=u.y;
    });
    aiTransition('FLANK');
    const state=window.__AI_COMMANDER_V1__.state();
    const stats=window.__AI_COHESION_V140__.stats();
    v05PeaceMode=true;
    return {flankSide:state.flankSide,pressure:stats.lastFlankPressure,evaluations:stats.flankEvaluations};
  });

  expect(result.evaluations).toBeGreaterThanOrEqual(1);
  expect(result.pressure?.samples).toBeGreaterThanOrEqual(2);
  expect(result.pressure.right).toBeGreaterThan(result.pressure.left);
  expect(result.flankSide).toBe(-1);
});

test('AI cohesion prunes stale cached orders without a background interval', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COHESION_V140__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2300,880);
    const reg=getRegiment(id);
    window.__AI_COHESION_V140__.resetOrderCache();
    eval('elapsed=200');
    aiOrderReg(reg,{x:2050,y:880},'line',0);
    const before=window.__AI_COHESION_V140__.stats();
    eval('elapsed=260');
    window.__AI_COHESION_V140__.cleanupOrderCache(true);
    const after=window.__AI_COHESION_V140__.stats();
    return {before,after};
  });

  expect(result.before.cachedOrders).toBeGreaterThanOrEqual(1);
  expect(result.after.cachedOrders).toBe(0);
  expect(result.after.cleanupRuns).toBeGreaterThan(result.before.cleanupRuns);
  expect(result.after.staleOrdersPruned).toBeGreaterThan(result.before.staleOrdersPruned);
});
