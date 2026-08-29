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
    window.__V071_SPEED_PARITY__
  ));
  return pageErrors;
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
  expect(errors).toEqual([]);
});

test('straight Grande Chaussee march is no longer slower than a loose musketier', async ({page}) => {
  const errors=await openV071(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));

  // Directly exercise the same loose-unit movement function used by the simulation,
  // isolated from combat and collisions, for a one-second road benchmark.
  const looseSpeed=await page.evaluate(() => {
    const u=createUnit('france','infantry',780,900);
    const startX=u.x, startY=u.y;
    for(let i=0;i<20;i++) moveToward(u,1300,900,.05,TYPES.infantry.speed);
    return Math.hypot(u.x-startX,u.y-startY);
  });

  const id=await page.evaluate(()=>window.__RTS_DEBUG__.createFreshInfantryRegiment('france',780,900));
  await page.evaluate(id=>{
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1350,900,0);
  },id);

  // Let the anchor's acceleration smoothing settle, then measure one full second.
  await page.evaluate(()=>window.RTS_SIM.step(2.0));
  const before=await page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV071(id),id);
  await page.evaluate(()=>window.RTS_SIM.step(1.0));
  const after=await page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV071(id),id);

  expect(before.road).toBe('Grande Chaussée');
  expect(after.road).toBe('Grande Chaussée');
  const battalionSpeed=Math.hypot(after.anchor.x-before.anchor.x,after.anchor.y-before.anchor.y);

  expect(looseSpeed).toBeGreaterThan(68);
  expect(looseSpeed).toBeLessThan(72);
  expect(battalionSpeed).toBeGreaterThan(looseSpeed*0.94);
  expect(battalionSpeed).toBeLessThan(looseSpeed*1.04);
  expect(errors).toEqual([]);
});
