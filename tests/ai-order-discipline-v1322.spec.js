const { test, expect } = require('@playwright/test');

test('AI order discipline suppresses repeated strategic orders instead of restarting regiment movement', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_ORDER_DISCIPLINE_V1322__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;v05PeaceMode=false;
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;u.morale=35;}}
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,760);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,1040);
    for(const u of units){if(u.side==='britain'&&u.type!=='worker'){u.morale=100;u.hp=u.maxHp;}}
    eval('elapsed=80');
    window.__AI_COMMANDER_V1__.forceState('ADVANCE');
    aiMilitaryOrder();
    const first=window.__AI_ORDER_DISCIPLINE_V1322__.stats();
    eval('elapsed+=1');
    window.__AI_COMMANDER_V1__.forceState('ADVANCE');
    aiMilitaryOrder();
    const second=window.__AI_ORDER_DISCIPLINE_V1322__.stats();
    v05PeaceMode=true;
    return{first,second,config:window.__AI_ORDER_DISCIPLINE_V1322__.config};
  });

  expect(result.first.ordersSeen).toBeGreaterThan(0);
  expect(result.second.ordersSeen).toBeGreaterThan(result.first.ordersSeen);
  expect(result.second.suppressed).toBeGreaterThan(result.first.suppressed);
  expect(result.config.orderTtl).toBeGreaterThan(4);
  expect(errors).toEqual([]);
});

test('AI columns deploy into a fighting formation before close contact', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_ORDER_DISCIPLINE_V1322__?.previewFormation));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;v05PeaceMode=false;
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2200,900);
    const reg=getRegiment(id);
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;}}
    const enemy=units.find(u=>u.side==='france'&&u.type!=='worker'&&!u.dead);
    const c=centroid(regimentMembers(reg));
    enemy.x=c.x+150;enemy.y=c.y;enemy.targetX=enemy.x;enemy.targetY=enemy.y;
    for(const u of regimentMembers(reg)){u.morale=100;u.hp=u.maxHp;}
    const before=window.__AI_ORDER_DISCIPLINE_V1322__.stats();
    const formation=window.__AI_ORDER_DISCIPLINE_V1322__.previewFormation(reg,'column');
    const after=window.__AI_ORDER_DISCIPLINE_V1322__.stats();
    v05PeaceMode=true;
    return{formation,before,after};
  });

  expect(result.formation).toBe('line');
  expect(result.after.threatFormationChanges).toBe(result.before.threatFormationChanges);
});

test('AI line and square formations reserve more front space than marching columns', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_ORDER_DISCIPLINE_V1322__?.formationSeparation));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2200,900);
    const reg=getRegiment(id);
    const api=window.__AI_ORDER_DISCIPLINE_V1322__;
    return{
      line:api.formationSeparation(reg,'line'),
      square:api.formationSeparation(reg,'square'),
      column:api.formationSeparation(reg,'column'),
      config:api.config
    };
  });

  expect(result.line).toBeGreaterThan(result.column+35);
  expect(result.square).toBeGreaterThan(result.column+40);
  expect(result.line).toBeGreaterThanOrEqual(result.config.lineBaseSeparation);
  expect(result.config.maxDeconflictPasses).toBe(3);
});

test('AI formation-aware spacing stays active during commander orders without browser errors', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_ORDER_DISCIPLINE_V1322__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;v05PeaceMode=false;
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;u.morale=30;}}
    for(let i=0;i<4;i++)window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,820+i*55);
    eval('elapsed=120');
    window.__AI_COMMANDER_V1__.forceState('ADVANCE');
    aiMilitaryOrder();
    const regs=activeRegiments('britain').filter(r=>r?.aiOrderDisciplineV1322);
    const orders=regs.map(r=>r.aiOrderDisciplineV1322);
    const minPairDistance=orders.length<2?Infinity:Math.min(...orders.flatMap((a,i)=>orders.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y))));
    const stats=window.__AI_ORDER_DISCIPLINE_V1322__.stats();
    v05PeaceMode=true;
    return{orders:orders.length,minPairDistance,stats};
  });

  expect(result.orders).toBeGreaterThanOrEqual(2);
  expect(result.minPairDistance).toBeGreaterThan(35);
  expect(result.stats.ordersSeen).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('AI order discipline is registered after movement authority and exposes bridge-safe spacing policy', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__AI_ORDER_DISCIPLINE_V1322__ &&
    window.NRTS?.diagnostics?.snapshot()?.subsystems?.some(s=>s.name==='ai-order-discipline')
  ));
  const result=await page.evaluate(()=>({
    loaded:Boolean(window.__AI_ORDER_DISCIPLINE_V1322__),
    subsystem:window.NRTS?.diagnostics?.snapshot()?.subsystems?.find(s=>s.name==='ai-order-discipline')||null,
    config:window.__AI_ORDER_DISCIPLINE_V1322__?.config||null
  }));
  expect(result.loaded).toBe(true);
  expect(result.subsystem?.meta?.phase).toBe('v1.4.2');
  expect(result.config.destinationSeparation).toBeGreaterThanOrEqual(90);
  expect(result.config.contactDeployRange).toBeGreaterThan(200);
  expect(result.config.lineBaseSeparation).toBeGreaterThan(result.config.columnBaseSeparation);
});