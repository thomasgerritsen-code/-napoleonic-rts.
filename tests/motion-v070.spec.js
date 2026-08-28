const { test, expect } = require('@playwright/test');

async function openV070(page) {
  const pageErrors=[];
  page.on('pageerror', e=>pageErrors.push(e.message));
  await page.addInitScript(() => {
    let seed=314159265;
    Math.random=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  });
  await page.goto('/?v070=1', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM?.version==='0.7.0' &&
    window.__RTS_DEBUG__?.motionSystemV070 &&
    window.__RTS_DEBUG__?.villageSystemV070
  ));
  return pageErrors;
}

async function motion(page,id){ return page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV070(id),id); }

test('v0.7.0 is the production build and villages visibly follow road verges', async ({page},testInfo) => {
  const errors=await openV070(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.7\.0/);
  await expect(page.locator('.version')).toHaveText('v0.7.0');
  const villages=await page.evaluate(()=>window.__RTS_DEBUG__.villageSystemV070());
  expect(villages.labelsVisible).toBe(false);
  expect(villages.junctionStyle).toBe('flared-beaten-earth');
  expect(villages.villages).toHaveLength(6);
  const houses=villages.villages.flatMap(v=>v.houses);
  expect(houses.length).toBeGreaterThanOrEqual(45);
  expect(Math.min(...villages.villages.map(v=>v.houses.length))).toBeGreaterThanOrEqual(7);
  expect(houses.reduce((s,h)=>s+h.w,0)/houses.length).toBeGreaterThan(31);
  expect(Math.min(...houses.map(h=>h.roadClearance))).toBeGreaterThanOrEqual(14);
  expect(villages.villages.find(v=>v.name==='Les Quatre Chemins').junctionRoadCount).toBeGreaterThanOrEqual(6);
  await testInfo.attach('v070-roadside-villages',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(errors).toEqual([]);
});

test('same-road retarget moves the real battalion centroid forward without the old backward shift', async ({page}) => {
  const errors=await openV070(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const id=await page.evaluate(()=>window.__RTS_DEBUG__.createFreshInfantryRegiment('france',650,900));
  await page.evaluate(()=>window.RTS_SIM.step(.9));
  await page.evaluate(id=>{window.__RTS_DEBUG__.selectRegiment(id);window.__RTS_DEBUG__.orderSelectedWithFacing(1280,900,0);},id);
  await page.evaluate(()=>window.RTS_SIM.step(1.1));
  const before=await motion(page,id);
  await page.evaluate(id=>{window.__RTS_DEBUG__.selectRegiment(id);window.__RTS_DEBUG__.orderSelectedWithFacing(1750,895,0);},id);
  const samples=[];
  for(let i=0;i<18;i++){await page.evaluate(()=>window.RTS_SIM.step(.08));samples.push(await motion(page,id));}
  expect(samples.every(s=>s.maxSlotError<0.08)).toBe(true);
  expect(samples.every(s=>s.centroidAnchorError<0.12)).toBe(true);
  const xs=[before.centroid.x,...samples.map(s=>s.centroid.x)];
  for(let i=1;i<xs.length;i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i-1]-.35);
  expect(xs[xs.length-1]).toBeGreaterThan(xs[0]+25);
  expect(errors).toEqual([]);
});

test('road marching uses one kinematic solver with no per-soldier slot jitter', async ({page},testInfo) => {
  const errors=await openV070(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const id=await page.evaluate(()=>window.__RTS_DEBUG__.createFreshInfantryRegiment('france',700,900));
  await page.evaluate(id=>{window.__RTS_DEBUG__.selectRegiment(id);window.__RTS_DEBUG__.orderSelectedWithFacing(1600,895,0);},id);
  await page.evaluate(()=>window.RTS_SIM.step(1.5));
  const samples=[];
  for(let i=0;i<24;i++){await page.evaluate(()=>window.RTS_SIM.step(.1));samples.push(await motion(page,id));}
  expect(samples.every(s=>s.road==='Grande Chaussée')).toBe(true);
  expect(samples.every(s=>s.maxSlotError<0.08)).toBe(true);
  expect(samples.every(s=>s.centroidAnchorError<0.12)).toBe(true);
  const deltas=[];
  for(let i=1;i<samples.length;i++) deltas.push(Math.hypot(samples[i].centroid.x-samples[i-1].centroid.x,samples[i].centroid.y-samples[i-1].centroid.y));
  const mean=deltas.reduce((a,b)=>a+b,0)/deltas.length;
  const sd=Math.sqrt(deltas.reduce((s,d)=>s+(d-mean)**2,0)/deltas.length);
  expect(mean).toBeGreaterThan(4);
  expect(sd/mean).toBeLessThan(.12);
  const stats=await page.evaluate(()=>window.__RTS_DEBUG__.motionStatsV070());
  expect(stats.kinematicFrames).toBeGreaterThan(20);
  expect(stats.snappedMembers).toBeGreaterThan(200);
  await testInfo.attach('v070-kinematic-road-march',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(errors).toEqual([]);
});

test('enemy interaction locks to the opposing battalion and remains formation-smooth', async ({page},testInfo) => {
  const errors=await openV070(page);
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  const ids=await page.evaluate(()=>{
    const french=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1030,1120);
    const british=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',1230,1120);
    window.__RTS_DEBUG__.setRegimentBayonetV069(french);
    window.__RTS_DEBUG__.selectRegiment(french);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1280,1120,0);
    return {french,british};
  });
  const engaged=[];
  for(let i=0;i<40;i++){
    await page.evaluate(()=>window.RTS_SIM.step(.1));
    const s=await motion(page,ids.french);
    if(s.engagement) engaged.push(s);
  }
  expect(engaged.length).toBeGreaterThan(8);
  expect(engaged.every(s=>s.engagement.stableGroupLock===true)).toBe(true);
  expect(new Set(engaged.map(s=>s.engagement.enemyGroupId)).size).toBe(1);
  expect(engaged[0].engagement.enemyGroupId).toBe(ids.british);
  expect(engaged.every(s=>s.maxSlotError<0.08)).toBe(true);
  const headings=engaged.map(s=>s.engagement.heading);
  const turnJumps=headings.slice(1).map((h,i)=>Math.abs(Math.atan2(Math.sin(h-headings[i]),Math.cos(h-headings[i]))));
  expect(Math.max(...turnJumps)).toBeLessThan(.10);
  const drummer=await page.evaluate(id=>window.__RTS_DEBUG__.drummerRoleV069(id),ids.french);
  expect(drummer.attackMode).toBe('support');
  expect(drummer.actualLocal.ox).toBeLessThan(0);
  await testInfo.attach('v070-stable-bayonet-contact',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(errors).toEqual([]);
});
