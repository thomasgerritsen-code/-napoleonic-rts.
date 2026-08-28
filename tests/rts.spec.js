const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => { let seed = 123456789; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; });
  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__RTS_DEBUG__?.getState && window.__RTS_DEBUG__?.audit && window.RTS_SIM));
  return pageErrors;
}
const state = page => page.evaluate(() => window.__RTS_DEBUG__.getState());

test('v0.6.3 loads with simulation facade, minimap and no JavaScript errors', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.6\.3/); await expect(page.locator('.version')).toHaveText('v0.6.3'); await expect(page.locator('#minimap')).toBeVisible();
  const s = await state(page); expect(s.world.width).toBe(3800); expect(s.world.height).toBe(2200); expect(s.exploredCells).toBeGreaterThan(0); expect(['aggressive','balanced','defensive']).toContain(s.aiStrategy);
  const facade = await page.evaluate(() => ({version:window.RTS_SIM.version,hasSnapshot:typeof window.RTS_SIM.snapshot==='function',hasDispatch:typeof window.RTS_SIM.dispatch==='function',hasAudit:typeof window.RTS_SIM.audit==='function'}));
  expect(facade).toEqual({version:'0.6.3',hasSnapshot:true,hasDispatch:true,hasAudit:true});
  await testInfo.attach('v063-initial', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' }); expect(errors).toEqual([]);
});

test('rally point and visible queue distribute completed troops instead of stacking them', async ({ page }) => {
  const errors = await openGame(page);
  const barracksId = await page.evaluate(() => window.__RTS_DEBUG__.createCompletedBuilding('france','barracks',900,800));
  await page.evaluate(id => window.__RTS_DEBUG__.selectBuildingById(id), barracksId); await expect(page.locator('#productionQueuePanel')).toBeVisible(); await page.locator('[data-action="set-rally"]').click();
  const target = await page.evaluate(() => window.__RTS_DEBUG__.worldToScreen(1080,760)); await page.mouse.click(target.x,target.y);
  let s = await state(page), b = s.france.buildings.find(x => x.id === barracksId); expect(Math.abs(b.rallyX-1080)).toBeLessThan(5); expect(Math.abs(b.rallyY-760)).toBeLessThan(5);
  const beforeIds = new Set(s.france.units.filter(u => u.type==='infantry').map(u => u.id));
  await page.locator('[data-action="train-infantry"]').click(); await page.locator('[data-action="train-infantry"]').click(); await page.locator('[data-action="train-infantry"]').click(); await expect(page.locator('#productionQueuePanel li')).toHaveCount(3);
  await page.evaluate(() => window.__RTS_DEBUG__.tick(22)); s = await state(page); const made = s.france.units.filter(u => u.type==='infantry'&&!beforeIds.has(u.id)); expect(made).toHaveLength(3);
  const distances=[]; for(let i=0;i<made.length;i++)for(let j=i+1;j<made.length;j++)distances.push(Math.hypot(made[i].x-made[j].x,made[i].y-made[j].y)); expect(Math.min(...distances)).toBeGreaterThan(8); made.forEach(u=>expect(Math.hypot(u.x-b.rallyX,u.y-b.rallyY)).toBeLessThan(115)); expect(errors).toEqual([]);
});

test('infantry regiment dissolves on broken morale or one-third strength', async ({ page }) => {
  const errors = await openGame(page);
  const moraleId = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1200,1050)); await page.evaluate(id => window.__RTS_DEBUG__.setGroupMorale(id,20), moraleId);
  let s = await state(page), g = s.france.groups.find(x => x.id===moraleId); expect(g.destroyed).toBe(true); expect(g.brokenReason).toContain('moraal');
  const strengthId = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1450,1050)); await page.evaluate(id => window.__RTS_DEBUG__.reduceGroupTo(id,2), strengthId);
  s = await state(page); g = s.france.groups.find(x => x.id===strengthId); expect(g.destroyed).toBe(true); expect(g.brokenReason).toContain('over'); expect(errors).toEqual([]);
});

