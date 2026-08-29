const { test, expect } = require('@playwright/test');

async function openV071(page) {
  const pageErrors=[];
  page.on('pageerror', e=>pageErrors.push(e.message));
  await page.addInitScript(() => {
    let seed=314159265;
    Math.random=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  });
  await page.goto('/?test=v071', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM?.version==='0.7.1' &&
    window.__RTS_DEBUG__?.motionSystemV071 &&
    window.__V071_SPEED_PARITY__?.version==='0.7.1-hotfix2'
  ));
  return pageErrors;
}

async function looseTravel(page, x, y, tx, ty, seconds=1) {
  return page.evaluate(({x,y,tx,ty,seconds}) => {
    const u=createUnit('france','infantry',x,y);
    const sx=u.x, sy=u.y;
    const steps=Math.round(seconds/.05);
    for(let i=0;i<steps;i++) moveToward(u,tx,ty,.05,TYPES.infantry.speed);
    u.dead=true;
    return Math.hypot(u.x-sx,u.y-sy);
  }, {x,y,tx,ty,seconds});
}

async function regimentCentroid(page, id) {
  return page.evaluate(id => {
    const reg=getRegiment(id);
    return centroid(regimentMembers(reg));
  }, id);
}

test('v0.7.1 battalion anchor uses the same field and road speed source as loose infantry', async ({page}) => {
  const errors=await openV071(page);
  const speeds=await page.evaluate(() => ({
    looseField:TYPES.infantry.speed,
    looseChaussee:TYPES.infantry.speed*1.24,
    groupField:groupTravelSpeedsV065('infantry').field,
    groupChaussee:roadSpeedV066('infantry','chaussee'),
    exported:window.__V071_SPEED_PARITY__
  }));

  expect(speeds.groupField).toBeCloseTo(speeds.looseField, 6);
  expect(speeds.groupChaussee).toBeCloseTo(speeds.looseChaussee, 6);
  expect(speeds.exported.infantryField).toBeCloseTo(57, 6);
  expect(speeds.exported.infantryChaussee).toBeCloseTo(70.68, 2);
  expect(speeds.exported.cohesionThrottle).toBe(false);
  expect(speeds.exported.seededFollowers).toBe(true);
  expect(errors).toEqual([]);
});

test('visible battalion centroid keeps pace with loose infantry on Grande Chaussee from the first second', async ({page}) => {
  const errors=await openV071(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const looseSpeed=await looseTravel(page,780,900,1300,900,1);
  const id=await page.evaluate(()=>window.__RTS_DEBUG__.createFreshInfantryRegiment('france',780,900));
  await page.evaluate(id=>{
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1450,900,0);
  },id);

  const start=await regimentCentroid(page,id);
  await page.evaluate(()=>window.RTS_SIM.step(1.0));
  const after1=await regimentCentroid(page,id);
  await page.evaluate(()=>window.RTS_SIM.step(1.0));
  const after2=await regimentCentroid(page,id);

  const firstSecond=after1.x-start.x;
  const secondSecond=after2.x-after1.x;
  const road=await page.evaluate(id => {
    const reg=getRegiment(id); const c=centroid(regimentMembers(reg));
    return roadNetworkAtV066(c.x,c.y)?.road?.name || null;
  },id);

  expect(road).toBe('Grande Chaussée');
  expect(looseSpeed).toBeGreaterThan(68);
  expect(looseSpeed).toBeLessThan(72);
  // Measure the soldiers the player actually sees, not merely the invisible anchor.
  expect(firstSecond).toBeGreaterThan(looseSpeed*0.88);
  expect(secondSecond).toBeGreaterThan(looseSpeed*0.94);
  expect(secondSecond).toBeLessThan(looseSpeed*1.06);
  expect(errors).toEqual([]);
});

test('visible battalion centroid keeps pace with loose infantry on open field', async ({page}) => {
  const errors=await openV071(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  const startPoint=await page.evaluate(() => {
    // Find a deterministic open strip long enough for a short field benchmark.
    for(let y=260;y<=1500;y+=80){
      for(let x=260;x<=1220;x+=80){
        let ok=true;
        for(let dx=0;dx<=220;dx+=40){
          if(roadNetworkAtV066(x+dx,y) || waterAtV067(x+dx,y) || fieldSpeedFactorV066(x+dx,y,'infantry')!==1){ok=false;break;}
        }
        if(ok) return {x,y};
      }
    }
    throw new Error('No open field strip found');
  });

  const looseSpeed=await looseTravel(page,startPoint.x,startPoint.y,startPoint.x+220,startPoint.y,1);
  const id=await page.evaluate(({x,y})=>window.__RTS_DEBUG__.createFreshInfantryRegiment('france',x,y),startPoint);
  await page.evaluate(({id,x,y})=>{
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(x+180,y,0);
  },{id,...startPoint});

  const start=await regimentCentroid(page,id);
  await page.evaluate(()=>window.RTS_SIM.step(1.0));
  const end=await regimentCentroid(page,id);
  const groupTravel=Math.hypot(end.x-start.x,end.y-start.y);

  expect(looseSpeed).toBeGreaterThan(55);
  expect(looseSpeed).toBeLessThan(59);
  expect(groupTravel).toBeGreaterThan(looseSpeed*0.90);
  expect(groupTravel).toBeLessThan(looseSpeed*1.08);
  expect(errors).toEqual([]);
});
