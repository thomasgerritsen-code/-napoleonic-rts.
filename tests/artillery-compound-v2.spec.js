const { test, expect } = require('@playwright/test');

async function openArtilleryV2(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.RTS_SIM?.version==='0.7.1' &&
    window.NRTS?.subsystems.has('artillery') &&
    window.__RTS_DEBUG__?.selectForBattery
  ));
  return errors;
}

test('artillery cannon and crew move as one stable compound unit and deploy without jitter', async ({page}) => {
  const errors=await openArtilleryV2(page);
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(true);
    window.__RTS_DEBUG__.selectForBattery('france');
    makePlayerArtilleryBatteryV06();
    const reg=regiments.find(r=>!r.destroyed && r.side==='france' && groupKindV06(r)==='artillery');
    if(!reg) return {error:'no battery'};
    const cannon=artilleryForGroupV06(reg);
    const crew=artilleryCrewV06(reg).slice(0,2);
    selectWholeRegiment(reg);
    issueMoveWithFacingV06(cannon.x+120,cannon.y,0);

    const artillery=window.NRTS.subsystems.get('artillery');
    const samples=[];
    const localCrew=()=>{
      const facing=cannon.facing||0, cos=Math.cos(-facing), sin=Math.sin(-facing);
      return crew.map(member=>{
        const dx=member.x-cannon.x,dy=member.y-cannon.y;
        return {x:dx*cos-dy*sin,y:dx*sin+dy*cos};
      });
    };

    for(let i=0;i<160;i++){
      window.RTS_SIM.step(.125);
      const state=artillery.state(reg.id);
      const local=localCrew();
      samples.push({
        mode:state?.mode,
        blend:state?.travelBlend,
        displacement:state?.displacement,
        routeActive:state?.routeActive,
        cannonArrived:state?.cannonArrived,
        targetDistance:state?.targetDistance,
        pathIndex:state?.pathIndex,
        pathLength:state?.pathLength,
        cannonX:cannon.x,
        cannonY:cannon.y,
        local
      });
      const atTarget=Math.hypot(cannon.targetX-cannon.x,cannon.targetY-cannon.y)<5;
      if(atTarget && state?.mode==='deployed' && state.travelBlend<.04 && i>8) break;
    }

    let maxLocalStep=0;
    let maxSymmetryError=0;
    let modeChanges=0;
    for(let i=0;i<samples.length;i++){
      const a=samples[i];
      maxSymmetryError=Math.max(maxSymmetryError,
        Math.abs(a.local[0].x-a.local[1].x),
        Math.abs(a.local[0].y+a.local[1].y)
      );
      if(i){
        const p=samples[i-1];
        if(a.mode!==p.mode) modeChanges++;
        for(let j=0;j<2;j++){
          maxLocalStep=Math.max(maxLocalStep,Math.hypot(a.local[j].x-p.local[j].x,a.local[j].y-p.local[j].y));
        }
      }
    }

    return {
      sampleCount:samples.length,
      sawTravel:samples.some(s=>s.mode==='travel' && s.blend>.45),
      final:samples[samples.length-1],
      lastFive:samples.slice(-5),
      modeChanges,
      maxLocalStep,
      maxSymmetryError,
      distanceMoved:Math.hypot(samples[samples.length-1].cannonX-samples[0].cannonX,samples[samples.length-1].cannonY-samples[0].cannonY),
      subsystem:window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='artillery')
    };
  });

  expect(result.error).toBeUndefined();
  expect(result.subsystem?.meta?.phase).toBe('architecture-v2');
  expect(result.subsystem?.meta?.legacyBridge).toBe(false);
  expect(result.sawTravel).toBe(true);
  expect(result.distanceMoved).toBeGreaterThan(60);
  expect(result.modeChanges).toBeLessThanOrEqual(2);
  expect(result.maxLocalStep).toBeLessThan(8.5);
  expect(result.maxSymmetryError).toBeLessThan(.75);
  expect(result.final?.mode, JSON.stringify(result.lastFive)).toBe('deployed');
  expect(result.final?.blend, JSON.stringify(result.lastFive)).toBeLessThan(.05);
  expect(errors).toEqual([]);
});
