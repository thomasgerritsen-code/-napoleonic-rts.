const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 975318642;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  });
  await page.goto('/?test=1', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.villageSystemV069 &&
    window.__RTS_DEBUG__?.roadRetargetAuditV069 &&
    window.__RTS_DEBUG__?.drummerRoleV069 &&
    window.RTS_SIM?.version === '0.6.9'
  ));
  return pageErrors;
}

test('v0.6.9 renders roadside villages without map labels and keeps houses off every road', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await expect(page).toHaveTitle(/Napoleonic RTS v0\.6\.9/);
  await expect(page.locator('.version')).toHaveText('v0.6.9');
  const villages = await page.evaluate(() => window.__RTS_DEBUG__.villageSystemV069());
  expect(villages.labelsVisible).toBe(false);
  expect(villages.villages).toHaveLength(6);
  expect(villages.villages.every(v => v.houses.length >= 5)).toBe(true);
  expect(villages.villages.some(v => v.junctionRoadCount >= 4)).toBe(true);
  const houses = villages.villages.flatMap(v => v.houses);
  expect(houses.length).toBeGreaterThanOrEqual(30);
  expect(Math.min(...houses.map(h => h.roadClearance))).toBeGreaterThanOrEqual(15);
  await testInfo.attach('v069-roadside-villages', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});

test('retargeting a battalion forward on the same road never begins with a backward waypoint', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',900,900));
  await page.evaluate(() => window.RTS_SIM.step(1));
  const before = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id);
  await page.evaluate(id => {
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1350,900,0);
  }, id);
  const audit = await page.evaluate(id => window.__RTS_DEBUG__.roadRetargetAuditV069(id), id);
  expect(audit.sameRoadReason).toBe(true);
  expect(audit.firstForward).toBeGreaterThanOrEqual(-1);

  let minX = before.anchor?.x ?? before.centroid.x;
  let lastX = minX;
  for (let i=0; i<16; i++) {
    await page.evaluate(() => window.RTS_SIM.step(.1));
    const state = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), id);
    const x = state.anchor?.x ?? state.centroid.x;
    minX = Math.min(minX, x);
    lastX = x;
  }
  expect(minX).toBeGreaterThanOrEqual((before.anchor?.x ?? before.centroid.x) - 1.5);
  expect(lastX).toBeGreaterThan((before.anchor?.x ?? before.centroid.x) + 8);
  expect(errors).toEqual([]);
});

test('drummer stays behind infantry in marching column and field line', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const id = await page.evaluate(() => window.__RTS_DEBUG__.createFreshInfantryRegiment('france',950,900));
  await page.evaluate(() => window.RTS_SIM.step(.6));
  const role = await page.evaluate(id => window.__RTS_DEBUG__.drummerRoleV069(id), id);
  expect(role.column.behind).toBe(true);
  expect(role.field.behind).toBe(true);
  expect(role.column.drummer.ox).toBeLessThan(role.column.infantryRearX - 20);
  expect(role.field.drummer.ox).toBeLessThan(role.field.infantryRearX - 20);
  await page.evaluate(() => window.RTS_SIM.step(.2));
  const updated = await page.evaluate(id => window.__RTS_DEBUG__.drummerRoleV069(id), id);
  expect(updated.attackMode).toBe('support');
  expect(updated.alive).toBe(true);
  expect(errors).toEqual([]);
});

test('enemy contact switches the whole battalion into a coherent combat formation', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  const ids = await page.evaluate(() => {
    const french = window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1030,1120);
    const british = window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',1160,1120);
    window.__RTS_DEBUG__.setRegimentBayonetV069(french);
    window.__RTS_DEBUG__.selectRegiment(french);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1240,1120,0);
    return {french,british};
  });
  await page.evaluate(() => window.RTS_SIM.step(.5));
  const state = await page.evaluate(id => window.__RTS_DEBUG__.formationState(id), ids.french);
  const drummer = await page.evaluate(id => window.__RTS_DEBUG__.drummerRoleV069(id), ids.french);
  expect(state.engagement).toBeTruthy();
  expect(state.engagement.mode).toBe('bayonet');
  expect(state.combatFormation).toBe(true);
  expect(['combat-advance','close-combat']).toContain(state.phase);
  expect(drummer.column.behind).toBe(true);
  expect(drummer.attackMode).toBe('support');
  await testInfo.attach('v069-close-combat-cohesion', { body:await page.screenshot({fullPage:true}), contentType:'image/png' });
  expect(errors).toEqual([]);
});
