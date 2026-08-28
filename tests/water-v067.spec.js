const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 987654321;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.waterSystemV067 && window.__RTS_DEBUG__?.routeWaterAuditV067 && window.RTS_SIM));
  return pageErrors;
}

test('v0.6.8 loads with river systems, simulation facade and no JavaScript errors', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.6\.8/);
  await expect(page.locator('.version')).toHaveText('v0.6.8');
  await expect(page.locator('#minimap')).toBeVisible();
  const facade = await page.evaluate(() => ({
    version: window.RTS_SIM.version,
    hasSnapshot: typeof window.RTS_SIM.snapshot === 'function',
    hasDispatch: typeof window.RTS_SIM.dispatch === 'function',
    hasAudit: typeof window.RTS_SIM.audit === 'function'
  }));
  expect(facade).toEqual({ version:'0.6.8', hasSnapshot:true, hasDispatch:true, hasAudit:true });
  const water = await page.evaluate(() => window.__RTS_DEBUG__.waterSystemV067());
  expect(water.name).toBe('Ruisseau de la Campagne');
  expect(water.bridges).toBe(3);
  expect(water.fords).toBe(1);
  expect(water.crossings).toHaveLength(4);
  expect(water.river.length).toBeGreaterThanOrEqual(10);

  const blocked = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1475,520));
  const bridge = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1500,900));
  const ford = await page.evaluate(() => window.__RTS_DEBUG__.waterInfoV067(1530,1280));
  expect(blocked.water).toBe(true);
  expect(blocked.crossing).toBeNull();
  expect(bridge.water).toBe(false);
  expect(bridge.crossing).toBe('Pont de la Chaussée');
  expect(ford.water).toBe(false);
  expect(ford.crossing).toBe('Gué de la Colline');

  const speeds = await page.evaluate(() => ({
    bridge: window.__RTS_DEBUG__.crossingSpeedV067('infantry','pont-chaussee'),
    ford: window.__RTS_DEBUG__.crossingSpeedV067('infantry','gue-colline')
  }));
  expect(speeds.bridge).toBeGreaterThan(speeds.ford);
  await testInfo.attach('v068-river-crossings', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});

test('a battalion crossing the river uses a legal crossing and never cuts through water', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1000,900));
  await page.evaluate(id => window.__RTS_DEBUG__.selectRegiment(id), id);
  await page.evaluate(() => window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0));

  const route = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id);
  const audit = await page.evaluate(id => window.__RTS_DEBUG__.routeWaterAuditV067(id), id);
  expect(route.routeCrossings.some(c => c.name === 'Pont de la Chaussée')).toBe(true);
  expect(audit.safe).toBe(true);
  expect(audit.blockedSegments).toBe(0);

  const samples=[];
  for(let i=0;i<40;i++){
    await page.evaluate(() => window.RTS_SIM.step(1));
    samples.push(await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id));
  }
  expect(samples.every(s => s.anchorWater === false)).toBe(true);
  expect(samples.some(s => s.anchorCrossing === 'Pont de la Chaussée' || s.crossingTraffic?.crossingName === 'Pont de la Chaussée')).toBe(true);
  expect(samples.some(s => (s.anchor?.x ?? s.centroid?.x ?? 0) > 1600)).toBe(true);
  const final = samples[samples.length-1];
  expect(final.phase).toBe('formed');
  expect(final.centroid.x).toBeGreaterThan(1600);
  await testInfo.attach('v068-bridge-march', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});

test('F3 test lab and bug reports expose v0.6.8', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('F3');
  await expect(page.locator('#debugPanel')).toBeVisible();
  await page.selectOption('#debugScenario','artillery-3');
  await page.locator('[data-debug-action="run"]').click();
  const snap = await page.evaluate(() => window.__RTS_DEBUG__.simulationSnapshot());
  expect(snap.version).toBe('0.6.8');
  expect(snap.groups.filter(g=>g.kind==='artillery'&&!g.destroyed)).toHaveLength(3);
  const report = await page.evaluate(() => JSON.parse(window.__RTS_DEBUG__.createBugReport()));
  expect(report.version).toBe('0.6.8');
  expect(report.scenario).toBe('artillery-3');
  expect(report.audit).toBeTruthy();
  expect(errors).toEqual([]);
});
