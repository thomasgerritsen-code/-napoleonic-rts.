'use strict';
const {test,expect}=require('@playwright/test');

test('v285 a distant British army stays in four-file march instead of attacking on a timer',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__AI_COMMANDER_V1__&&window.__RTS_DEBUG__?.createFreshInfantryRegiment&&window.__AI_ORDER_DISCIPLINE_V1322__));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const result=await page.evaluate(()=>{
    gameOver=false;v05PeaceMode=false;
    for(const u of units){
      if(u.side==='france'&&u.type!=='worker'){
        u.x=220;u.y=650;u.targetX=u.x;u.targetY=u.y;
        u.morale=45;
      }
    }
    const ids=[
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',7250,4100),
      window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',7280,4250)
    ];
    for(const u of units)if(u.side==='britain'&&u.type!=='worker'){u.morale=100;u.hp=u.maxHp;}
    eval('elapsed=100');
    window.__AI_COMMANDER_V1__.forceState('ADVANCE');
    eval('elapsed+=20');
    aiMilitaryOrder(); // exercise the actual ordered AI wrapper, including order discipline
    const state=window.__AI_COMMANDER_V1__.state();
    const regs=ids.map(id=>getRegiment(id));
    const destinations=regs.map(r=>({
      id:r?.id,
      formation:r?.aiOrderDisciplineV1322?.formation??null,
      distance:Math.hypot(aiRegCenter(r).x-state.target.x,aiRegCenter(r).y-state.target.y),
      crossingIds:(r?.routeCrossingsV067||[]).map(c=>c.id)
    }));
    v05PeaceMode=true;
    return{state:state.state,destinations,world:{width:WORLD.width,height:WORLD.height},aiPlan};
  });
  console.log('V285_LONG_MARCH',JSON.stringify(result));
  expect(errors).toEqual([]);
  expect(result.world.width).toBeGreaterThanOrEqual(8000);
  expect(result.state).toBe('ADVANCE');
  expect(result.destinations).toHaveLength(2);
  expect(result.destinations.every(d=>d.distance>2000)).toBe(true);
  expect(result.destinations.every(d=>d.formation==='column')).toBe(true);
  expect(result.aiPlan).toContain('marsorde');
});
