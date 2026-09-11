const { test, expect } = require('@playwright/test');

test('AI production uses central targets and keeps replenishing after attrition', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__AI_PRODUCTION_V125__ && window.NRTS_CONFIG?.ai));

  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__?.setPeaceMode?.(true);
    gameOver=false;
    messageEl.classList.add('hidden');

    economies.britain.food=12000;
    economies.britain.wood=12000;

    const tc=livingBuildings('britain').find(b=>b.type==='towncenter');
    if(tc){tc.complete=true;tc.queue.length=0;tc.production=0;}

    while(livingUnits('britain').filter(u=>u.type==='worker').length < NRTS_CONFIG.ai.minWorkers){
      createUnit('britain','worker',2520+Math.random()*40,820+Math.random()*40);
    }

    let barracks=livingBuildings('britain').filter(b=>b.type==='barracks');
    while(barracks.length<2){
      createBuilding('britain','barracks',2460-barracks.length*120,720,true);
      barracks=livingBuildings('britain').filter(b=>b.type==='barracks');
    }
    barracks.forEach(b=>{b.complete=true;b.queue.length=0;b.production=0;});
    if(!livingBuildings('britain').some(b=>b.type==='house')) createBuilding('britain','house',2500,1060,true);
    recalcPopCap('britain');

    // Remove existing British regiment bookkeeping and create a deliberately damaged field force.
    for(const reg of regiments){if(reg.side==='britain')reg.destroyed=true;}
    for(const u of livingUnits('britain')){if(u.regimentId)u.regimentId=null;}

    const makeReg=(x,y)=>{
      const members=[];
      for(let i=0;i<12;i++)members.push(createUnit('britain','infantry',x+(i%6)*18,y+Math.floor(i/6)*18));
      members.push(createUnit('britain','officer',x,y-28));
      members.push(createUnit('britain','drummer',x-20,y-28));
      return createRegiment('britain',members);
    };
    const healthy=makeReg(2380,820);
    const damaged=makeReg(2380,980);
    const damagedInf=regimentMembers(damaged).filter(u=>u.type==='infantry');
    damagedInf.slice(5).forEach(u=>u.dead=true);
    refreshRegiment(damaged);

    const before=window.__AI_PRODUCTION_V125__.snapshot();
    aiDevelop();
    const afterOne=window.__AI_PRODUCTION_V125__.snapshot();

    // Fill enough free troops to prove the replenishment loop forms a fresh regiment rather
    // than treating the damaged regiment object as a full-strength formation.
    for(let i=0;i<12;i++)createUnit('britain','infantry',2520+(i%6)*16,1020+Math.floor(i/6)*16);
    createUnit('britain','officer',2520,990);
    createUnit('britain','drummer',2500,990);
    aiDevelop();
    const afterForm=window.__AI_PRODUCTION_V125__.snapshot();

    const queues=barracks.map(b=>b.queue.length);
    const diag=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='ai-production');
    return {
      config:window.NRTS_CONFIG.ai,
      before,afterOne,afterForm,queues,
      diag,
      activeRegs:activeRegiments('britain').length,
      damagedReadiness:aiRegimentReadiness(damaged)
    };
  });

  expect(result.before.desiredRegiments).toBe(result.config.desiredInfantryRegiments);
  expect(result.before.queueLimit).toBe(result.config.productionQueueLimit);
  expect(result.before.desiredBarracks).toBeGreaterThanOrEqual(2);
  expect(result.before.lastReadiness).toBeLessThan(result.before.desiredRegiments);
  expect(result.afterOne.queued).toBeGreaterThan(result.before.queued);
  expect(Math.max(...result.queues)).toBeLessThanOrEqual(result.config.productionQueueLimit);
  expect(result.afterForm.formed).toBeGreaterThanOrEqual(1);
  expect(result.activeRegs).toBeGreaterThanOrEqual(3);
  expect(result.damagedReadiness).toBeLessThan(1);
  expect(result.diag?.meta?.legacyBridge).toBe(false);
  expect(errors).toEqual([]);
});
