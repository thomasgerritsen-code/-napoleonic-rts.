const { test, expect } = require('@playwright/test');

// PRESERVATION IMPACT: none — instrumentation-only deterministic replay.
// Protected capabilities exercised: CORE-BOOT, CORE-ROUTES, CORE-FORMATIONS,
// CORE-REPLAY-DEBUG. No production locomotion, orders, mobile or renderer code changes.
const SEED = 18150916;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*p))];
}

test('MOVEMENT-CONTACT-V1 emits deterministic road/off-road locomotion metrics', async ({ page }) => {
  test.setTimeout(90_000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed0=>{
    let seed=seed0;
    Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  }, SEED);
  await page.goto('/?test=movement-contact-lab',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__RTS_DEBUG__&&window.NRTS_NAVIGATION_V2?.active));

  const raw=await page.evaluate(({seed})=>{
    window.__RTS_DEBUG__.setPeaceMode(true);
    const road=ROAD_NETWORK_V066.find(r=>r.id==='voie-du-moulin');
    const start=road.points[1];
    const end=road.points[Math.max(2,road.points.length-2)];
    const goal={x:end.x+180,y:end.y+95};
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    const reg=getRegiment(id);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(goal.x,goal.y,0);
    const members=()=>regimentMembers(reg).filter(u=>!u.dead);
    const center=()=>centroid(members());
    const initial=center();
    const initialDistance=Math.hypot(initial.x-goal.x,initial.y-goal.y);
    const initialPathLength=reg.path?.length||0;
    const pointSegmentDistance=(p,a,b)=>{
      const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y;
      const vv=vx*vx+vy*vy;
      const t=vv>0?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
      return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
    };
    const roadDistance=p=>{
      let best=Infinity;
      for(let i=1;i<road.points.length;i++) best=Math.min(best,pointSegmentDistance(p,road.points[i-1],road.points[i]));
      return best;
    };
    const exitDistance=p=>Math.hypot(p.x-end.x,p.y-end.y);
    const samples=[];
    let previous=null, previousHeading=null, stationary=0, maxStationary=0, reversals=0;
    let previousPathIndex=reg.pathIndex||0, roadExitStep=null, pathClearedStep=null, pathClearedRemaining=null;
    for(let step=0;step<2400;step++){
      window.RTS_SIM.step(.05);
      if(step%4!==0) continue;
      const ms=members(), c=center();
      const remaining=Math.hypot(c.x-goal.x,c.y-goal.y);
      if(pathClearedStep==null && initialPathLength>0 && !(reg.path?.length>0)) { pathClearedStep=step; pathClearedRemaining=remaining; }
      let speed=0, heading=null;
      if(previous){
        const dx=c.x-previous.x,dy=c.y-previous.y;
        speed=Math.hypot(dx,dy)/.2;
        if(speed>.5) heading=Math.atan2(dy,dx);
        stationary=speed<1?stationary+.2:0;
        maxStationary=Math.max(maxStationary,stationary);
      }
      let headingDelta=0;
      if(heading!=null&&previousHeading!=null){
        let d=heading-previousHeading;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;
        headingDelta=Math.abs(d);
        if(headingDelta>Math.PI*.65)reversals++;
      }
      if(heading!=null)previousHeading=heading;
      const radial=ms.map(u=>Math.hypot(u.x-c.x,u.y-c.y));
      const meanRadius=radial.reduce((a,b)=>a+b,0)/Math.max(1,radial.length);
      const spread=radial.map(r=>Math.abs(r-meanRadius));
      const pathIndex=reg.pathIndex||0;
      if(roadExitStep==null && exitDistance(c)<120) roadExitStep=step;
      samples.push({remaining,speed,headingDelta,meanFormationDeviation:spread.reduce((a,b)=>a+b,0)/Math.max(1,spread.length),p95FormationDeviation:spread.sort((a,b)=>a-b)[Math.floor(Math.max(0,spread.length-1)*.95)]||0,roadDistance:roadDistance(c),exitDistance:exitDistance(c),pathIndex,pathAdvanced:pathIndex>previousPathIndex});
      previousPathIndex=pathIndex;
      previous={x:c.x,y:c.y};
      if(remaining<55)break;
    }
    return {seed,ordersHash:'voie-du-moulin:road-exit:line-facing-0:v1',initialDistance,initialPathLength,samples,reversals,maxStationary,finalRemaining:samples.at(-1)?.remaining??initialDistance,pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,roadExitStep,pathClearedStep,pathClearedRemaining};
  }, {seed:SEED});

  const speeds=raw.samples.map(s=>s.speed).filter(Number.isFinite);
  const headingJitter=raw.samples.map(s=>s.headingDelta).filter(Number.isFinite);
  const meanDev=raw.samples.map(s=>s.meanFormationDeviation).filter(Number.isFinite);
  const p95Dev=raw.samples.map(s=>s.p95FormationDeviation).filter(Number.isFinite);
  const corridorErrors=raw.samples.map(s=>s.roadDistance).filter(Number.isFinite);
  const exitSamples=raw.roadExitStep==null?[]:raw.samples.filter((_,i)=>i*4>=raw.roadExitStep-80 && i*4<=raw.roadExitStep+160);
  const exitFormation=exitSamples.map(s=>s.p95FormationDeviation).filter(Number.isFinite);
  let startStopCycles=0;
  for(let i=2;i<speeds.length;i++) if(speeds[i-2]>5&&speeds[i-1]<1&&speeds[i]>5) startStopCycles++;
  const metrics={
    routeCompletion:+Math.max(0,Math.min(1,1-raw.finalRemaining/Math.max(1,raw.initialDistance))).toFixed(4),
    corridorErrorP95:+percentile(corridorErrors,.95).toFixed(2),
    headingJitter:+percentile(headingJitter,.95).toFixed(4),
    headingReversals:raw.reversals,
    startStopCycles,
    meanFormationDeviation:+(meanDev.reduce((a,b)=>a+b,0)/Math.max(1,meanDev.length)).toFixed(3),
    p95FormationDeviation:+percentile(p95Dev,.95).toFixed(3),
    roadExitP95FormationDeviation:+percentile(exitFormation,.95).toFixed(3),
    validRouteStationaryTime:+raw.maxStationary.toFixed(2),
    maxStall:+raw.maxStationary.toFixed(2)
  };
  const diagnostics={initialPathLength:raw.initialPathLength,pathLength:raw.pathLength,pathIndex:raw.pathIndex,pathProgress:+(raw.pathIndex/Math.max(1,raw.initialPathLength-1)).toFixed(3),finalRemaining:+raw.finalRemaining.toFixed(2),samples:raw.samples.length,roadExitObserved:raw.roadExitStep!=null,roadExitStep:raw.roadExitStep,pathAdvanceSamples:raw.samples.filter(s=>s.pathAdvanced).length,pathClearedStep:raw.pathClearedStep,pathClearedRemaining:raw.pathClearedRemaining==null?null:+raw.pathClearedRemaining.toFixed(2)};
  const report={seed:raw.seed,ordersHash:raw.ordersHash,rootCauseTrace:'A route/path release diagnostic; no production tuning',preservationImpact:'none',preservedCapabilities:['CORE-BOOT','CORE-ROUTES','CORE-FORMATIONS','CORE-REPLAY-DEBUG'],metrics,diagnostics};
  console.log('MOVEMENT_CONTACT_LAB',JSON.stringify(report));
  expect(raw.initialPathLength).toBeGreaterThan(0);
  expect(metrics.routeCompletion).toBeGreaterThan(.85);
  expect(metrics.headingReversals).toBeLessThan(4);
  expect(metrics.validRouteStationaryTime).toBeLessThan(5);
  expect(errors).toEqual([]);
});
