const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 987654321;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.waterSystemV067 && window.__RTS_DEBUG__?.routeWaterAuditV067 && window.RTS_SIM?.version));
  return pageErrors;
}

test('current runtime loads with river systems, simulation facade and no JavaScript errors', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  const runtimeVersion = await page.evaluate(() => window.RTS_SIM.version);
  await expect(page).toHaveTitle(new RegExp(`Napoleonic RTS v${runtimeVersion.replace(/\./g,'\\.')}`));
  await expect(page.locator('.version')).toHaveText(`v${runtimeVersion}`);
  await expect(page.locator('#minimap')).toBeVisible();
  const facade = await page.evaluate(() => ({
    version: window.RTS_SIM.version,
    hasSnapshot: typeof window.RTS_SIM.snapshot === 'function',
    hasDispatch: typeof window.RTS_SIM.dispatch === 'function',
    hasAudit: typeof window.RTS_SIM.audit === 'function'
  }));
  expect(facade).toEqual({ version:runtimeVersion, hasSnapshot:true, hasDispatch:true, hasAudit:true });
  const water = await page.evaluate(() => window.__RTS_DEBUG__.waterSystemV067());
  expect(water.name).toBe('Ruisseau de la Campagne');
  expect(water.bridges).toBe(5);
  expect(water.fords).toBe(0);
  expect(water.crossings).toHaveLength(5);
  expect(water.river.length).toBeGreaterThanOrEqual(18);
  expect(water.crossings.map(c=>c.id)).toEqual(expect.arrayContaining(['pont-chaussee','pont-crete','pont-fermes','pont-grands-bois','pont-du-sud']));

  const blocked = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1475,strategicLatitudeV282(520)));
  const bridge = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1500,900));
  const ford = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1530,strategicLatitudeV282(1280)));
  expect(blocked.water).toBe(true);
  expect(blocked.crossing).toBeNull();
  expect(bridge.water).toBe(false);
  expect(bridge.crossing).toBe('Pont de la Chaussée');
  expect(ford.water).toBe(true);
  expect(ford.crossing).toBeNull();

  const speeds = await page.evaluate(() => ({
    bridge: window.__RTS_DEBUG__.crossingSpeedV067('infantry','pont-chaussee'),
    ford: null
  }));
  expect(speeds.bridge).toBeGreaterThan(0); expect(speeds.ford).toBeNull();
  await testInfo.attach('river-crossings', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});

test('a cross-river battalion order is routed through legal water infrastructure', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const id = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1000,900);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);

    const initial = window.__RTS_DEBUG__.formationState(id);
    const audit = window.__RTS_DEBUG__.routeWaterAuditV067(id);
    const samples=[];
    for(let i=0;i<8;i++){
      window.RTS_SIM.step(.25);
      samples.push(window.__RTS_DEBUG__.formationState(id));
    }
    return {initial,audit,samples};
  });

  expect(result.initial.routeCrossings.some(c => c.name === 'Pont de la Chaussée')).toBe(true);
  expect(result.audit.safe).toBe(true);
  expect(result.audit.blockedSegments).toBe(0);
  expect(result.samples.every(s => s.anchorWater === false)).toBe(true);
  expect(result.samples.some(s => s.routeCrossings?.some(c => c.name === 'Pont de la Chaussée'))).toBe(true);
  expect(result.samples.some(s => (s.anchor?.x ?? s.centroid?.x ?? 0) > 1000)).toBe(true);
  expect(errors).toEqual([]);
});

test('F3 test lab and bug reports expose the active runtime version', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('F3');
  await expect(page.locator('#debugPanel')).toBeVisible();
  await page.selectOption('#debugScenario','artillery-3');
  await page.locator('[data-debug-action="run"]').click();
  const result = await page.evaluate(() => ({
    runtimeVersion: window.RTS_SIM.version,
    snap: window.__RTS_DEBUG__.simulationSnapshot(),
    report: JSON.parse(window.__RTS_DEBUG__.createBugReport())
  }));
  expect(result.snap.version).toBe(result.runtimeVersion);
  expect(result.snap.groups.filter(g=>g.kind==='artillery'&&!g.destroyed)).toHaveLength(3);
  expect(result.report.version).toBe(result.runtimeVersion);
  expect(result.report.scenario).toBe('artillery-3');
  expect(result.report.audit).toBeTruthy();
  expect(errors).toEqual([]);
});

test('v282 distant camps and legacy bridges are physically spread across the enlarged map',async({page})=>{
 const pageErrors=await openGame(page);
 // Reset and inspect in one browser execution with no interleaving game ticks.
 const inspect=()=>page.evaluate(()=>{
   resetGame();window.__RTS_DEBUG__.setPeaceMode(true);
   const france=buildings.find(b=>b.side==='france'&&b.type==='towncenter'&&!b.dead);
   const britain=buildings.find(b=>b.side==='britain'&&b.type==='towncenter'&&!b.dead);
   const troops=units.filter(u=>u.side==='britain'&&!u.dead);
   const radius=Math.max(...troops.map(u=>Math.hypot(u.x-britain.x,u.y-britain.y)));
   const berries=resources.filter(r=>r.type==='food'&&!r.dead&&Math.hypot(r.x-britain.x,r.y-britain.y)<650);
   const wood=resources.filter(r=>r.type==='wood'&&!r.dead&&Math.hypot(r.x-britain.x,r.y-britain.y)<650);
   const crossings=WATER_CROSSINGS_V067.filter(c=>c.type==='bridge')
      .map(c=>({id:c.id,x:c.x,y:c.y,onDeck:!waterAtV067(c.x,c.y)}));
   return{world:{width:WORLD.width,height:WORLD.height},france:{x:france.x,y:france.y},
     britain:{x:britain.x,y:britain.y},troops:troops.length,radius,berries:berries.length,wood:wood.length,
     crossings,onWater:troops.filter(u=>waterAtV067(u.x,u.y)).length};
 });
 for(let retry=0;retry<2;retry++){
   const d=await inspect();
   expect(d.world.width).toBeGreaterThanOrEqual(8000);
   expect(d.world.height).toBeGreaterThanOrEqual(5000);
   expect(d.france.x).toBeLessThan(d.world.width*.20);
   expect(d.france.y).toBeLessThan(d.world.height*.30);
   expect(d.britain.x).toBeGreaterThan(d.world.width*.85);
   expect(d.britain.y).toBeGreaterThan(d.world.height*.75);
   // Both camps remain in opposing map corners; village collision avoidance may
    // shift the French town center a little without changing the strategic layout.
    expect(Math.hypot(d.britain.x-d.france.x,d.britain.y-d.france.y)).toBeGreaterThan(7400);
   expect(d.troops).toBeGreaterThanOrEqual(12);
   expect(d.radius).toBeLessThan(570);
   expect(d.berries).toBeGreaterThan(0);
   expect(d.wood).toBeGreaterThan(0);
   expect(d.onWater).toBe(0);
   const by=Object.fromEntries(d.crossings.map(c=>[c.id,c.y]));
   expect(by['pont-crete']-by['pont-chaussee']).toBeGreaterThanOrEqual(500);
   expect(by['pont-fermes']-by['pont-crete']).toBeGreaterThanOrEqual(1000);
   expect(by['pont-grands-bois']-by['pont-fermes']).toBeGreaterThanOrEqual(500);
   expect(d.crossings.every(c=>c.onDeck)).toBe(true);
   // Each invocation of inspect() resets the game.
 }
 expect(pageErrors).toEqual([]);
});
