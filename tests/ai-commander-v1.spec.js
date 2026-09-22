const { test, expect } = require('@playwright/test');

test('AI Commander progresses through mass, advance, attack and flank while production stays independent', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COMMANDER_V1__ && window.NRTS?.subsystems.has('ai-commander')));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    messageEl.classList.add('hidden');
    v05PeaceMode=false;
    for(const u of units){
      if(u.side==='france' && u.type!=='worker'){
        u.x=120; u.y=120; u.targetX=120; u.targetY=120;
      }
    }
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,720);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,1080);
    for(const u of units){
      if(u.side==='britain' && u.type!=='worker'){u.morale=100;u.hp=u.maxHp;}
      if(u.side==='france' && u.type!=='worker'){u.morale=35;}
    }
    eval('elapsed=60');

    const states=[];
    window.__AI_COMMANDER_V1__.forceState('DEFEND');
    window.__AI_COMMANDER_V1__.tick();
    states.push(window.__AI_COMMANDER_V1__.state().state);

    eval('elapsed+=10');
    window.__AI_COMMANDER_V1__.tick();
    states.push(window.__AI_COMMANDER_V1__.state().state);

    eval('elapsed+=13');
    window.__AI_COMMANDER_V1__.tick();
    states.push(window.__AI_COMMANDER_V1__.state().state);

    eval('elapsed+=19');
    window.__AI_COMMANDER_V1__.tick();
    states.push(window.__AI_COMMANDER_V1__.state().state);

    const diag=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='ai-commander');
    const state=window.__AI_COMMANDER_V1__.state();
    const game=window.__RTS_DEBUG__.getState();
    v05PeaceMode=true;
    return {
      states,
      diag,
      state,
      plan:game.aiPlan || document.querySelector('#aiPlan')?.textContent || '',
      britishGroups:game.britain.groups.length,
      productionStillExists:typeof aiDevelop==='function' && typeof aiQueue==='function'
    };
  });

  expect(result.states).toEqual(['MASS','ADVANCE','ATTACK','FLANK']);
  expect(result.diag?.meta?.phase).toBe('architecture-v2');
  expect(result.diag?.meta?.legacyBridge).toBe(false);
  expect(result.state.wave).toBeGreaterThanOrEqual(1);
  expect(result.state.target).toBeTruthy();
  expect(result.state.reserveRegimentId).toBeTruthy();
  expect(result.britishGroups).toBeGreaterThanOrEqual(2);
  expect(result.productionStillExists).toBe(true);
  expect(errors).toEqual([]);
});

test('AI Commander retreats on collapsed morale instead of blindly attacking', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COMMANDER_V1__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const state=await page.evaluate(()=>{
    gameOver=false;
    messageEl.classList.add('hidden');
    v05PeaceMode=false;

    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900);
    const reg=getRegiment(id);
    for(const u of regimentMembers(reg))u.morale=22;
    reg.morale=22;
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;}}
    eval('elapsed=70');
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    const result=window.__AI_COMMANDER_V1__.state();
    v05PeaceMode=true;
    return result;
  });
  expect(state.state).toBe('RETREAT');
  expect(state.retreatUntil).toBeGreaterThan(70);
  expect(state.reserveRegimentId).toBeNull();
});

test('AI Commander tracks urgent base threats and keeps a reserve during a three-regiment attack', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COMMANDER_V1__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;
    messageEl.classList.add('hidden');
    v05PeaceMode=false;

    const british=[];
    british.push(window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,720));
    british.push(window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900));
    british.push(window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,1080));
    for(const u of units){if(u.side==='britain'&&u.type!=='worker'){u.morale=100;u.hp=u.maxHp;}}

    const tc=livingBuildings('britain').find(b=>b.type==='towncenter'&&b.complete);
    const frenchRegimentId=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',tc.x-220,tc.y);
    const frenchRegiment=getRegiment(frenchRegimentId);
    const frenchMembers=regimentMembers(frenchRegiment);
    frenchMembers.forEach((u,i)=>{
      u.x=tc.x-220-(i%4)*4;
      u.y=tc.y+(Math.floor(i/4)-1)*8;
      u.targetX=u.x;
      u.targetY=u.y;
    });
    const threat=window.__AI_COMMANDER_V1__.nearestThreat();

    eval('elapsed=90');
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    const defended=window.__AI_COMMANDER_V1__.state();

    for(const u of units){
      if(u.side==='france'&&u.type!=='worker'){
        u.x=120;u.y=120;u.targetX=120;u.targetY=120;
        u.morale=30;
      }
    }
    frenchMembers.forEach(u=>{u.morale=20;u.hp=Math.max(1,u.maxHp*.45);});
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    const attacked=window.__AI_COMMANDER_V1__.state();
    const target=window.__AI_COMMANDER_V1__.strategicTarget();
    v05PeaceMode=true;
    return {threat,defended,attacked,target,british,frenchRegimentId};
  });

  expect(result.threat.distance).toBeLessThan(300);
  expect(result.defended.state).toBe('DEFEND');
  expect(result.defended.threatDistance).toBeLessThan(300);
  expect(result.attacked.state).toBe('ATTACK');
  expect(result.attacked.reserveRegimentId).toBeTruthy();
  expect(result.british).toContain(result.attacked.reserveRegimentId);
  expect(result.target.kind).toBe('regiment');
  expect(result.target.id).toBe(result.frenchRegimentId);
  expect(typeof result.target.condition).toBe('number');
  expect(result.target.condition).toBeLessThan(0.6);
});


test('AI Commander retains a near-equal target but switches for a decisive advantage', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_COMMANDER_V1__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    gameOver=false;v05PeaceMode=false;
    activeRegiments('france').forEach(reg=>{reg.destroyed=true;});
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.dead=true;}}
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,820);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,980);
    const firstId=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1600,820);
    const secondId=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1540,980);
    const first=getRegiment(firstId),second=getRegiment(secondId);
    const place=(reg,x,y)=>regimentMembers(reg).forEach((u,i)=>{
      u.x=x+(i%4)*3;u.y=y+Math.floor(i/4)*3;u.targetX=u.x;u.targetY=u.y;u.morale=100;u.hp=u.maxHp;
    });
    place(first,1600,820);place(second,1540,980);
    eval('elapsed=100');
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    const initial=window.__AI_COMMANDER_V1__.state().target.id;

    place(first,1540,820);place(second,1580,980);
    const retained=window.__AI_COMMANDER_V1__.strategicTarget().id;

    place(first,900,820);place(second,1700,980);
    const switched=window.__AI_COMMANDER_V1__.strategicTarget().id;
    v05PeaceMode=true;
    return{firstId,secondId,initial,retained,switched};
  });

  expect(result.initial).toBe(result.firstId);
  expect(result.retained).toBe(result.firstId);
  expect(result.switched).toBe(result.secondId);
});