test('a cannon requires exactly two assigned musketiers and battery breaks when crew is lost', async ({ page }) => {
  const errors = await openGame(page); await page.evaluate(() => window.__RTS_DEBUG__.selectForBattery('france'));
  const button = page.locator('[data-action="create-battery"]'); await expect(button).toBeVisible(); await expect(button).toBeEnabled(); await button.click();
  let s = await state(page); expect(s.france.batteries.length).toBe(1); const battery = s.france.batteries[0]; expect(battery.crewIds).toHaveLength(2); expect(battery.operational).toBe(true);
  await page.evaluate(id => window.__RTS_DEBUG__.killBatteryCrew(id,1), battery.id); s = await state(page); const historical = s.france.groups.find(x=>x.id===battery.id); expect(historical.destroyed).toBe(true); expect(historical.brokenReason).toContain('bemanning'); expect(s.france.batteries).toHaveLength(0); expect(errors).toEqual([]);
});

test('gun crew stays rigidly attached and visibly moves as one battery', async ({ page }, testInfo) => {
  const errors = await openGame(page); await page.evaluate(() => window.__RTS_DEBUG__.selectForBattery('france'));
  await page.locator('[data-action="create-battery"]').click();
  let s = await state(page); const battery = s.france.batteries[0]; expect(battery).toBeTruthy();
  await page.evaluate(() => window.__RTS_DEBUG__.orderSelectedWithFacing(1450,1180,0)); await page.evaluate(() => window.__RTS_DEBUG__.tick(1));
  const first = await page.evaluate(id => window.__RTS_DEBUG__.batteryCohesion(id), battery.id); await page.evaluate(() => window.__RTS_DEBUG__.tick(1)); const second = await page.evaluate(id => window.__RTS_DEBUG__.batteryCohesion(id), battery.id);
  expect(first).not.toBeNull(); expect(second).not.toBeNull(); expect(first.moving).toBe(true); expect(second.moving).toBe(true);
  for (const pose of [first, second]) { expect(pose.crew).toHaveLength(2); pose.crew.forEach(member => { expect(Math.abs(member.local.x + 28)).toBeLessThan(0.75); expect(Math.abs(Math.abs(member.local.y) - 14)).toBeLessThan(0.75); }); expect(Math.abs(pose.crewSpread - 28)).toBeLessThan(1); }
  expect(Math.hypot(second.cannon.x-first.cannon.x,second.cannon.y-first.cannon.y)).toBeGreaterThan(5); await testInfo.attach('v063-moving-battery', { body: await page.screenshot({ fullPage:true }), contentType:'image/png' }); expect(errors).toEqual([]);
});

test('worker automatically continues with a nearby resource of the same type', async ({ page }) => {
  const errors = await openGame(page); const assignment = await page.evaluate(() => window.__RTS_DEBUG__.assignWorkerToNearest('france','wood')); expect(assignment).not.toBeNull();
  await page.evaluate(id => window.__RTS_DEBUG__.depleteResource(id,0), assignment.resourceId); await page.evaluate(() => window.__RTS_DEBUG__.tick(.3)); const s = await state(page), worker = s.france.units.find(u=>u.id===assignment.workerId);
  expect(worker.preferredResourceType).toBe('wood'); expect(worker.resourceTargetId).not.toBe(assignment.resourceId); expect(worker.resourceTargetId).not.toBeNull(); expect(errors).toEqual([]);
});

