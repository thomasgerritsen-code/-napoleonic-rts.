const {test,expect}=require('@playwright/test');

test('v289 wavering infantry fall back in formation, not over rivers or active bridge traffic',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__ORDERLY_FALLBACK_V289__?.eligible &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment));

  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(false);
    const api=window.__ORDERLY_FALLBACK_V289__;
    // Select clear land, avoiding fixed-map coordinates and all bridge corridors.
    let land=null;
    for(let x=4600;x<=5800&&!land;x+=160)for(let y=220;y<=900&&!land;y+=130){
      if(!waterAtV067(x,y)&&!waterAtV067(x-180,y)&&
          !(typeof roadAtV064==='function'&&roadAtV064(x,y))&&
          !segmentCrossesBlockedWaterV067(x,y,x-180,y)) land={x,y};
    }
    if(!land)return{land:null};
    function regimentAt(yOffset){
      const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',land.x,land.y+yOffset);
      const reg=getRegiment(id);
      if(!reg)return null;
      const soldiers=regimentMembers(reg);
      soldiers.forEach(u=>u.morale=33);
      reg.morale=43;
      reg.movementPhaseV063='combat-halt';
      reg.engagementV069={mode:'fire',heading:0};
      reg.path=null;
      return{reg,soldiers};
    }
    const cohort=regimentAt(0);
    if(!cohort)return{land,missingRegiment:true};
    const before=centroid(cohort.soldiers);
    const sourceFormation=cohort.reg.formation;
    const firstEligible=api.eligible(cohort.reg);
    refreshRegiment(cohort.reg);
    const after=centroid(cohort.soldiers);
    const first={
      destroyed:cohort.reg.destroyed,stillInLine:cohort.reg.formation==='line',
      state:api.state(cohort.reg),finalTarget:cohort.reg.finalTarget,
      morale:cohort.reg.morale,original:sourceFormation,
      manualUntil:cohort.reg.manualDisengageUntilV070,
      engaged:cohort.reg.engagementV069,pathLength:cohort.reg.path?.length||0
    };
    const statsAfter=api.stats();
    refreshRegiment(cohort.reg);
    const second=api.stats();

    // The same broken-looking regiment should not commandeer a reserved deck.
    const block=regimentAt(0);
    const bridge=block?.reg||null;
    if(bridge)bridge.crossingTrafficV068={forcedColumn:true,state:'crossing',crossingId:'pont-crete'};
    const bridgeEligible=bridge?api.eligible(bridge):null;
    if(bridge)refreshRegiment(bridge);
    const protectedState=bridge?api.state(bridge):null;

    return{land,firstEligible,before,after,first,statsAfter,second,
      bridgeEligible,protectedState,statsFinal:api.stats(),
      world:{...WORLD},
      installed:NRTS.subsystems.has('orderly-fallback-v289')};
  });

  expect(errors).toEqual([]);
  expect(result.land).toBeTruthy();
  expect(result.installed).toBe(true);
  expect(result.firstEligible).toBe(true);
  expect(result.first.destroyed).toBe(false);
  expect(result.first.state).toBeTruthy();
  expect(result.first.stillInLine).toBe(true);
  expect(result.first.state.moraleAtOrder).toBeGreaterThan(32);
  expect(result.first.state.moraleAtOrder).toBeLessThan(46);
  expect(result.first.finalTarget.x).toBeLessThan(result.before.x-110);
  expect(result.first.pathLength).toBeGreaterThan(0);
  expect(result.first.engaged).toBe(null);
  expect(result.after.x).toBeCloseTo(result.before.x,4);
  expect(result.after.y).toBeCloseTo(result.before.y,4);
  expect(result.statsAfter.withdrawals).toBeGreaterThanOrEqual(1);
  expect(result.second.withdrawals).toBe(result.statsAfter.withdrawals);
  expect(result.bridgeEligible).toBe(false);
  expect(result.protectedState).toBeNull();
  expect(result.world.width).toBeGreaterThanOrEqual(8000);
});
