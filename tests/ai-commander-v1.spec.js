const { test, expect } = require('@playwright/test');

test('AI Commander progresses through mass, advance, attack and flank while production stays independent', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COMMANDER_V1__ && window.NRTS?.subsystems.has('ai-commander')));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const result=await page.evaluate(()=>{
    // The normal battle can finish while the page is settling in CI. This regression owns its
    // command-state fixture, so make that fixture explicitly active before exercising the AI.
    gameOver=false;
    messageEl.classList.add('hidden');

    // This regression exercises the command-state lifecycle, not threat detection. Keep the
    // strategic safety inputs deterministic while leaving the production system untouched.
    for(const u of units){
      if(u.side==='france' && u.type!=='worker'){
        u.x=120; u.y=120; u.targetX=120; u.targetY=120;
      }
    }
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,720);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900);
    window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,1080);
    // Ensure the lifecycle test starts from a force ratio that is deliberately above the
    // retreat threshold; retreat behavior has its own dedicated regression below.
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
  expect(result.britishGroups).toBeGreaterThanOrEqual(2);
  expect(result.productionStillExists).toBe(true);
  expect(errors).toEqual([]);
});

test('AI Commander retreats on collapsed morale instead of blindly attacking', async ({ page }) => {
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.createFreshInfantryRegiment && window.__AI_COMMANDER_V1__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const state=await page.evaluate(()=>{
    // Keep this fixture independent from the lifecycle of the background battle.
    gameOver=false;
    messageEl.classList.add('hidden');

    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',2380,900);
    const reg=getRegiment(id);
    for(const u of regimentMembers(reg))u.morale=22;
    reg.morale=22;
    // Keep this regression focused on morale collapse rather than base-threat priority.
    for(const u of units){if(u.side==='france'&&u.type!=='worker'){u.x=120;u.y=120;u.targetX=120;u.targetY=120;}}
    eval('elapsed=70');
    window.__AI_COMMANDER_V1__.forceState('ATTACK');
    window.__AI_COMMANDER_V1__.tick();
    return window.__AI_COMMANDER_V1__.state();
  });
  expect(state.state).toBe('RETREAT');
  expect(state.retreatUntil).toBeGreaterThan(70);
});
