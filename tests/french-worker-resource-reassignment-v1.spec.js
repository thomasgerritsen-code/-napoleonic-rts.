const { test, expect } = require('@playwright/test');

async function openGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.getState &&
    window.__RTS_DEBUG__?.assignWorkerToNearest &&
    window.__RTS_DEBUG__?.livingResourceIds &&
    window.__RTS_DEBUG__?.depleteResource &&
    window.__RTS_DEBUG__?.moveWorker
  ));
  return pageErrors;
}

const state = page => page.evaluate(() => window.__RTS_DEBUG__.getState());

test('French worker continues same resource type, gathers, then stops safely when exhausted', async ({ page }) => {
  const errors = await openGame(page);
  const assignments = await page.evaluate(() => ({
    france: window.__RTS_DEBUG__.assignWorkerToNearest('france', 'wood'),
    britain: window.__RTS_DEBUG__.assignWorkerToNearest('britain', 'food')
  }));
  expect(assignments.france).not.toBeNull();
  expect(assignments.britain).not.toBeNull();

  await page.evaluate(resourceId => {
    window.__RTS_DEBUG__.depleteResource(resourceId);
    window.__RTS_DEBUG__.tick(0.1);
  }, assignments.france.resourceId);

  let snapshot = await state(page);
  let frenchWorker = snapshot.france.units.find(unit => unit.id === assignments.france.workerId);
  let britishWorker = snapshot.britain.units.find(unit => unit.id === assignments.britain.workerId);
  expect(frenchWorker.preferredResourceType).toBe('wood');
  expect(frenchWorker.resourceTargetId).not.toBe(assignments.france.resourceId);
  expect(frenchWorker.resourceTargetId).not.toBeNull();
  expect(britishWorker.resourceTargetId).toBe(assignments.britain.resourceId);

  await page.evaluate(({ id, x, y }) => {
    window.__RTS_DEBUG__.teleportUnit(id, x, y);
    for (let i = 0; i < 6; i += 1) window.__RTS_DEBUG__.tick(0.5);
  }, { id: frenchWorker.id, x: frenchWorker.targetX, y: frenchWorker.targetY });
  snapshot = await state(page);
  frenchWorker = snapshot.france.units.find(unit => unit.id === assignments.france.workerId);
  expect(frenchWorker.task).toBe('return');

  const exhaustion = await page.evaluate(() => {
    const availableResourceIds = window.__RTS_DEBUG__.livingResourceIds('wood');
    const exhaustedResourceIds = [];
    for (let remaining = availableResourceIds.length; remaining > 0; remaining -= 1) {
      const assignment = window.__RTS_DEBUG__.assignWorkerToNearest('france', 'wood');
      if (!assignment) break;
      if (exhaustedResourceIds.includes(assignment.resourceId)) {
        throw new Error(`Resource ${assignment.resourceId} was selected twice`);
      }
      window.__RTS_DEBUG__.depleteResource(assignment.resourceId);
      exhaustedResourceIds.push(assignment.resourceId);
      window.__RTS_DEBUG__.tick(0.1);
    }
    return { availableResourceIds, exhaustedResourceIds };
  });
  expect(exhaustion.availableResourceIds.length).toBeGreaterThan(0);
  expect(exhaustion.exhaustedResourceIds).toHaveLength(exhaustion.availableResourceIds.length);
  expect(new Set(exhaustion.exhaustedResourceIds).size).toBe(exhaustion.availableResourceIds.length);

  snapshot = await state(page);
  frenchWorker = snapshot.france.units.find(unit => unit.id === assignments.france.workerId);
  britishWorker = snapshot.britain.units.find(unit => unit.id === assignments.britain.workerId);
  expect(frenchWorker.task).toBeNull();
  expect(frenchWorker.resourceTargetId).toBeNull();
  expect(britishWorker.resourceTargetId).toBe(assignments.britain.resourceId);

  await page.evaluate(() => window.__RTS_DEBUG__.tick(2));
  const settled = (await state(page)).france.units.find(unit => unit.id === assignments.france.workerId);
  await page.evaluate(() => window.__RTS_DEBUG__.tick(2));
  const stable = (await state(page)).france.units.find(unit => unit.id === assignments.france.workerId);
  expect(settled.task).toBeNull();
  expect(settled.resourceTargetId).toBeNull();
  expect(stable.task).toBeNull();
  expect(stable.resourceTargetId).toBeNull();
  expect(stable.x).toBeCloseTo(settled.x, 5);
  expect(stable.y).toBeCloseTo(settled.y, 5);
  expect(stable.targetX).toBeCloseTo(stable.x, 5);
  expect(stable.targetY).toBeCloseTo(stable.y, 5);

  const moveAccepted = await page.evaluate(({ id, x, y }) => {
    const accepted = window.__RTS_DEBUG__.moveWorker(id, x + 120, y);
    window.__RTS_DEBUG__.tick(1);
    return accepted;
  }, { id: stable.id, x: stable.x, y: stable.y });
  const moved = (await state(page)).france.units.find(unit => unit.id === assignments.france.workerId);
  expect(moveAccepted).toBe(true);
  expect(Math.hypot(moved.x - stable.x, moved.y - stable.y)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