test('right-drag orders a battalion through march-column, movement and final deployment facing', async ({ page }, testInfo) => {
  const errors = await openGame(page); await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1200,1050)); await page.evaluate(id => window.__RTS_DEBUG__.selectRegiment(id), id);
  const start = await page.evaluate(() => window.__RTS_DEBUG__.worldToScreen(1720,1120));
  const end = await page.evaluate(() => window.__RTS_DEBUG__.worldToScreen(1720,1230));
  await page.mouse.move(start.x,start.y); await page.mouse.down({button:'right'}); await page.mouse.move(end.x,end.y,{steps:8}); await page.mouse.up({button:'right'});
  let fs = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id);
  expect(fs.pathLength).toBeGreaterThan(0); expect(fs.finalFacing).not.toBeNull(); expect(Math.abs(fs.finalFacing-Math.PI/2)).toBeLessThan(.08); expect(['forming-column','marching-column']).toContain(fs.phase);
  await page.evaluate(() => window.RTS_SIM.step(4)); fs = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id); expect(['marching-column','deploying','formed']).toContain(fs.phase);
  await page.evaluate(() => window.RTS_SIM.step(24)); fs = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id);
  expect(fs.phase).toBe('formed'); expect(Math.abs(fs.facing-Math.PI/2)).toBeLessThan(.12); expect(fs.readiness).toBeGreaterThan(.7);
  const xs=fs.members.map(m=>m.x), ys=fs.members.map(m=>m.y), xSpread=Math.max(...xs)-Math.min(...xs), ySpread=Math.max(...ys)-Math.min(...ys); expect(xSpread).toBeGreaterThan(ySpread*1.25);
  await testInfo.attach('v063-final-deployment', { body: await page.screenshot({ fullPage:true }), contentType:'image/png' }); expect(errors).toEqual([]);
});

test('explored terrain remains remembered and terrain types are active', async ({ page }) => {
  const errors = await openGame(page); let s = await state(page); const scout = s.france.units.find(u=>u.type==='cavalry'); await page.evaluate(id => window.__RTS_DEBUG__.teleportUnit(id,3200,900), scout.id); expect(await page.evaluate(() => window.__RTS_DEBUG__.isExplored(3200,900))).toBe(true); await page.evaluate(id => window.__RTS_DEBUG__.teleportUnit(id,700,900), scout.id); expect(await page.evaluate(() => window.__RTS_DEBUG__.isExplored(3200,900))).toBe(true);
  expect(await page.evaluate(() => window.__RTS_DEBUG__.terrainAt(700,900))).toBe('road'); expect(await page.evaluate(() => window.__RTS_DEBUG__.terrainAt(400,500))).toBe('woods'); expect(await page.evaluate(() => window.__RTS_DEBUG__.terrainAt(1540,1160))).toBe('hill'); expect(errors).toEqual([]);
});

test('British AI develops infantry, cavalry and crewed artillery groups', async ({ page }, testInfo) => {
  const errors = await openGame(page); await page.evaluate(() => { window.__RTS_DEBUG__.setPeaceMode(true); window.__RTS_DEBUG__.grantResources('britain',12000,12000); window.__RTS_DEBUG__.tick(360); }); const s = await state(page);
  expect(s.britain.buildings.some(b=>b.type==='barracks'&&b.complete)).toBe(true); expect(s.britain.buildings.some(b=>b.type==='stable'&&b.complete)).toBe(true); expect(s.britain.buildings.some(b=>b.type==='foundry'&&b.complete)).toBe(true); expect(s.britain.regiments.some(r=>r.kind==='infantry')).toBe(true); expect(s.britain.regiments.some(r=>r.kind==='cavalry')).toBe(true); expect(s.britain.batteries.length).toBeGreaterThanOrEqual(1); s.britain.batteries.forEach(b=>expect(b.operational).toBe(true)); expect(s.britain.units.filter(u=>u.type==='artillery').length).toBeGreaterThan(1);
  await testInfo.attach('v063-british-development', { body: await page.screenshot({ fullPage:true }), contentType:'image/png' }); expect(errors).toEqual([]);
});

