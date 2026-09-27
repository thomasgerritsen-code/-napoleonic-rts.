const { test, expect } = require('@playwright/test');

async function openCombat(page) {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(() => {
    let seed=314159265;
    Math.random=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  });
  await page.goto('/?test=combat-lock', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM?.step &&
    window.__RTS_DEBUG__?.motionSystemV070 &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.setRegimentBayonetV069
  ));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

async function setupLockedContact(page, staleX, nearX, nearY=1120) {
  return page.evaluate(({staleX,nearX,nearY})=>{
    const french=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1030,1120);
    const stale=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',staleX,1120);
    const near=window.__RTS_DEBUG__.createFreshInfantryRegiment('britain',nearX,nearY);
    window.__RTS_DEBUG__.setRegimentBayonetV069(french);
    window.__RTS_DEBUG__.selectRegiment(french);
    window.__RTS_DEBUG__.orderSelectedWithFacing(1280,1120,0);
    getRegiment(french).engagementLockV070={enemyGroupId:stale,lockedAt:elapsed};
    return {french,stale,near};
  }, {staleX,nearX,nearY});
}

test('expired regiment lock yields immediately to a nearer valid regiment', async ({page}) => {
  const errors=await openCombat(page);
  const ids=await setupLockedContact(page,1440,1230);
  await page.evaluate(()=>refreshEngagementStatesV069());
  const state=await page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV070(id),ids.french);
  expect(state.engagement?.enemyGroupId).toBe(ids.near);
  expect(state.engagement?.enemyGroupId).not.toBe(ids.stale);
  expect(state.engagement?.stableGroupLock).toBe(true);
  expect(errors).toEqual([]);
});

test('valid in-range lock remains stable and combat movement stays continuous', async ({page}) => {
  const errors=await openCombat(page);
  const ids=await setupLockedContact(page,1230,1190,1200);
  await page.evaluate(()=>refreshEngagementStatesV069());
  const before=await page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV070(id),ids.french);
  await page.evaluate(()=>window.RTS_SIM.step(.1));
  const after=await page.evaluate(id=>window.__RTS_DEBUG__.motionSystemV070(id),ids.french);
  const previous=new Map(before.members.map(unit=>[unit.id,unit]));
  const maxStep=Math.max(...after.members.map(unit=>{
    const prior=previous.get(unit.id);
    return prior ? Math.hypot(unit.x-prior.x,unit.y-prior.y) : 0;
  }));
  expect(after.engagement?.enemyGroupId).toBe(ids.stale);
  expect(after.engagement?.stableGroupLock).toBe(true);
  expect(maxStep).toBeLessThan(13);
  expect((await page.evaluate(()=>window.__RTS_DEBUG__.motionStatsV070())).teleportViolations).toBe(0);
  expect(errors).toEqual([]);
});
