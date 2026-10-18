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

    // v285: old (2460,720) fixture coordinates are now covered by the
    // expanded road/village exclusions. createBuilding() may return null.
    // Use bounded, base-relative positions rather than looping forever.
    const base=livingBuildings('britain').find(b=>b.type==='towncenter');
    const placeFixtureBuilding=(type)=>{
      for(let attempt=0;attempt<28;attempt++){
        const col=attempt%7,row=Math.floor(attempt/7);
        const x=base.x-350-col*85;
        const y=base.y+145+row*95;
        if(x<100||y>WORLD.height-100)continue;
        const created=createBuilding('britain',type,x,y,true);
        if(created)return created;
      }
      throw new Error('AI fixture cannot place '+type+' at the new British camp');
    };
    while(livingBuildings('britain').filter(b=>b.type==='barracks').length<2)
      placeFixtureBuilding('barracks');
    const barracks=livingBuildings('britain').filter(b=>b.type==='barracks');
    barracks.forEach(b=>{b.complete=true;b.queue.length=0;b.production=0;});

    // Give the deterministic fixture enough population headroom that this regression tests
    // replenishment rather than stopping on the deliberately separate house-building branch.
    while(livingBuildings('britain').filter(b=>b.type==='house'&&b.complete).length<3)
      placeFixtureBuilding('house');
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
    makeReg(2380,820);
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

    // Manual fixture units can consume the remaining cap. Keep the test focused on formation
    // logic and allow multiple one-action production cycles, matching the real AI cadence.
    recalcPopCap('britain');
    for(let i=0;i<12&&economies.britain.popCap-populationUsed('britain')<20;i++){
      placeFixtureBuilding('house');
      recalcPopCap('britain');
    }
    if(economies.britain.popCap-populationUsed('britain')<20)
      throw new Error('AI fixture could not establish 20 population headroom');
    const formedBefore=window.__AI_PRODUCTION_V125__.snapshot().formed;
    for(let i=0;i<6 && window.__AI_PRODUCTION_V125__.snapshot().formed===formedBefore;i++) aiDevelop();
    const afterForm=window.__AI_PRODUCTION_V125__.snapshot();

    const queues=barracks.map(b=>b.queue.length);
    const diag=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='ai-production');
    const facade=window.NRTS.subsystems.get('ai-production');
    return {
      config:window.NRTS_CONFIG.ai,
      before,afterOne,afterForm,queues,
      diag,
      activeRegs:activeRegiments('britain').length,
      damagedReadiness:aiRegimentReadiness(damaged),
      developCallable:typeof facade?.develop==='function'
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
  expect(result.developCallable).toBe(true);
  expect(result.diag?.meta?.legacyBridge).toBe(false);
  expect(errors).toEqual([]);
});
