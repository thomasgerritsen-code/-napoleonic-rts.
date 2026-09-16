const { test, expect } = require('@playwright/test');

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
    const goal={x:end.x+180,y:end.y+95}; // deliberate road exit: same deterministic A-E trace every run
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    const reg=getRegiment(id);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(goal.x,goal.y,0);
    const members=()=>regimentMembers(reg).filter(u=>!u.dead);
    const center=()=>centroid(members());
    const initial=center();
    const initialDistance=Math.hypot(initial.x-goal.x,initial.y-goal.y);
    const samples=[];
    let previous=null, previousHeading=null, stationary=0, maxStationary=0, reversals=0;
    for(let step=0;step<2400;step++){
      window.RTS_SIM.step(.05);
      if(step%4!==0) continue;
      const ms=members(), c=center();
      const remaining=Math.hypot(c.x-goal.x,c.y-goal.y);
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
      samples.push({remaining,speed,headingDelta,meanFormationDeviation:spread.reduce((a,b)=>a+b,0)/Math.max(1,spread.length),p95FormationDeviation:spread.sort((a,b)=>a-b)[Math.floor(Math.max(0,spread.length-1)*.95)]||0});
      previous={x:c.x,y:c.y};
      if(remaining<55)break;
    }
    return {seed,ordersHash:'voie-du-moulin:road-exit:line-facing-0:v1',initialDistance,samples,reversals,maxStationary,finalRemaining:samples.at(-1)?.remaining??initialDistance,pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0};
  }, {seed:SEED});

  const speeds=raw.samples.map(s=>s.speed).filter(Number.isFinite);
  const headingJitter=raw.samples.map(s=>s.headingDelta).filter(Number.isFinite);
  const meanDev=raw.samples.map(s=>s.meanFormationDeviation).filter(Number.isFinite);
  const p95Dev=raw.samples.map(s=>s.p95FormationDeviation).filter(Number.isFinite);
  let startStopCycles=0;
  for(let i=2;i<speeds.length;i++) if(speeds[i-2]>5&&speeds[i-1]<1&&speeds[i]>5) startStopCycles++;
  const metrics={
    routeCompletion:+Math.max(0,Math.min(1,1-raw.finalRemaining/Math.max(1,raw.initialDistance))).toFixed(4),
    headingJitter:+percentile(headingJitter,.95).toFixed(4),
    headingReversals:raw.reversals,
    startStopCycles,
    meanFormationDeviation:+(meanDev.reduce((a,b)=>a+b,0)/Math.max(1,meanDev.length)).toFixed(3),
    p95FormationDeviation:+percentile(p95Dev,.95).toFixed(3),
    validRouteStationaryTime:+raw.maxStationary.toFixed(2),
    maxStall:+raw.maxStationary.toFixed(2)
  };
  const report={seed:raw.seed,ordersHash:raw.ordersHash,rootCauseTrace:'A-E unclassified; instrumentation-only baseline',metrics,diagnostics:{pathLength:raw.pathLength,pathIndex:raw.pathIndex,finalRemaining:+raw.finalRemaining.toFixed(2),samples:raw.samples.length}};
  console.log('MOVEMENT_CONTACT_LAB',JSON.stringify(report));
  expect(raw.pathLength).toBeGreaterThan(0);
  expect(metrics.routeCompletion).toBeGreaterThan(.85);
  expect(metrics.headingReversals).toBeLessThan(4);
  expect(metrics.validRouteStationaryTime).toBeLessThan(5);
  expect(errors).toEqual([]);
});
