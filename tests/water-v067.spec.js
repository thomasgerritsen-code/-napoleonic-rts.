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