test('British AI replaces infantry, cavalry and artillery after heavy established-army losses', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  await page.evaluate(() => { window.__RTS_DEBUG__.setPeaceMode(true); window.__RTS_DEBUG__.grantResources('britain',25000,25000); window.RTS_SIM.step(380); });
  const before = await page.evaluate(() => window.__RTS_DEBUG__.getAIReinforcementState());
  expect(before.counts.infantry.living).toBeGreaterThan(20); expect(before.counts.cavalry.living).toBeGreaterThan(3); expect(before.counts.artillery.living).toBeGreaterThan(1);
  const killed = await page.evaluate(() => window.__RTS_DEBUG__.inflictBritishLosses()); expect(killed.infantry).toBeGreaterThan(0); expect(killed.cavalry).toBeGreaterThan(0); expect(killed.artillery).toBeGreaterThan(0);
  const afterLoss = await page.evaluate(() => window.__RTS_DEBUG__.getAIReinforcementState());
  await page.evaluate(() => window.RTS_SIM.step(240));
  const after = await page.evaluate(() => window.__RTS_DEBUG__.getAIReinforcementState());
  expect(after.counts.infantry.living).toBeGreaterThan(afterLoss.counts.infantry.living);
  expect(after.counts.cavalry.living).toBeGreaterThan(afterLoss.counts.cavalry.living);
  expect(after.counts.artillery.living).toBeGreaterThan(afterLoss.counts.artillery.living);
  expect(after.projectedPop).toBeGreaterThan(afterLoss.popUsed); expect(errors).toEqual([]);
});

test('F3 test lab exposes diagnostics, scenarios and copyable bug report', async ({ page }) => {
  const errors = await openGame(page); await page.keyboard.press('F3'); await expect(page.locator('#debugPanel')).toBeVisible();
  await expect(page.locator('#debugScenario')).toBeVisible(); await page.selectOption('#debugScenario','artillery-3'); await page.locator('[data-debug-action="run"]').click();
  const snap = await page.evaluate(() => window.__RTS_DEBUG__.simulationSnapshot()); expect(snap.version).toBe('0.6.3'); expect(snap.groups.filter(g=>g.kind==='artillery'&&!g.destroyed)).toHaveLength(3);
  const report = await page.evaluate(() => JSON.parse(window.__RTS_DEBUG__.createBugReport())); expect(report.version).toBe('0.6.3'); expect(report.scenario).toBe('artillery-3'); expect(report.metrics).toBeTruthy(); expect(report.audit).toBeTruthy(); expect(errors).toEqual([]);
});

test('520-unit stress scenario uses spatial combat index and remains structurally valid', async ({ page }, testInfo) => {
  const errors = await openGame(page); await page.evaluate(() => window.__RTS_DEBUG__.runScenario('performance-520')); await page.evaluate(() => window.RTS_SIM.step(20));
  const snap = await page.evaluate(() => window.RTS_SIM.snapshot()); const metrics = await page.evaluate(() => window.RTS_SIM.getMetrics());
  expect(snap.units.length).toBeGreaterThanOrEqual(520); expect(snap.audit.ok).toBe(true); expect(metrics.combatQueries).toBeGreaterThan(0); expect(Number.isFinite(metrics.updateMs)).toBe(true); expect(metrics.combatBuckets).toBeGreaterThan(2); expect(metrics.avgCombatCandidates).toBeLessThan(40);
  await testInfo.attach('v063-520-units', { body: await page.screenshot({ fullPage:true }), contentType:'image/png' }); expect(errors).toEqual([]);
});

test('10-minute accelerated soak has no corrupt state, ghost groups or broken production', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page); await page.evaluate(() => { window.__RTS_DEBUG__.setPeaceMode(true); window.__RTS_DEBUG__.grantResources('britain',18000,18000); window.__RTS_DEBUG__.grantResources('france',8000,8000); window.RTS_SIM.step(600); });
  const audit = await page.evaluate(() => window.RTS_SIM.audit()); const snap = await page.evaluate(() => window.RTS_SIM.snapshot());
  expect(audit.ok, audit.errors.join('\n')).toBe(true); expect(audit.errors).toEqual([]); expect(audit.metrics.stalledGroups).toBe(0); expect(snap.buildings.every(b=>Number.isFinite(b.production)&&b.production>=0&&b.production<=1.01)).toBe(true);
  expect(snap.groups.filter(g=>!g.destroyed).every(g=>g.members.length>0)).toBe(true); expect(snap.groups.filter(g=>!g.destroyed&&g.kind==='artillery').every(g=>g.members.filter(m=>m.type==='infantry').length===2)).toBe(true); expect(snap.buildings.some(b=>b.side==='britain'&&b.type==='barracks'&&b.complete)).toBe(true); expect(errors).toEqual([]);
});
