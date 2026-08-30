const { test, expect } = require('@playwright/test');

async function openV071(page) {
  const pageErrors=[];
  page.on('pageerror', e=>pageErrors.push(e.message));
  await page.addInitScript(() => {
    let seed=271828183;
    Math.random=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  });
  await page.goto('/?test=v071', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.RTS_VERSION &&
    window.RTS_SIM?.version===window.RTS_VERSION &&
    window.__RTS_DEBUG__?.motionSystemV071 &&
    window.__RTS_DEBUG__?.motionStatsV071
  ));
  return pageErrors;
}

function angleDelta(a,b){ return Math.atan2(Math.sin(a-b),Math.cos(a-b)); }

function coefficientOfVariation(values){
  const mean=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  const sd=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,values.length));
  return {mean,cv:mean>1e-9?sd/mean:0};
}

test('v0.7.1 uses damped slot followers with a fixed-step interpolated production renderer', async ({page}) => {
  const errors=await openV071(page);
  const releaseVersion=await page.evaluate(()=>window.RTS_VERSION);
  await expect(page).toHaveTitle(`Napoleonic RTS v${releaseVersion}`);
  await expect(page.locator('.version')).toHaveText(`v${releaseVersion}`);
  const stats=await page.evaluate(()=>window.__RTS_DEBUG__.motionStatsV071());
  expect(stats.solver).toBe('anchor-damped-slots-fixed60-render-interp');
  expect(stats.fixedStepHz).toBe(60);
  expect(stats.renderInterpolation).toBe(true);
  expect(errors).toEqual([]);
});

test('straight road march has low centroid jitter and low per-soldier direction chatter', async ({page},testInfo) => {
  const errors=await openV071(page);
  const result=await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',700,900);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1850,895,0);
    window.RTS_SIM.step(1.5);
    const samples=[];
    for(let i=0;i<48;i++){
      window.RTS_SIM.step(.05);
      samples.push(window.__RTS_DEBUG__.motionSystemV071(id));
    }
    return {samples,stats:window.__RTS_DEBUG__.motionStatsV071()};
  });
  const samples=result.samples;

  expect(samples.every(s=>s.road==='Grande Chaussée')).toBe(true);
  expect(Math.max(...samples.map(s=>s.maxSlotError))).toBeLessThan(42);
  expect(Math.max(...samples.map(s=>s.centroidAnchorError||0))).toBeLessThan(28);

  const centroidSteps=[];
  for(let i=1;i<samples.length;i++){
    centroidSteps.push(Math.hypot(
      samples[i].centroid.x-samples[i-1].centroid.x,
      samples[i].centroid.y-samples[i-1].centroid.y
    ));
  }
  const centroidMotion=coefficientOfVariation(centroidSteps.slice(4));
  expect(centroidMotion.mean).toBeGreaterThan(1.5);
  expect(centroidMotion.cv).toBeLessThan(.16);

  const trackedId=samples[0].members.find(u=>u.type==='infantry')?.id;
  const velocities=[];
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1].members.find(u=>u.id===trackedId);
    const b=samples[i].members.find(u=>u.id===trackedId);
    velocities.push({x:(b.x-a.x)/.05,y:(b.y-a.y)/.05});
  }
  const speedCv=coefficientOfVariation(velocities.slice(5).map(v=>Math.hypot(v.x,v.y)));
  expect(speedCv.cv).toBeLessThan(.22);

  const meaningful=velocities.filter(v=>Math.hypot(v.x,v.y)>8);
  const headingJumps=[];
  for(let i=1;i<meaningful.length;i++){
    headingJumps.push(Math.abs(angleDelta(
      Math.atan2(meaningful[i].y,meaningful[i].x),
      Math.atan2(meaningful[i-1].y,meaningful[i-1].x)
    )));
  }
  expect(Math.max(...headingJumps)).toBeLessThan(.22);
  expect(headingJumps.filter(v=>v>.10).length).toBeLessThanOrEqual(2);

  expect(result.stats.followerSteps).toBeGreaterThan(400);
  expect(result.stats.maxFollowerSpeed).toBeLessThan(130);
  expect(result.stats.directionReversals).toBeLessThan(40);
  await testInfo.attach('v071-smooth-road-march',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(errors).toEqual([]);
});

test('formation transition converges without a teleport or internal collision fight', async ({page}) => {
  const errors=await openV071(page);
  const result=await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',680,900);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1420,895,0);
    window.RTS_SIM.step(1.0);

    let previous=window.__RTS_DEBUG__.motionSystemV071(id);
    let maxMemberStep=0;
    for(let i=0;i<30;i++){
      window.RTS_SIM.step(.05);
      const current=window.__RTS_DEBUG__.motionSystemV071(id);
      const before=new Map(previous.members.map(u=>[u.id,u]));
      for(const u of current.members){
        const p=before.get(u.id);
        if(p) maxMemberStep=Math.max(maxMemberStep,Math.hypot(u.x-p.x,u.y-p.y));
      }
      previous=current;
    }
    return {
      maxMemberStep,
      finalState:previous,
      stats:window.__RTS_DEBUG__.motionStatsV071(),
      oldStats:window.__RTS_DEBUG__.motionStatsV070()
    };
  });

  expect(result.maxMemberStep).toBeLessThan(7.5);
  expect(result.finalState.maxSlotError).toBeLessThan(32);
  expect(result.finalState.meanSlotError).toBeLessThan(15);
  expect(result.stats.internalCollisionSkips).toBeGreaterThan(0);
  expect(result.oldStats.snappedMembers).toBe(0);
  expect(result.oldStats.teleportViolations).toBe(0);
  expect(errors).toEqual([]);
});
