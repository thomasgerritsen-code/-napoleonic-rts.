const { test, expect } = require('@playwright/test');

test('v290 retreating infantry genuinely rally, regain morale and return to readiness',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__REGROUP_V290__?.stats &&
    window.__ORDERLY_FALLBACK_V289__?.state &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment));

  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(false);
    const api=window.__REGROUP_V290__;
    // Choose safe ground dynamically; the big V7 map must not be hardcoded to
    // a former river, bridge or road location.
    let land=null;
    for(let x=4600;x<=5800&&!land;x+=160)for(let y=220;y<=900&&!land;y+=130){
      if(!waterAtV067(x,y)&&!waterAtV067(x-180,y)&&
          !(typeof roadAtV064==='function'&&roadAtV064(x,y))&&
          !segmentCrossesBlockedWaterV067(x,y,x-180,y))land={x,y};
    }
    if(!land)return {land:null};
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',land.x,land.y);
    const reg=getRegiment(id),members=regimentMembers(reg);
    members.forEach(u=>u.morale=33);
    reg.morale=43;
    reg.movementPhaseV063='combat-halt';
    reg.engagementV069={mode:'fire',heading:0};
    reg.path=null;
    refreshRegiment(reg); // real v289 fallback + v290 observer
    const ordered=api.state(reg);
    const goal={...reg.finalTarget};
    const fallback=window.__ORDERLY_FALLBACK_V289__.state(reg);
    const afterOrder=api.stats();

    // A moving anchor is not enough: one-quarter of the ranks are not in
    // their slots yet. The regiment must not recover prematurely.
    for(let i=0;i<members.length;i++){
      const u=members[i];
      u.x=goal.x+(i%4-1.5)*13;
      u.y=goal.y+(Math.floor(i/4)-2)*13;
      u.targetX=u.x;u.targetY=u.y;
      u.morale=33;
    }
    for(let i=0;i<5;i++)members[i].targetX+=120;
    elapsed+=.25;
    refreshRegiment(reg);
    const incomplete=api.state(reg);
    const beforeRecovery=api.stats();

    for(let i=0;i<5;i++)members[i].targetX=members[i].x;
    elapsed+=.25;refreshRegiment(reg);
    const rally=api.state(reg);
    const positionsBefore=members.map(u=>({id:u.id,x:u.x,y:u.y}));
    const initialMorale=members[0].morale;
    for(let i=0;i<104;i++){elapsed+=.25;refreshRegiment(reg);}
    const complete=api.state(reg);
    const afterRecovery=api.stats();
    const positionsAfter=members.map(u=>({id:u.id,x:u.x,y:u.y}));
    const regroupTarget={...reg.finalTarget};
    const returnToDuty=reg.orderlyFallbackV289 || null;
    return{land,ordered,goal,fallback,afterOrder,incomplete,beforeRecovery,
      rally,initialMorale,complete,afterRecovery,positionsBefore,positionsAfter,
      regroupTarget,returnToDuty,regimentMorale:reg.morale,
      stateRegistered:NRTS.subsystems.has('regroup-v290')};
  });
  expect(errors).toEqual([]);
  expect(result.land).toBeTruthy();
  expect(result.stateRegistered).toBe(true);
  expect(result.ordered.phase).toBe('withdrawing');
  expect(result.fallback).toBeTruthy();
  expect(result.incomplete.phase).toBe('withdrawing');
  expect(result.beforeRecovery.rallies).toBe(result.afterOrder.rallies);
  expect(result.rally.phase).toBe('regrouping');
  expect(result.complete.phase).toBe('ready');
  expect(result.complete.readyAt).toBeGreaterThan(result.complete.rallyAt+4);
  expect(result.afterRecovery.completed).toBeGreaterThan(0);
  expect(result.afterRecovery.restoredMorale).toBeGreaterThan(0);
  expect(result.regimentMorale).toBeGreaterThanOrEqual(62);
  expect(result.positionsAfter).toEqual(result.positionsBefore);
  expect(result.regroupTarget).toEqual(result.goal);
  expect(result.returnToDuty).toBeNull();
});

test('v290 threats pause recovery and new commands cancel the rally',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__REGROUP_V290__?.stats &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment));
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(false);
    let land=null;
    for(let x=4800;x<=5900&&!land;x+=120)for(let y=250;y<=1000&&!land;y+=100)
      if(!waterAtV067(x,y)&&!waterAtV067(x-180,y)&&
       !(typeof roadAtV064==='function'&&roadAtV064(x,y))&&
       !segmentCrossesBlockedWaterV067(x,y,x-180,y))land={x,y};
    if(!land)return{land:null};
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',land.x,land.y);
    const reg=getRegiment(id),members=regimentMembers(reg);
    members.forEach(u=>u.morale=33);
    reg.morale=43;reg.movementPhaseV063='combat-halt';
    reg.engagementV069={mode:'fire',heading:0};
    refreshRegiment(reg);
    const goal={...reg.finalTarget};
    members.forEach((u,i)=>{
      u.x=goal.x+(i%4-1.5)*12;u.y=goal.y+Math.floor(i/4)*9;
      u.targetX=u.x;u.targetY=u.y;
    });
    const enemy=createUnit('britain','infantry',goal.x+60,goal.y);
    const initialMorale=members[0].morale;
    for(let i=0;i<36;i++){elapsed+=.25;refreshRegiment(reg);}
    const blocked=window.__REGROUP_V290__.state(reg);
    const moraleDuringThreat=members[0].morale;
    enemy.dead=true;
    elapsed+=.25;refreshRegiment(reg);
    const resumed=window.__REGROUP_V290__.state(reg);
    const statsBeforeInterrupt=window.__REGROUP_V290__.stats();
    reg.finalTarget={x:goal.x+450,y:goal.y+300}; // explicit external order
    elapsed+=.25;refreshRegiment(reg);
    const canceled=window.__REGROUP_V290__.state(reg);
    const statsAfterInterrupt=window.__REGROUP_V290__.stats();
    return{land,blocked,moraleDuringThreat,initialMorale,resumed,canceled,
      statsBeforeInterrupt,statsAfterInterrupt,retreat:reg.orderlyFallbackV289||null,
      commandTarget:reg.finalTarget};
  });
  expect(errors).toEqual([]);
  expect(result.land).toBeTruthy();
  expect(result.blocked.phase).not.toBe('ready');
  expect(result.moraleDuringThreat).toBeCloseTo(result.initialMorale,6);
  expect(result.resumed.phase).toBe('regrouping');
  expect(result.canceled.phase).toBe('interrupted');
  expect(result.retreat).toBeNull();
  expect(result.statsAfterInterrupt.interrupted).toBe(result.statsBeforeInterrupt.interrupted+1);
  expect(result.commandTarget.x).toBeGreaterThan(result.canceled.goal.x+100);
  expect(errors).toEqual([]);
});
