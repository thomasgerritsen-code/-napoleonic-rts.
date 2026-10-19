const {test,expect}=require('@playwright/test');

async function setup(page) {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__AI_REGROUP_RESERVE_V291__?.stats &&
    window.__REGROUP_V290__?.stats &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment));
  return errors;
}

test('v291 prevents attack orders from breaking regroup and respects manual/defensive override',async({page})=>{
  const errors=await setup(page);
  const result=await page.evaluate(()=>{
    __RTS_DEBUG__.setPeaceMode(false);
    elapsed=60;gameOver=false;
    const id=__RTS_DEBUG__.createFreshInfantryRegiment('britain',4800,1100);
    const reg=getRegiment(id);
    const rally={x:4650,y:1100};
    reg.morale=45;
    reg.finalTarget={...rally};
    reg.orderlyFallbackV289={startedAt:50,goal:{...rally},moraleAtOrder:43};
    reg.regroupV290={retreatAt:50,phase:'regrouping',rallyAt:58,goal:{...rally}};
    AI_COMMANDER_V1.state='ATTACK';
    const before=__AI_REGROUP_RESERVE_V291__.stats();
    aiOrderReg(reg,{x:5100,y:1150},'line',0);
    const protectedTarget={...reg.finalTarget};
    const protectedForm=reg.formation;
    AI_COMMANDER_V1.state='DEFEND';
    aiOrderReg(reg,{x:4780,y:1050},'line',0);
    const defendTarget={...reg.finalTarget};
    AI_COMMANDER_V1.state='ATTACK';
    // Direct player movement authority is not wrapped by the AI protection.
    orderGroupPathV06(reg,4790,1000,'line',0);
    const manualTarget={...reg.finalTarget};
    return{before,after:__AI_REGROUP_RESERVE_V291__.stats(),
      protectedTarget,protectedForm,defendTarget,manualTarget,rally};
  });
  expect(errors).toEqual([]);
  expect(result.protectedTarget).toEqual(result.rally);
  expect(result.after.protectedRallies).toBe(result.before.protectedRallies+1);
  expect(result.defendTarget).toEqual({x:4780,y:1050});
  expect(result.manualTarget).toEqual({x:4790,y:1000});
});

test('v291 recovered AI infantry support an officer-led front as reserve before rejoining attack',async({page})=>{
  const errors=await setup(page);
  const r=await page.evaluate(()=>{
    __RTS_DEBUG__.setPeaceMode(false);
    elapsed=100;gameOver=false;AI_COMMANDER_V1.state='ATTACK';
    const allyId=__RTS_DEBUG__.createFreshInfantryRegiment('britain',4850,1060);
    const recId=__RTS_DEBUG__.createFreshInfantryRegiment('britain',4640,1110);
    const ally=getRegiment(allyId),reg=getRegiment(recId);
    ally.morale=100;
    const friend=regimentMembers(ally);
    friend.forEach(u=>u.morale=100);
    reg.morale=67;
    const readyAt=95;
    reg.regroupV290={phase:'ready',retreatAt:55,readyAt,goal:{x:4520,y:1110}};
    const target={x:5600,y:1100};
    const before=__AI_REGROUP_RESERVE_V291__.stats();
    aiOrderReg(reg,target,'line',0);
    const reserved={target:{...reg.finalTarget},mode:reg.formation,
      chosenFriend:__AI_REGROUP_RESERVE_V291__.nearestSupport(reg)?.reg.id,
      state:reg.regroupV290.phase};
    aiOrderReg(reg,target,'line',0);
    const repeated=__AI_REGROUP_RESERVE_V291__.stats();
    elapsed=readyAt+17;
    aiOrderReg(reg,target,'line',0);
    const front={target:{...reg.finalTarget},mode:reg.formation};
    return{before,reserved,repeated,front,stats:__AI_REGROUP_RESERVE_V291__.stats(),
      allyId,recId,requested:target,canvas:{...WORLD}};
  });
  expect(errors).toEqual([]);
  expect(r.reserved.chosenFriend).toBe(r.allyId);
  expect(r.reserved.mode).toBe('column');
  expect(r.reserved.state).toBe('ready');
  expect(r.reserved.target.x).toBeLessThan(r.requested.x-350);
  expect(r.reserved.target.y).toBeGreaterThan(70);
  expect(r.reserved.target.x).toBeGreaterThan(70);
  expect(r.repeated.reserveOrders).toBeGreaterThan(r.before.reserveOrders);
  expect(r.front.target).toEqual(r.requested);
  expect(r.front.mode).toBe('line');
  expect(r.stats.frontlineReturns).toBeGreaterThan(r.before.frontlineReturns);
  expect(r.canvas.width).toBeGreaterThanOrEqual(8000);
});

test('v291 unsafe crossing, missing officer or absent ally hold returning AI in reserve',async({page})=>{
  const errors=await setup(page);
  const r=await page.evaluate(()=>{
    __RTS_DEBUG__.setPeaceMode(false);
    elapsed=120;gameOver=false;AI_COMMANDER_V1.state='ATTACK';
    const id=__RTS_DEBUG__.createFreshInfantryRegiment('britain',4700,1300);
    const reg=getRegiment(id),goal={x:4570,y:1300},assault={x:5350,y:1300};
    reg.finalTarget={...goal};
    reg.regroupV290={phase:'ready',readyAt:115,retreatAt:70,goal:{...goal}};
    reg.morale=65;
    const api=__AI_REGROUP_RESERVE_V291__;
    aiOrderReg(reg,assault,'line',0);
    const unsupported={...reg.finalTarget};
    reg.crossingTrafficV068={forcedColumn:true,state:'crossing',crossingId:'pont-crete'};
    aiOrderReg(reg,assault,'line',0);
    const crossing={...reg.finalTarget};
    reg.crossingTrafficV068=null;
    const officer=regimentMembers(reg).find(u=>u.id===reg.officerId);
    officer.dead=true;
    aiOrderReg(reg,assault,'line',0);
    const officerMissing={...reg.finalTarget};
    return{goal,unsupported,crossing,officerMissing,stats:api.stats()};
  });
  expect(errors).toEqual([]);
  expect(r.unsupported).toEqual(r.goal);
  expect(r.crossing).toEqual(r.goal);
  expect(r.officerMissing).toEqual(r.goal);
  expect(r.stats.unsupportedHolds).toBeGreaterThanOrEqual(1);
  expect(r.stats.bridgeHolds).toBeGreaterThanOrEqual(1);
  expect(r.stats.officerHolds).toBeGreaterThanOrEqual(1);
});
